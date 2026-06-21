# Changelog

## [1.7.0] - 2026-06-21

### 🔒 Security Hardening (Major Release)

**57 issues fixed across 7 audit phases.** This release closes all CRITICAL security gaps and is required for any public-facing deployment.

#### 🚨 Authentication & Authorization (CRITICAL)
- **Auth on all OAuth admin endpoints** — `GET/PATCH/DELETE` `/api/oauth/connections/*` and `GET/POST` `/api/oauth/[provider]/[action]/*` were unauthenticated; anyone on the network could list/inject/delete OAuth tokens
- **Auth on multi-key endpoints** — `GET/POST/PUT/DELETE/PATCH` `/api/providers/[id]/keys/*` were unauthenticated; attackers could inject API keys into the proxy
- **CSRF/Origin verification** improved across mutating endpoints

#### 🛡️ Data Exposure (CRITICAL)
- **Gemini API key moved out of URL** — was leaked via `?key=...` query param to logs/CDNs. Now uses `x-goog-api-key` header
- **SSRF guard at proxy hot path** — defends against DB compromise / malicious restore (e.g. `http://169.254.169.254/` cloud metadata)

#### 🗝️ Encryption & Operations (CRITICAL)
- **ENCRYPTION_KEY split from JWT_SECRET** — JWT can now rotate without losing encrypted API keys (backward compatible — auto-pins on first upgrade)
- **Atomic migrations** — wrapped in `BEGIN IMMEDIATE / COMMIT` so power loss mid-migration rolls back instead of corrupting DB
- **Restore endpoint streaming** — was buffering 1.2GB into RAM (cap 100MB → unusable on production). Now streams to disk with 2GB cap
- **Orphan logs preserved** — `request_logs.provider_id` set to NULL on provider delete (audit trail intact)
- **Rate-limit window bug fixed** — keys were getting permanently rate-limited due to inverted comparison + missing reset

#### ✅ Input Validation (Hardening)
- `POST /api/keys` — name length (1-64), no control chars, allowedModels shape
- `POST /api/combos` — name/slug/models validated, length caps
- `PUT /api/combos/[id]` — partial validation
- `POST /api/providers/[id]/keys` — apiKey 8-1000 chars, priority/maxErrors/rateLimit ranges
- OAuth `import/exchange` — token length cap (100k chars)

#### ⚡ Rate Limiting (Hardening)
- `dashboardLimiter` (60/min/IP) on `/api/providers/fetch-models`, `test-model`, `health`
- `oauthLimiter` (30/min/IP) on `/api/oauth/[provider]/[action]/*`
- Existing `loginLimiter`, `chatLimiter`, `resetLimiter` preserved

#### 🐛 Bug Fixes
- **SSE `[DONE]` marker** added after synthetic usage chunk (clients like Cursor/Continue no longer hang)
- **Mid-stream errors trigger `recordError`** — flaky providers/keys now properly penalized
- **Multi-key rotation in fallback chain** — providers with multiple keys now exhausted before falling back to next provider
- **`connection_id` persisted to `request_logs`** — multi-key debugging now possible
- **Provider DELETE cleans up `provider_connections`** — fixed FK constraint failure
- **Custom provider auto-creates `provider_connections`** entry on create/update
- **Factory reset deletes `provider_connections` first** (FK order)
- **Backup temp file race fixed** (Windows: UUID name + close-event unlink)
- **CSV export escapes `\r`** (Windows line endings)
- **SSE reload no longer no-op** (`setFilter(cur => cur)` replaced with direct `fetchAll`)
- **Edit dialog uses controlled state** (no more `document.getElementById`)

