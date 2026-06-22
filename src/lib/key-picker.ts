/**
 * Key Picker — selects which API key to use for a provider request.
 *
 * Strategy (per provider.connectionStrategy):
 *   "priority"    → highest priority value among available connections
 *   "round-robin" → least recently used among available connections
 *   "random"      → random pick among available connections
 *
 * On failure: track error, auto-disable after maxErrors, 429 → immediate skip.
 *
 * Inspired by GenflowAi/9router connection picker.
 */
import { db } from "./db";
import { providerConnections, providers } from "./db/schema";
import { eq, and, isNull, lte, lt, or, asc, sql, notInArray } from "drizzle-orm";
import { safeDecryptApiKey } from "./crypto";
import { v4 as uuidv4 } from "uuid";

// Maximum retry attempts when fallback to next key

// ─── Types ───

export interface SelectedKey {
  connectionId: string;
  apiKey: string;
  providerId: string;
}

export interface KeyPickResult {
  /** The selected key, or null if no key available */
  key: SelectedKey | null;
  /** If a key was picked, this is its connection ID for usage tracking */
  connectionId: string | null;
  /** Reason why no key was available (when key is null) */
  reason: string | null;
}

// ─── Helpers ───

function isNow(): string {
  return new Date().toISOString();
}

/**
 * Check if a connection is currently rate-limited.
 *
 * Two mechanisms:
 *  1. Explicit `rateLimitedUntil` timestamp (set by upstream 429 with Retry-After).
 *  2. Usage-based: `currentUsage >= rateLimit` within `rateLimitWindow` seconds of `lastUsedAt`.
 *
 * The window is calculated FORWARD from `lastUsedAt` — the connection is rate-limited
 * only while we are still within `lastUsedAt + rateLimitWindow`. Once the window expires,
 * `recordUsage` will reset `currentUsage` to 0 on the next request.
 */
function isRateLimited(conn: typeof providerConnections.$inferSelect): boolean {
  // Explicit rateLimitedUntil timestamp (e.g. set on 429 with Retry-After)
  if (conn.rateLimitedUntil) {
    return new Date(conn.rateLimitedUntil) > new Date();
  }
  // Usage-based rate limiting
  if (conn.rateLimit && conn.rateLimitWindow && conn.currentUsage >= conn.rateLimit) {
    if (conn.lastUsedAt) {
      // Window ends at lastUsedAt + rateLimitWindow seconds
      const windowEnd = new Date(conn.lastUsedAt).getTime() + conn.rateLimitWindow * 1000;
      if (Date.now() < windowEnd) {
        return true; // Still within active window and at max usage
      }
      // Window expired — connection is NOT rate-limited; recordUsage() will reset currentUsage on next call
    }
  }
  return false;
}

/**
 * Check if a connection has exceeded its error threshold.
 */
function isDisabledByErrors(conn: typeof providerConnections.$inferSelect): boolean {
  return conn.errorCount >= conn.maxErrors;
}

/**
 * Get all active API key connections for a provider, ordered by priority.
 *
 * @param providerId — provider to look up connections for
 * @param excludeConnectionIds — connection IDs to filter out (e.g., already-tried keys
 *   in the current request's failover loop). Useful for I4 per-provider key rotation.
 */
function getAvailableConnections(
  providerId: string,
  excludeConnectionIds?: string[],
): typeof providerConnections.$inferSelect[] {
  const now = isNow();
  const excludes = excludeConnectionIds?.filter(Boolean) ?? [];

  const conditions = [
    eq(providerConnections.providerId, providerId),
    eq(providerConnections.isActive, true),
    eq(providerConnections.authType, "apikey"),
    // Not rate-limited
    or(
      isNull(providerConnections.rateLimitedUntil),
      lte(providerConnections.rateLimitedUntil, now),
    ),
    // Not disabled by errors
    lt(providerConnections.errorCount, providerConnections.maxErrors),
  ];

  if (excludes.length > 0) {
    conditions.push(notInArray(providerConnections.id, excludes));
  }

  return db
    .select()
    .from(providerConnections)
    .where(and(...conditions))
    .orderBy(asc(providerConnections.priority))
    .all();
}

// ─── Key Picker ───

/**
 * Pick the best available API key for a provider based on its connection strategy.
 *
 * @param providerId — provider to pick a key for
 * @param strategy — \"priority\" | \"round-robin\" | \"random\" (defaults to \"priority\")
 * @param excludeConnectionIds — connection IDs to skip (e.g., already-tried keys
 *   in the current request's failover loop). Used by I4 per-provider key rotation.
 *
 * Returns null if no key is available (all rate-limited, disabled, excluded, or don't exist).
 */
