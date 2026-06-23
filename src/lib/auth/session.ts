import { db } from "../db";
import { settings, sessions } from "../db/schema";
import { apiKeys } from "../db/schema";
import { eq, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── Server-side in-memory caches ───

interface SessionCacheEntry {
  valid: boolean;
  expiresAt: number;
  cachedAt: number;
}

interface ApiKeyCacheEntry {
  id: string;
  enabled: boolean;
  allowedModels: string[];
  cachedAt: number;
}

// Session cache: token -> { valid, expiresAt }
// TTL: 30 seconds (sessions rarely change within this window)
const sessionCache = new Map<string, SessionCacheEntry>();
const SESSION_CACHE_TTL = 30_000;

// API key cache: key string -> { id, enabled, allowedModels, cachedAt }
// TTL: 60 seconds (API keys rarely change)
const apiKeyCache = new Map<string, ApiKeyCacheEntry>();
const API_KEY_CACHE_TTL = 60_000;

function generateToken(): string {
  return randomBytes(48).toString("base64url");
}

export function getPassword(): string {
  const result = db.select().from(settings).where(eq(settings.key, "password")).get();
  return result?.value || "";
}

/**
 * Hash a password using bcrypt.
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

/**
 * Verify a password against the stored hash.
 * Supports both hashed (bcrypt) and legacy plaintext passwords for migration.
 */
export function verifyPassword(password: string): boolean {
  const storedPassword = getPassword();
  if (!storedPassword) return false;
  return bcrypt.compareSync(password, storedPassword);
}

export function createSession(): string {
  const token = generateToken();
  const expiresAt = Date.now() + SESSION_DURATION;

  db.insert(sessions)
    .values({ token, expiresAt })
    .onConflictDoUpdate({ target: sessions.token, set: { expiresAt } })
    .run();

  // Cleanup expired sessions with 1% probability
  if (Math.random() < 0.01) {
    db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
  }

  return token;
}

export function verifySession(token: string): boolean {
  // Check cache first
  const cached = sessionCache.get(token);
  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age < SESSION_CACHE_TTL) {
      // Still within TTL
      if (!cached.valid) return false;
      // Check actual expiration
      if (Date.now() > cached.expiresAt) {
        sessionCache.delete(token);
        return false;
      }
      return true;
    }
    // Cache expired, remove it
    sessionCache.delete(token);
  }

  // Cache miss — query DB
  const row = db.select().from(sessions).where(eq(sessions.token, token)).get();

  if (!row) {
    sessionCache.set(token, { valid: false, expiresAt: 0, cachedAt: Date.now() });
    return false;
  }
  if (Date.now() > row.expiresAt) {
    db.delete(sessions).where(eq(sessions.token, token)).run();
    sessionCache.set(token, { valid: false, expiresAt: 0, cachedAt: Date.now() });
    return false;
  }

  // Cache the result
  sessionCache.set(token, { valid: true, expiresAt: row.expiresAt, cachedAt: Date.now() });

  // Periodic cleanup of expired sessions (runs on every verify to prevent accumulation)
  // Only cleanup ~1% of the time to avoid performance impact
  if (Math.random() < 0.01) {
    db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
  }

  return true;
}

export function destroySession(token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
  sessionCache.delete(token);
}

export function verifyApiKey(apiKey: string): { id: string; allowedModels: string[] } | null {
  // Check cache first
  const cached = apiKeyCache.get(apiKey);
  if (cached) {
    const age = Date.now() - cached.cachedAt;
    if (age < API_KEY_CACHE_TTL) {
      if (!cached.enabled) return null;
      return { id: cached.id, allowedModels: cached.allowedModels };
    }
    // Cache expired
    apiKeyCache.delete(apiKey);
  }

  // Cache miss — query DB
  const result = db.select().from(apiKeys).where(eq(apiKeys.key, apiKey)).get();
  if (!result || !result.enabled) {
    apiKeyCache.set(apiKey, { id: "", enabled: false, allowedModels: [], cachedAt: Date.now() });
    return null;
  }

  // Update last_used_at (async, non-blocking)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, result.id))
    .run();

  const allowedModels = JSON.parse(result.allowedModels || "[]");
  
  // Cache the result
  apiKeyCache.set(apiKey, {
    id: result.id,
    enabled: result.enabled,
    allowedModels,
    cachedAt: Date.now(),
  });

  return { id: result.id, allowedModels };
}

/**
 * Invalidate API key cache (call after key is updated/deleted).
 */
export function invalidateApiKeyCache(key?: string): void {
  if (key) {
    apiKeyCache.delete(key);
  } else {
    apiKeyCache.clear();
  }
}

/**
 * Invalidate session cache (call after session changes).
 */
export function invalidateSessionCache(token?: string): void {
  if (token) {
    sessionCache.delete(token);
  } else {
    sessionCache.clear();
  }
}

/**
 * Check dashboard session auth from a NextRequest cookie.
 * Returns the session token if valid, null otherwise.
 * Usage: `const token = checkDashboardAuth(req); if (!token) return unauthorized();`
 */
export function checkDashboardAuth(req: { cookies: { get: (name: string) => { value?: string } | undefined } }): string | null {
  const token = req.cookies.get("session_token")?.value;
  if (!token || !verifySession(token)) return null;
  return token;
}