#### ✨ New Features
- **Slim Backup non-blocking** — uses `ATTACH + INSERT INTO SELECT` (1-2 sec) instead of `DELETE + VACUUM` (30-120 sec event-loop block)
- **SQL aggregation** for `/api/usage` and `/api/keys/[id]/stats` — was loading all logs into JS, now uses `GROUP BY` + indexed scans
- **`apiFetch` wrapper** — handles 401 globally, redirects to login on session expire
- **Confirmation dialogs** — replaced `confirm()` browser dialogs with shadcn AlertDialog (3 places)
- **Pagination cap** on `/api/logs` (max 200) — prevents `?limit=999999` DoS
- **AlertDialog confirmations** in Bahasa Indonesia for delete API key, delete OAuth, delete all models

#### 🎨 UX & Polish
- **Add Custom Provider modal simplified** — removed API key input + format select (now via detail page)
- **Toggle handlers check `res.ok`** — no more silent failure on combo/key toggle
- **Numeric inputs constrained** with `min`/`step` on priority/maxErrors
- **Login form** has proper `<Label>` for password (a11y)
- **`aria-label`** added to icon-only buttons (delete, reveal API key)
- **Cookie `secure`** detected via `x-forwarded-proto` header (more reliable than `NODE_ENV`)

#### 🧹 Code Quality
- Dead `src/lib/auth/middleware.ts` deleted
- Duplicate `checkAuth` helpers (6 files) → use shared `checkDashboardAuth`
- Duplicate `maskApiKey` (2 files) → `src/lib/utils/mask-key.ts`
- Duplicate `KNOWN_OAUTH_PROVIDERS` (3 files) → `src/lib/constants/oauth-providers.ts`
- Duplicate token-saver descriptions (2 files) → `src/lib/constants/token-saver-copy.ts`
- Dead SDK adapter code blocks (~120 lines) removed from proxy.ts
- Unused `MAX_FALLBACK_RETRIES` removed
- Empty catch blocks now log at debug level

#### 📚 Schema & Database
- `model_pricing` table added to Drizzle schema (was DB-only)
- `provider_connections.provider` marked `notNull` (matches actual DB)
- `request_logs.connection_id` column + index added
- All NOT NULL constraints synced between Drizzle and SQLite

### 🔄 Migration Notes
- ENCRYPTION_KEY auto-pinned to existing JWT_SECRET on first upgrade — no data loss
- DB migrations are now atomic — safe to interrupt
- Existing API keys auto-migrated to `provider_connections` if not already done

---

## [1.6.1] - 2026-06-21

### 🐛 Bug Fixes
- **API Key Migration** — Auto-migrate existing `providers.apiKey` to `provider_connections` on app start (fixes old keys not showing in detail page)
- **API Key Provider Matching** — Match old providers by `baseUrl` fallback, not just `type=apikey` (fixes pre-multi-key providers showing as "Not set up")
- **Custom Provider API Key** — Auto-create `provider_connections` entry when custom provider is created/updated with API key
- **Factory Reset** — Delete `provider_connections` before `providers` to fix FK constraint failure
- **Backup Large Files** — Stream backup file instead of loading into memory (fixes crash on 1GB+ databases)

### ✨ New Features
- **Slim Backup** — Download backup without `request_logs` (98% smaller — 1.2GB → ~20MB)
- **Global API Key Migration** — Migrate ALL providers with `api_key` to multi-key system (not just specific providers)

---

All notable changes to WRouter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0] - 2026-06-21

### 🚀 New Features
- **MiMo Provider** — Added Xiaomi MiMo as API Key Provider (OpenAI-compatible, `api.xiaomimimo.com`)
- **Qwen Provider** — Added Alibaba Qwen Cloud as API Key Provider (OpenAI-compatible, `dashscope-intl.aliyuncs.com`)
- **Cost Tracking in Usage Page** — Cost column in recent requests table + cost in request detail panel
- **Provider-Reported Cost** — Prioritize actual cost from provider response (`usage.cost` / `usage.total_cost`), fallback to internal estimation
- **Interactive Connection Map** — Pan, zoom, fit view, and lock view controls
- **Split Custom Provider Buttons** — Separate "Add Anthropic Compatible" and "Add OpenAI Compatible" buttons

