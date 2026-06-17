# Changelog

All notable changes to WRouter will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-06-18

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

## [1.0.1] - 2025-06-15

### 🐛 Fixed
- Fixed database migration issues
- Improved error handling for invalid API keys
- Fixed CORS configuration for production deployments

## [1.0.0] - 2025-06-10

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
