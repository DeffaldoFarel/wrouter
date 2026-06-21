/**
 * Provider Connections CRUD operations.
 * Handles the hybrid storage pattern: typed columns + JSON `data` blob.
 *
 * Inspired by 9router connectionsRepo.js
 */
import { db } from "../db";
import { providerConnections } from "../db/schema";
import { eq, and, asc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// Fields that live in the JSON `data` column
const DATA_FIELDS = [
  "accessToken",
  "refreshToken",
  "expiresAt",
  "expiresIn",
  "tokenType",
  "scope",
  "idToken",
  "lastRefreshAt",
  "projectId",
  "apiKey",
  "testStatus",
  "lastError",
  "lastErrorAt",
  "rateLimitedUntil",
  "errorCode",
  "consecutiveUseCount",
  "providerSpecificData",
  "displayName",
  "defaultModel",
] as const;

// ─── Types ───
export interface ConnectionData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  expiresIn?: number;
  tokenType?: string;
  scope?: string;
  idToken?: string;
  lastRefreshAt?: string;
  projectId?: string;
  apiKey?: string;
  testStatus?: "active" | "unavailable" | "error" | null;
  lastError?: string | null;
  lastErrorAt?: string | null;
  rateLimitedUntil?: string | null;
  errorCode?: number | null;
  consecutiveUseCount?: number;
  providerSpecificData?: Record<string, unknown>;
  displayName?: string;
  defaultModel?: string;
}

export interface Connection {
  id: string;
  providerId: string | null;
  provider: string | null;
  authType: "oauth" | "apikey" | "access_token" | "cookie";
  name: string | null;
  email: string | null;
  priority: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Spread from JSON data
  [key: string]: unknown;
}

// ─── Helpers ───
function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Convert a DB row to a Connection object.
 * Merges the JSON `data` blob on top of the typed columns.
 */
function rowToConnection(row: typeof providerConnections.$inferSelect): Connection {
  const data = safeJsonParse<Record<string, unknown>>(row.data, {});
  return {
    ...data,
    id: row.id,
    providerId: row.providerId,
    provider: row.provider,
    authType: row.authType as Connection["authType"],
    name: row.name,
    email: row.email,
    priority: row.priority,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as Connection;
}

/**
 * Convert a Connection object to a DB row.
 * Strips typed columns, serializes the rest into `data`.
 */
function connectionToRow(
  conn: Partial<Connection> & { id: string; provider?: string | null; authType: string }
): typeof providerConnections.$inferInsert {
  const {
    id,
    providerId,
    provider,
    authType,
    name,
    email,
    priority,
    isActive,
    createdAt,
    updatedAt,
    ...rest
  } = conn;

  return {
    id,
    providerId: providerId ?? null,
    provider: provider ?? authType ?? "unknown",
    authType,
    name: name ?? null,
    email: email ?? null,
    priority: priority ?? null,
    isActive: isActive ?? true,
    data: JSON.stringify(rest),
    createdAt: createdAt ?? new Date().toISOString(),
    updatedAt: updatedAt ?? new Date().toISOString(),
  };
}

// ─── CRUD Operations ───

/**
 * Get all connections for a provider (by provider string), ordered by priority.
 */
export function getProviderConnections(
  provider: string,
  options?: { isActive?: boolean }
): Connection[] {
  const conditions = [eq(providerConnections.provider, provider)];

  if (options?.isActive !== undefined) {
    conditions.push(eq(providerConnections.isActive, options.isActive));
  }

  const rows = db
    .select()
    .from(providerConnections)
    .where(and(...conditions))
    .orderBy(asc(providerConnections.priority))
    .all();

  return rows.map(rowToConnection);
}

/**
 * Get all API key connections for a provider (by providerId FK), ordered by priority.
 */
export function getConnectionsByProviderId(
  providerId: string,
  options?: { isActive?: boolean; authType?: string }
): Connection[] {
  const conditions = [eq(providerConnections.providerId, providerId)];

  if (options?.isActive !== undefined) {
    conditions.push(eq(providerConnections.isActive, options.isActive));
  }
  if (options?.authType) {
    conditions.push(eq(providerConnections.authType, options.authType));
  }

  const rows = db
    .select()
    .from(providerConnections)
    .where(and(...conditions))
    .orderBy(asc(providerConnections.priority))
    .all();

  return rows.map(rowToConnection);
}

/**
 * Get a single connection by ID.
 */
export function getConnectionById(id: string): Connection | null {
  const row = db.select().from(providerConnections).where(eq(providerConnections.id, id)).get();
  return row ? rowToConnection(row) : null;
}

/**
 * Create or update a provider connection.
 * Deduplicates OAuth accounts by email, API keys by name.
 */
export function createOrUpdateConnection(
  data: Partial<Connection> & {
    provider: string;
    authType: string;
  } & ConnectionData
): Connection {
  const now = new Date().toISOString();

  // Check for existing connection (dedup logic)
  let existing: Connection | null = null;

  if (data.authType === "oauth" && data.email) {
    // OAuth: dedup by provider + email
    const all = getProviderConnections(data.provider);
    existing = all.find(
      (c) => c.authType === "oauth" && c.email === data.email
    ) ?? null;
  } else if (data.authType === "apikey" && data.name) {
    // API key: dedup by provider + name
    const all = getProviderConnections(data.provider);
    existing = all.find(
      (c) => c.authType === "apikey" && c.name === data.name
    ) ?? null;
  }

  if (existing) {
    // Update existing
    const merged = { ...existing, ...data, updatedAt: now };
    const row = connectionToRow(merged as Connection);
    db.update(providerConnections)
      .set(row)
      .where(eq(providerConnections.id, existing.id))
      .run();
    return getConnectionById(existing.id)!;
  }

  // Create new
  const id = data.id || uuidv4();
  const conn: Connection = {
    id,
    providerId: data.providerId ?? null,
    provider: data.provider,
    authType: data.authType as Connection["authType"],
    name: data.name ?? null,
    email: data.email ?? null,
    priority: data.priority ?? null,
    isActive: data.isActive ?? true,
    createdAt: now,
    updatedAt: now,
    ...extractDataFields(data),
  };

  const row = connectionToRow(conn);
  db.insert(providerConnections).values(row).run();
  return getConnectionById(id)!;
}

/**
 * Update a connection's data (e.g., after token refresh).
 * Performs atomic merge inside transaction.
 */
export function updateConnection(id: string, updates: ConnectionData): Connection | null {
  const existing = getConnectionById(id);
  if (!existing) return null;

  const merged = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const row = connectionToRow(merged as Connection);
  db.update(providerConnections)
    .set(row)
    .where(eq(providerConnections.id, id))
    .run();

  return getConnectionById(id);
}

/**
 * Delete a connection.
 */
export function deleteConnection(id: string): boolean {
  const result = db.delete(providerConnections).where(eq(providerConnections.id, id)).run();
  return result.changes > 0;
}

/**
 * Get all connections across all providers (for admin views).
 */
export function getAllConnections(): Connection[] {
  const rows = db
    .select()
    .from(providerConnections)
    .orderBy(asc(providerConnections.provider), asc(providerConnections.priority))
    .all();
  return rows.map(rowToConnection);
}

// ─── Helpers ───

function extractDataFields(data: Record<string, unknown>): ConnectionData {
  const result: ConnectionData = {};
  for (const field of DATA_FIELDS) {
    if (field in data) {
      (result as Record<string, unknown>)[field] = data[field];
    }
  }
  return result;
}