### 🏗️ Architecture
- **Raw Fetch Only (9router-style)** — Removed SDK adapter from proxy path; all providers use raw `fetch` for full response fidelity (usage, cost, reasoning_tokens preserved)
- **Google GenAI Raw Fetch** — Request/response translation (OpenAI ↔ Gemini format) without SDK dependency
- **Anthropic Raw Fetch** — Existing translator handles format conversion without SDK

### 🐛 Fixed
- **SDK Stream Usage = 0/0** — Fixed race condition where SDK usage Promise resolved before stream consumed (OpenRouter SDK stripped `usage.cost` field)
- **Cost Not Displayed** — Added `costUsd` to `/api/logs` response and Usage page table
- **Connection Map Controls Not Clickable** — Moved toolbar outside ReactFlow canvas with `z-10`
- **ReactFlow Controls Dark Mode** — Custom zoom buttons with Tailwind CSS variables instead of ReactFlow default white buttons

### 🎨 UI Changes
- **Custom Providers at Top** — Moved Custom Providers section above OAuth and API Key Providers
- **Usage Page Initial Load** — Reduced from 50 to 20 recent requests for faster load
- **Connection Map Edge Visibility** — Improved opacity (0.85 for enabled, 0.5 for offline) and stroke width
- **Controls Toolbar** — Single toolbar on left: Zoom In, Zoom Out, Fit View, Lock View

## [1.5.0] - 2026-06-20

### 🐛 Fixed
- **API Key "(deleted)" in Real-time** — SSE events now include resolved `apiKeyName` (was showing "(deleted)" for recent requests until page refresh)
- **React Hooks Violation** — Moved `useMemo` hooks before early returns in Usage page (fixed "Rendered more hooks than during the previous render" error)
- **JSON.parse Crash** — Added try/catch for `allowedModels` JSON parsing in API keys route (prevents crash on corrupt DB data)
- **Keys Stats Performance** — DB-level filtering with `and(eq, gte)` instead of loading all logs then filtering in JS
- **Restore Cache Staleness** — Database restore now invalidates in-memory provider cache and sends SSE `reload` event to connected clients
- **Settings Non-string Values** — Auto-coerce boolean/number values instead of silently skipping them

### ⚡ Performance
- **SSE Full Refetch Removed** — Each real-time log event no longer triggers 3 API calls (`/api/usage`, `/api/logs`, `/api/providers`) — ~90% reduction in network traffic during high-traffic periods
- **Selective Column Fetch** — `/api/usage` now only selects columns needed for aggregation (skips large `requestDetail`/`responseDetail` JSON) — ~60% less memory
- **Memoized Computations** — `providerMap`, status counts, and `loadMoreLogs` callback now properly memoized for smoother renders
- **Provider Map Memoization** — `useMemo` prevents recomputation on every render
- **Status Counts Single-pass** — Combined 3 array scans into one `useMemo` pass

### 🔧 Refactored
- **Shared Auth Helper** — Extracted duplicated `checkAuth()` from 12+ route files into `checkDashboardAuth()` in `lib/auth/session.ts`
- **Routes Updated** — `keys`, `keys/[id]`, `keys/[id]/stats`, `combos`, `settings`, `backup`, `restore`, `events`, `health`, `reset`, `providers`, `providers/[id]` all use shared auth helper

## [1.4.0] - 2026-06-19

### ✨ Added
- **Response Details Logging** — Full response JSON dari provider tersimpan di request logs (non-streaming: full body, streaming: summary usage + metadata)
- **Response Detail Display** — Section "Response Details" di Usage page sheet dengan format pretty-print JSON + tombol Copy
- **Request Details Full JSON** — Tombol "Copy full JSON" di Usage page sheet (selain "Copy body only")

### 🔧 Changed
- **Provider Detail Layout** — Search di kiri, Add model + button nempel kanan (`ml-auto`)
- **Add Model Field** — Lebar diperbesar ke `w-80` (320px) untuk input model name yang lebih panjang
- **Usage Detail Sheet** — Lebar diperbesar ke `max-w-3xl` (~768px) untuk tampilan JSON yang lebih nyaman dibaca

