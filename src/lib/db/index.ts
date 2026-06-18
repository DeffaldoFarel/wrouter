import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "wrouter.db");

const sqlite = new Database(DB_PATH);

// Enable WAL mode for better performance
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });

// Initialize database tables
export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      models TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS combos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      models TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      allowed_models TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      model TEXT,
      provider_id TEXT,
      combo_id TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      latency_ms INTEGER,
      status TEXT NOT NULL,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migration: add prefix column if not exists
  try {
    sqlite.exec(`ALTER TABLE providers ADD COLUMN prefix TEXT NOT NULL DEFAULT ''`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: add unique index on prefix (ignore if exists)
  try {
    sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_prefix ON providers(prefix) WHERE prefix != ''`);
  } catch {
    // Index already exists, ignore
  }

  // Migration: add api_key_id column to request_logs if not exists
  try {
    sqlite.exec(`ALTER TABLE request_logs ADD COLUMN api_key_id TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: add type column to providers if not exists
  try {
    sqlite.exec(`ALTER TABLE providers ADD COLUMN type TEXT NOT NULL DEFAULT 'custom'`);
  } catch {
    // Column already exists, ignore
  }

  // Mark known aggregators (OpenRouter-style: baseUrl contains openrouter.ai)
  try {
    sqlite.exec(`UPDATE providers SET type='apikey' WHERE base_url LIKE '%openrouter.ai%' AND type='custom'`);
  } catch {
    // ignore
  }

  // Migration: add allowed_models column to api_keys if not exists
  try {
    sqlite.exec(`ALTER TABLE api_keys ADD COLUMN allowed_models TEXT NOT NULL DEFAULT '[]'`);
  } catch {
    // Column already exists, ignore
  }

  // Seed default settings if not exist
  const defaultSettings = [
    { key: "password", value: bcrypt.hashSync("qwertyui", 10) },
    { key: "port", value: "20128" },
    { key: "rtk_enabled", value: "false" },
    { key: "caveman_enabled", value: "false" },
    { key: "log_retention_days", value: "60" },
  ];

  const insertSetting = sqlite.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );

  for (const setting of defaultSettings) {
    insertSetting.run(setting.key, setting.value);
  }
}

export function generateApiKey(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "wkz-";
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(randomInt(chars.length));
  }
  return result;
}

// Initialize on first import
initializeDatabase();
