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

// Enable WAL mode for better performance
sqlite.pragma("journal_mode = WAL");
// Prevent "database is locked" under concurrent access
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });

/**
 * Initialize database tables and indexes.
 * Uses CREATE IF NOT EXISTS — safe to run on every boot.
 * No ALTER TABLE migrations — schema is defined in its final form here.
 */
export function initializeDatabase() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL,
      api_key TEXT,
      models TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      type TEXT NOT NULL DEFAULT 'custom',
      format TEXT NOT NULL DEFAULT 'openai',
      connection_strategy TEXT NOT NULL DEFAULT 'priority',
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
      allowed_models TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      last_used_at TEXT
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
      is_streaming INTEGER NOT NULL DEFAULT 0,
      cost_usd TEXT,
      error TEXT,
      request_detail TEXT,
      response_detail TEXT
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
      provider_id TEXT REFERENCES providers(id),
      provider TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      name TEXT,
      email TEXT,
      priority INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      error_count INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      last_error_at TEXT,
      rate_limit INTEGER,
      rate_limit_window INTEGER,
      current_usage INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      rate_limited_until TEXT,
      max_errors INTEGER NOT NULL DEFAULT 5,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_pricing (
      id TEXT PRIMARY KEY,
      model_pattern TEXT NOT NULL,
      provider_prefix TEXT,
      input_price_per_m TEXT NOT NULL DEFAULT '0',
      output_price_per_m TEXT NOT NULL DEFAULT '0',
      cached_input_price_per_m TEXT,
      display_name TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      updated_at TEXT NOT NULL
    );
  `);

  // ─── Indexes ───
  // Providers
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS providers_prefix_unique ON providers(prefix)`);

  // Request logs
  sqlite.exec(`CREATE INDEX IF NOT EXISTS timestamp_idx ON request_logs(timestamp)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS provider_id_idx ON request_logs(provider_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS api_key_id_idx ON request_logs(api_key_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS connection_id_idx ON request_logs(connection_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS model_idx ON request_logs(model)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS status_idx ON request_logs(status)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS is_streaming_idx ON request_logs(is_streaming)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS timestamp_status_idx ON request_logs(timestamp, status)`);

  // Provider connections
  sqlite.exec(`CREATE INDEX IF NOT EXISTS pc_provider_idx ON provider_connections(provider)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS pc_provider_id_idx ON provider_connections(provider_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS pc_provider_active_idx ON provider_connections(provider, is_active)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS pc_provider_id_active_idx ON provider_connections(provider_id, is_active)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS pc_priority_idx ON provider_connections(priority)`);

  // Model pricing
  sqlite.exec(`CREATE INDEX IF NOT EXISTS mp_model_pattern_idx ON model_pricing(model_pattern)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS mp_provider_prefix_idx ON model_pricing(provider_prefix)`);

  // ─── Seed defaults ───
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