## [1.3.0] - 2026-06-18

### ✨ Added
- **Brand Provider Icons** — Logo asli OpenRouter, DeepSeek, Google AI Studio dari LobeHub di list/detail/setup pages
- **Connection Map Redesign** — Dual-column layout dengan bezier curves, marching ants animation untuk active connections, glow effects, dan legend overlay
- **Provider Model Health Check** — Tombol Test per model + Test All di provider detail (completions endpoint test, dengan latency)
- **Copy Model ID** — Setiap model di provider detail punya full ID `prefix/model-name` yang bisa di-copy
- **Combo Drag & Drop** — Reorder fallback chain dengan drag & drop, plus tombol move up/down
- **Combo Search** — Filter combos by name, slug, atau model
- **Usage Page** (rename dari Logs) — `/dashboard/logs` redirect ke `/dashboard/usage`
- **Real-time Live Indicator** — Wifi badge "Live" / "Reconnecting" di Usage page
- **Recent Requests Filter** — Filter by status (All/Success/Error/Fallback) dengan counter
- **Recent Requests Detail Sheet** — Klik row → buka right drawer dengan full info (Identity, Performance, Error)
- **Recent Requests API Key Column** — Tampilkan API key name yang dipakai per request
- **Recent Requests Pagination** — Load More button dengan total counter, real-time tetap jalan
- **Recent Requests CSV Export** — Export hasil filtered ke CSV (timestamp, key, provider, model, dll)
- **Health Check Status Filter** — Tabs All/Online/Error/Disabled dengan counter
- **Health Check Search & Sheet** — Search bar + detail Sheet dengan re-check action
- **Health Check Cache** — Hasil disimpan di localStorage 30 menit (no spam ke provider)
- **Settings Sidebar Navigation** — 6 sections (Account, General, Routing, Token Saver, Storage, Danger Zone)
- **Password Strength Indicator** — 5-bar visual + label (very weak → excellent)
- **Drag & Drop Restore** — File drop area dengan visual feedback
- **Sidebar Collapse** — Toggle 256px ↔ 68px dengan tooltips, persist di localStorage
- **Mobile Sidebar Drawer** — Sheet slide-in dari kiri di mobile dengan top bar
- **Sidebar Section Grouping** — Main / Monitoring / System sections
- **Vision / Multimodal Support** — Forward gambar (base64 & URL) ke provider yang mendukung vision
- **Multimodal Content Validation** — Validasi format OpenAI vision (text + image_url)
- **Anthropic Tool Blocks** — Pass-through untuk tool_result dan tool_use content blocks
- **Auto-update Stats** — Stats cards di Dashboard auto-refresh 30 detik
- **Dynamic Endpoint URL** — Base URL otomatis sesuai domain deployment (no more hardcoded localhost)
- **Logout Confirmation** — Dialog konfirmasi sebelum sign out

### 🔧 Changed
- **Dashboard Page** — Welcome header dengan greeting, system health badge, 4 stats cards, masked API keys dengan reveal toggle, quick links section
- **Providers List** — Stats overview, search, removed circular layout, brand icons, no auto-check (caching)
- **Provider Detail** — Breadcrumbs, brand icon header, stats card, sticky save bar, model search, API key reveal toggle
- **Provider Setup** — Brand icon, connection info card, progress indicator, security note
- **Combos Page** — Stats overview, visual fallback chain, drag-drop editor, better Add Models dialog
- **Usage Page** — Loading skeleton, brand icons di breakdown table, clickable rows, better empty state
- **Health Page** — Replaced auto-check with manual trigger + cache, stale warning, avg latency stat
- **Settings Page** — Sectioned navigation, Token Saver moved to its own section, log retention dropdown
- **Sidebar** — Logo with gradient icon, active indicator bar, hover animations, user badge, external links
- **Changelog** — Now parsed from CHANGELOG.md (single source of truth via changelog-parser.ts)
- **Log Retention** — Minimum 60 days (was 30) to align with Usage filter range
- **Time Display** — All hour-based charts use UTC parsing then convert to local timezone

