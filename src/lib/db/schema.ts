import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Providers table
export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  apiKey: text("api_key").notNull(),
  models: text("models").notNull().default("[]"), // JSON array of model strings
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  // "custom" = direct OpenAI-compatible provider (manual model list)
  // "apikey" = aggregator with its own model catalog API (e.g. OpenRouter)
  type: text("type").notNull().default("custom"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Combos table
export const combos = sqliteTable("combos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  models: text("models").notNull().default("[]"), // JSON array of {model, provider_id, priority}
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// API Keys table
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  allowedModels: text("allowed_models").notNull().default("[]"), // JSON array of model strings, empty = all allowed
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

// Request logs table
export const requestLogs = sqliteTable("request_logs", {
  id: text("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  model: text("model"),
  providerId: text("provider_id"),
  comboId: text("combo_id"),
  apiKeyId: text("api_key_id"),  // which API key made this request
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  latencyMs: integer("latency_ms"),
  status: text("status").notNull(), // success | error | fallback
  error: text("error"),
}, (table) => ({
  // Indexes for common queries
  timestampIdx: index("timestamp_idx").on(table.timestamp),
  providerIdIdx: index("provider_id_idx").on(table.providerId),
  apiKeyIdIdx: index("api_key_id_idx").on(table.apiKeyId),
  modelIdx: index("model_idx").on(table.model),
  statusIdx: index("status_idx").on(table.status),
  // Composite indexes for complex queries
  timestampStatusIdx: index("timestamp_status_idx").on(table.timestamp, table.status),
}));

// Settings table
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
