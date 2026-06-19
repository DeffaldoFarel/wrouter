import { db } from "../db";
import { settings, sessions } from "../db/schema";
import { apiKeys } from "../db/schema";
import { eq, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
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
  
  // Check if stored password is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
  if (storedPassword.startsWith("$2")) {
    return bcrypt.compareSync(password, storedPassword);
  }
  
  // Legacy plaintext comparison (for migration from old versions)
  return password === storedPassword;
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
  const row = db.select().from(sessions).where(eq(sessions.token, token)).get();

  if (!row) return false;
  if (Date.now() > row.expiresAt) {
    db.delete(sessions).where(eq(sessions.token, token)).run();
    return false;
  }

  // Periodic cleanup of expired sessions (runs on every verify to prevent accumulation)
  // Only cleanup ~1% of the time to avoid performance impact
  if (Math.random() < 0.01) {
    db.delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
  }

  return true;
}

export function destroySession(token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

export function verifyApiKey(apiKey: string): { id: string; allowedModels: string[] } | null {
  const result = db.select().from(apiKeys).where(eq(apiKeys.key, apiKey)).get();
  if (!result || !result.enabled) return null;

  // Update last_used_at
  db.update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, result.id))
    .run();

  const allowedModels = JSON.parse(result.allowedModels || "[]");
  return { id: result.id, allowedModels };
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