### 🐛 Fixed
- **Content Validation** — Sekarang menerima array (multimodal), bukan hanya string
- **cURL Quick Config** — Quote tidak ditutup, typo `${acti...}` → `${activeApiKey}`
- **Toggle Collision** — Switch + active badge + refresh button tabrakan di provider card
- **Double Padding** — Card components punya intrinsic padding, hapus duplicate `p-4`/`p-5`
- **Marching Ants Stutter** — React Flow built-in animation conflict dengan custom CSS, fix dengan `animated: false` + `!important`
- **Hour Chart Timezone** — Chart "Requests per Hour" dan "Token Usage per Hour" sekarang sesuai timezone browser
- **Recent Requests Drop** — Real-time SSE tidak lagi drop log lama saat ada request baru (cap 500 untuk safety)

## [1.2.0] - 2026-06-18

### ✨ Added
- **Vision / Multimodal Support** — Forward gambar (base64 & URL) ke provider yang mendukung vision (GPT-4o, Claude 3, Gemini, dll)
- **Multimodal Content Validation** — Validasi format OpenAI vision (`text` + `image_url`) dengan batas ukuran ~7.5MB per image
- **Anthropic Tool Blocks** — Pass-through untuk `tool_result` dan `tool_use` content blocks
- **Forward-Compatible Content Types** — Content part type yang belum dikenal tetap di-forward ke provider

### 🐛 Fixed
- Content validation sekarang menerima array (multimodal), bukan hanya string

## [1.1.0] - 2026-06-18

### ✨ Added
- **DeepSeek Provider Support** — Native integration with DeepSeek API (DeepSeek V4 Flash, V4 Pro)
- **Google Gemini Provider Support** — Native integration with Google Gemini API (Gemini 3.5 Flash, 3.1 Pro, 2.5 series)
- **OpenRouter Provider Sort** — Automatic routing to cheapest, fastest, or highest-throughput provider
- **Provider Routing Preferences** — Configure OpenRouter to prioritize price, throughput, or latency
- **Visual Canvas** — Drag-and-drop interface for designing routing combos and fallback chains
- **RTK (Response Token Keeper)** — Intelligent response caching and token compression
- **Caveman Mode** — Aggressive response compression (up to 40% token savings) while preserving meaning
- **SSRF Guard** — Security layer preventing Server-Side Request Forgery on custom provider endpoints
- **In-App Changelog** — View version history directly in the dashboard
- **Auto Model Fetch** — Automatically fetch available models from provider APIs

### 🔧 Changed
- Improved provider setup flow with real-time model validation
- Enhanced dashboard UI with better visual feedback
- Optimized routing engine for faster fallback execution

### 🐛 Fixed
- Fixed provider timeout handling in combo chains
- Resolved API key encryption edge cases
- Fixed model selection persistence across page reloads

## [1.0.1] - 2026-06-17

### 🐛 Fixed
- Fixed database migration issues
- Improved error handling for invalid API keys
- Fixed CORS configuration for production deployments

## [1.0.0] - 2026-06-17

### ✨ Initial Release
- **Unified API** — Single OpenAI-compatible endpoint for all providers
- **Multi-Provider Support** — OpenAI, Anthropic, OpenRouter, and custom OpenAI-compatible providers
- **Smart Combos** — Provider fallback chains with automatic failover
- **Admin Dashboard** — Full-featured web UI for provider and API key management
- **Usage Analytics** — Track tokens, requests, latency, and costs
- **Request Logs** — Detailed request/response logging with timing data
- **API Key Management** — Generate, revoke, and scope API keys
- **Provider Management** — Add, edit, enable/disable providers
- **Security** — Password hashing, rate limiting, security headers, CORS policy

---

<p align="center">
  For detailed documentation, visit <a href="https://github.com/your-org/wrouter">GitHub Repository</a>
</p>
