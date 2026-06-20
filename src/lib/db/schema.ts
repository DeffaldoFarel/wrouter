import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// Providers table
export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().unique(),
  baseUrl: text("base_url").notNull(),
  // Single API key (kept for backward compat with single-key providers).
  // New multi-key providers store keys in provider_connections table instead.
  apiKey: text("api_key"),
  models: text("models").notNull().default("[]"), // JSON array of model strings
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  // "custom" = direct OpenAI-compatible provider (manual model list)
  // "apikey" = aggregator with its own model catalog API (e.g. OpenRouter)
  type: text("type").notNull().default("custom"),
  // Upstream API format/dialect this provider speaks.
  //   "openai"    → standard OpenAI-compatible (POST /v1/chat/completions)  ← default
  //   "anthropic" → Anthropic native        (POST /v1/messages, x-api-key header)
  //   "gemini"    → Google Gemini native    (POST /v1beta/models/.../generateContent) — reserved
  format: text("format").notNull().default("openai"),
  // Connection strategy for multi-key support (inspired by GenflowAi/9router)
  //   "priority"  → pick highest priority key among available ones (default)
  //   "round-robin" → cycle through keys evenly
  //   "random"    → pick a random available key
  connectionStrategy: text("connection_strategy").notNull().default("priority"),
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
  isStreaming: integer("is_streaming", { mode: "boolean" }).notNull().default(false),
  // Estimated cost in USD (calculated by in-code pricing engine)
  costUsd: text("cost_usd"),
  error: text("error"),
  requestDetail: text("request_detail"), // JSON: full request body
  responseDetail: text("response_detail"), // JSON: full response body from provider
}, (table) => ({
  // Indexes for common queries
  timestampIdx: index("timestamp_idx").on(table.timestamp),
  providerIdIdx: index("provider_id_idx").on(table.providerId),
  apiKeyIdIdx: index("api_key_id_idx").on(table.apiKeyId),
  modelIdx: index("model_idx").on(table.model),
  statusIdx: index("status_idx").on(table.status),
  isStreamingIdx: index("is_streaming_idx").on(table.isStreaming),
  // Composite indexes for complex queries
  timestampStatusIdx: index("timestamp_status_idx").on(table.timestamp, table.status),
}));

// Sessions table
export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});

// Settings table
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─── Provider Connections (OAuth accounts & multiple API keys) ───
// Stores OAuth tokens and API keys for each connected account.
// The `data` column is a JSON blob containing all sensitive/dynamic fields:
//   accessToken, refreshToken, expiresAt, expiresIn, tokenType, scope,
//   idToken, lastRefreshAt, projectId, apiKey, testStatus, lastError,
//   lastErrorAt, rateLimitedUntil, errorCode, consecutiveUseCount,
//   providerSpecificData (nested JSON for provider-specific fields).
//
// Design inspired by GenflowAi/9router: hybrid storage — high-level queryable fields
// are first-class columns, all OAuth/dynamic fields packed into JSON `data`.
export const providerConnections = sqliteTable(
  "provider_connections",
  {
    id: text("id").primaryKey(),
    // FK to providers table — enables multi-key per provider
    providerId: text("provider_id").references(() => providers.id),
    // Provider type: "claude" | "codex" | "github" | "cursor" | "kiro" | "openai" | "anthropic" | "gemini" | ...
    // Used for OAuth connections (when providerId is null for non-provider-specific accounts)
    provider: text("provider"),
    // Auth method: "oauth" | "apikey" | "access_token" | "cookie"
    authType: text("auth_type").notNull(),
    name: text("name"),
    email: text("email"),
    // Failover ordering within a provider (1 = highest priority)
    priority: integer("priority"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    // ─── Error tracking & rate limiting (multi-key failover) ───
    errorCount: integer("error_count").notNull().default(0),
    // HTTP error code that caused the last failure (401, 429, 500, etc.)
    lastErrorCode: text("last_error_code"),
    lastErrorAt: text("last_error_at"),
    // Rate limit: max requests within the window
    rateLimit: integer("rate_limit"),
    rateLimitWindow: integer("rate_limit_window"), // in seconds
    currentUsage: integer("current_usage").notNull().default(0),
    lastUsedAt: text("last_used_at"),
    // When set, this connection is skipped until the timestamp passes
    rateLimitedUntil: text("rate_limited_until"),
    // Auto-disable after this many consecutive errors (default 5)
    maxErrors: integer("max_errors").notNull().default(5),
    // JSON blob with all sensitive/dynamic fields
    data: text("data").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => ({
    providerIdx: index("pc_provider_idx").on(table.provider),
    providerIdIdx: index("pc_provider_id_idx").on(table.providerId),
    providerActiveIdx: index("pc_provider_active_idx").on(table.provider, table.isActive),
    providerIdActiveIdx: index("pc_provider_id_active_idx").on(table.providerId, table.isActive),
    priorityIdx: index("pc_priority_idx").on(table.priority),
  })
);