export function pickConnection(
  providerId: string,
  strategy?: string,
  excludeConnectionIds?: string[],
): KeyPickResult {
  const connections = getAvailableConnections(providerId, excludeConnectionIds);

  if (connections.length === 0) {
    return { key: null, connectionId: null, reason: "No available connections" };
  }

  const connStrategy = strategy || "priority";
  let selected: typeof providerConnections.$inferSelect;

  switch (connStrategy) {
    case "priority":
      // Highest priority = lowest number (1 is highest)
      selected = connections.reduce((best, c) => {
        const bp = best.priority ?? 999;
        const cp = c.priority ?? 999;
        return cp < bp ? c : best;
      });
      break;

    case "round-robin":
      // Least recently used
      selected = connections.reduce((best, c) => {
        if (!best.lastUsedAt) return best;
        if (!c.lastUsedAt) return c; // Never used = pick this one
        return new Date(c.lastUsedAt) < new Date(best.lastUsedAt) ? c : best;
      }, connections[0]);
      break;

    case "random":
      selected = connections[Math.floor(Math.random() * connections.length)];
      break;

    default:
      selected = connections[0];
  }

  // Extract API key from the data JSON blob
  const data = JSON.parse(selected.data || "{}");
  const encryptedKey = data.apiKey as string | undefined;
  if (!encryptedKey) {
    return { key: null, connectionId: null, reason: "Connection has no API key" };
  }

  const apiKey = safeDecryptApiKey(encryptedKey);

  // Record usage
  recordUsage(selected.id);

  return {
    key: {
      connectionId: selected.id,
      apiKey,
      providerId,
    },
    connectionId: selected.id,
    reason: null,
  };
}

/**
 * Record that a connection was used (update lastUsedAt and currentUsage).
 */
function recordUsage(connectionId: string): void {
  const now = isNow();
  const nowMs = Date.now();

  // Read connection to check if rate-limit window has expired
  const conn = db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, connectionId))
    .get();

  // Reset currentUsage to 1 (this request) when window expires
  if (
    conn &&
    conn.rateLimit &&
    conn.rateLimitWindow &&
    conn.lastUsedAt
  ) {
    const windowEnd = new Date(conn.lastUsedAt).getTime() + conn.rateLimitWindow * 1000;
    if (nowMs >= windowEnd) {
      // Window expired — reset usage counter, then this request becomes the new window's first hit
      db.update(providerConnections)
        .set({ lastUsedAt: now, currentUsage: 1 })
        .where(eq(providerConnections.id, connectionId))
        .run();
      return;
    }
  }

  // Standard path: increment usage atomically
  db.update(providerConnections)
    .set({ lastUsedAt: now })
    .where(eq(providerConnections.id, connectionId))
    .run();
  db.run(sql`UPDATE provider_connections SET current_usage = COALESCE(current_usage, 0) + 1 WHERE id = ${connectionId}`);
}

/**
 * Record an error for a connection.
 * On 429: immediately mark as rate-limited.
 * On other errors: increment errorCount, auto-disable if threshold exceeded.
 */
export function recordError(connectionId: string, statusCode: number): void {
  const now = isNow();
  const conn = db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, connectionId))
    .get();

  if (!conn) return;

  if (statusCode === 429) {
    // Rate limited — skip this connection until next window
    db.update(providerConnections)
      .set({
        rateLimitedUntil: new Date(Date.now() + 60 * 1000).toISOString(), // 1 min cooldown
        lastErrorCode: String(statusCode),
        lastErrorAt: now,
      })
      .where(eq(providerConnections.id, connectionId))
      .run();
  } else {
    // Client error (401, 403) or server error (5xx) — increment errorCount
    db.update(providerConnections)
      .set({
        errorCount: conn.errorCount + 1,
        lastErrorCode: String(statusCode),
        lastErrorAt: now,
      })
      .where(eq(providerConnections.id, connectionId))
      .run();
  }
}

/**
 * Pick a fallback connection when the current one fails.
 * Excludes the failed connection from selection.
 */
export function pickFallback(
  providerId: string,
  excludeConnectionId: string,
  strategy?: string,
): KeyPickResult {
  const allConnections = getAvailableConnections(providerId);

  // Filter out the excluded one
  const available = allConnections.filter(
    (c) => c.id !== excludeConnectionId,
  );

  if (available.length === 0) {
    return { key: null, connectionId: null, reason: "No fallback connections available" };
  }

  const connStrategy = strategy || "priority";
  let selected: typeof providerConnections.$inferSelect;

  switch (connStrategy) {
    case "priority":
      selected = available.reduce((best, c) => {
        const bp = best.priority ?? 999;
        const cp = c.priority ?? 999;
        return cp < bp ? c : best;
      });
      break;
    case "round-robin":
      selected = available.reduce((best, c) => {
        if (!best.lastUsedAt) return best;
        if (!c.lastUsedAt) return c;
        return new Date(c.lastUsedAt) < new Date(best.lastUsedAt) ? c : best;
      }, available[0]);
      break;
    case "random":
      selected = available[Math.floor(Math.random() * available.length)];
      break;
    default:
      selected = available[0];
  }

  const data = JSON.parse(selected.data || "{}");
  const encryptedKey = data.apiKey as string | undefined;
  if (!encryptedKey) {
    return { key: null, connectionId: null, reason: "Fallback connection has no API key" };
  }

  const apiKey = safeDecryptApiKey(encryptedKey);
  recordUsage(selected.id);

  return {
    key: { connectionId: selected.id, apiKey, providerId },
    connectionId: selected.id,
    reason: null,
  };
}

