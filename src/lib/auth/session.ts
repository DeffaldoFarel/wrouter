import { db } from "../db";
import { settings } from "../db/schema";
import { apiKeys } from "../db/schema";
import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

// Use a separate SQLite connection for sessions to avoid circular imports
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const sessionDb = new Database(path.join(DATA_DIR, "wrouter.db"));

// Ensure sessions table exists
sessionDb.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
`);

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
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

  sessionDb.prepare("INSERT OR REPLACE INTO sessions (token, expires_at) VALUES (?, ?)").run(token, expiresAt);

  // Cleanup expired sessions
  sessionDb.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

  return token;
}

export function verifySession(token: string): boolean {
  const row = sessionDb.prepare("SELECT expires_at FROM sessions WHERE token = ?").get(token) as { expires_at: number } | undefined;

  if (!row) return false;
  if (Date.now() > row.expires_at) {
    sessionDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return false;
  }

  // Periodic cleanup of expired sessions (runs on every verify to prevent accumulation)
  // Only cleanup ~1% of the time to avoid performance impact
  if (Math.random() < 0.01) {
    sessionDb.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  }

  return true;
}

export function destroySession(token: string): void {
  sessionDb.prepare("DELETE FROM sessions WHERE token = ?").run(token);
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
