# Changelog

All notable changes to WRouter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
