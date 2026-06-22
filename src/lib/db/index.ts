import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

// Bootstrap secrets on first boot (generate random JWT_SECRET if not set)
// Must run before any module that depends on JWT_SECRET loads.
import { bootstrapSecrets } from "../bootstrap";
bootstrapSecrets();

const DATA_DIR = path.join(process.cwd(), "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, "wrouter.db");

const sqlite = new Database(DB_PATH);

// WAL mode allows concurrent readers + 1 writer without blocking.
sqlite.pragma("journal_mode = WAL");

// busy_timeout: when the DB is locked, SQLite retries for up to 5 seconds
// before throwing "database is locked". Essential for concurrent access
// (e.g., dev server hot reload + API requests + background operations).
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });

// Guard: ensure initialization runs only once per process
let _initialized = false;

// Initialize database tables
export function initializeDatabase() {
  if (_initialized) return;
  _initialized = true;
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL,
      api_key TEXT,
      models TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'custom',
      format TEXT NOT NULL DEFAULT 'openai',
      connection_strategy TEXT NOT NULL DEFAULT 'priority'
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
      api_key_id TEXT,
      connection_id TEXT,
      tokens_in INTEGER,
      tokens_out INTEGER,
      latency_ms INTEGER,
      status TEXT NOT NULL,
      error TEXT,
      request_detail TEXT,
      response_detail TEXT,
      is_streaming INTEGER NOT NULL DEFAULT 0,
      cost_usd TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_connections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      name TEXT,
      email TEXT,
      priority INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      data TEXT NOT NULL DEFAULT '{}',
      provider_id TEXT REFERENCES providers(id),
      error_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      last_error_at TEXT,
      rate_limit INTEGER,
      rate_limit_window INTEGER,
      current_usage INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      rate_limited_until TEXT,
      max_errors INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_providers_prefix ON providers(prefix) WHERE prefix != '';
    CREATE INDEX IF NOT EXISTS pc_provider_idx ON provider_connections(provider);
    CREATE INDEX IF NOT EXISTS pc_provider_active_idx ON provider_connections(provider, is_active);
    CREATE INDEX IF NOT EXISTS pc_priority_idx ON provider_connections(priority);
    CREATE INDEX IF NOT EXISTS pc_provider_id_idx ON provider_connections(provider_id);
    CREATE INDEX IF NOT EXISTS pc_provider_id_active_idx ON provider_connections(provider_id, is_active);
    CREATE INDEX IF NOT EXISTS connection_id_idx ON request_logs(connection_id);
  `);

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