/**
 * Reset error counts and usage for all connections of a provider.
 * Called periodically or manually by admin.
 */
export function resetConnectionStats(providerId: string): void {
  db.update(providerConnections)
    .set({
      errorCount: 0,
      currentUsage: 0,
      lastErrorCode: null,
      lastErrorAt: null,
      rateLimitedUntil: null,
    })
    .where(eq(providerConnections.providerId, providerId))
    .run();
}

/**
 * Get connection statistics for a provider (for admin UI).
 */
export function getConnectionStats(providerId: string) {
  const connections = db
    .select()
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.providerId, providerId),
        eq(providerConnections.authType, "apikey"),
      ),
    )
    .orderBy(asc(providerConnections.priority))
    .all();

  return connections.map((c) => ({
    id: c.id,
    name: c.name,
    priority: c.priority,
    isActive: c.isActive,
    errorCount: c.errorCount,
    maxErrors: c.maxErrors,
    currentUsage: c.currentUsage,
    rateLimit: c.rateLimit,
    lastUsedAt: c.lastUsedAt,
    lastErrorCode: c.lastErrorCode,
    isRateLimited: isRateLimited(c),
    isDisabled: isDisabledByErrors(c),
  }));
}

// ─── API Key Connection CRUD ───

export interface CreateApiKeyConnectionInput {
  providerId: string;
  name: string;
  apiKey: string;
  priority?: number;
  rateLimit?: number;
  rateLimitWindow?: number;
  maxErrors?: number;
}

/**
 * Create a new API key connection for a provider.
 */
export function createApiKeyConnection(input: CreateApiKeyConnectionInput): typeof providerConnections.$inferSelect {
  const now = isNow();
  const id = uuidv4();

  // Get provider prefix for the NOT NULL provider column
  const providerRow = db.select().from(providers).where(eq(providers.id, input.providerId)).get();
  const providerPrefix = providerRow?.prefix || input.providerId;

  const row = {
    id,
    providerId: input.providerId,
    provider: providerPrefix,
    authType: "apikey" as const,
    name: input.name,
    email: null,
    priority: input.priority ?? null,
    isActive: true,
    errorCount: 0,
    lastErrorCode: null,
    lastErrorAt: null,
    rateLimit: input.rateLimit ?? null,
    rateLimitWindow: input.rateLimitWindow ?? null,
    currentUsage: 0,
    lastUsedAt: null,
    rateLimitedUntil: null,
    maxErrors: input.maxErrors ?? 5,
    data: JSON.stringify({ apiKey: input.apiKey }),
    createdAt: now,
    updatedAt: now,
  };

  db.insert(providerConnections).values(row).run();

  const created = db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id))
    .get();

  return created!;
}

/**
 * Delete an API key connection.
 */
export function deleteApiKeyConnection(id: string): boolean {
  const result = db
    .delete(providerConnections)
    .where(
      and(
        eq(providerConnections.id, id),
        eq(providerConnections.authType, "apikey"),
      ),
    )
    .run();
  return result.changes > 0;
}

/**
 * Toggle active state of a connection.
 */
export function toggleConnection(id: string): typeof providerConnections.$inferSelect | null {
  const conn = db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id))
    .get();

  if (!conn) return null;

  db.update(providerConnections)
    .set({ isActive: !conn.isActive, updatedAt: isNow() })
    .where(eq(providerConnections.id, id))
    .run();

  return db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id))
    .get() || null;
}

/**
 * Update a connection's properties (name, priority, rateLimit, etc.).
 */
export function updateApiKeyConnection(
  id: string,
  updates: {
    name?: string;
    priority?: number | null;
    rateLimit?: number | null;
    rateLimitWindow?: number | null;
    maxErrors?: number;
    apiKey?: string;
  },
): typeof providerConnections.$inferSelect | null {
  const conn = db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id))
    .get();

  if (!conn) return null;

  const dbUpdates: Record<string, unknown> = { updatedAt: isNow() };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
  if (updates.rateLimit !== undefined) dbUpdates.rateLimit = updates.rateLimit;
  if (updates.rateLimitWindow !== undefined) dbUpdates.rateLimitWindow = updates.rateLimitWindow;
  if (updates.maxErrors !== undefined) dbUpdates.maxErrors = updates.maxErrors;
  if (updates.apiKey !== undefined) {
    const data = JSON.parse(conn.data || "{}");
    data.apiKey = updates.apiKey;
    dbUpdates.data = JSON.stringify(data);
  }

  db.update(providerConnections)
    .set(dbUpdates)
    .where(eq(providerConnections.id, id))
    .run();

  return db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id))
    .get() || null;
}
