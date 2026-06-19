# WRouter

> Unified AI routing layer — one API to rule all LLM providers.

![Version](https://img.shields.io/badge/version-1.4.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-beta-yellow)

WRouter is a self-hosted API gateway that sits between your applications and multiple AI providers. Send requests to a single OpenAI-compatible endpoint and let WRouter handle provider routing, automatic fallbacks, cost optimization, and usage analytics — all through a beautiful admin dashboard.

---

## ✨ Features

- **Unified API** — Single OpenAI-compatible endpoint for all providers. Switch models without changing your application code.
- **Multi-Provider Support** — Route requests across OpenAI, Anthropic, Google, DeepSeek, OpenRouter, and other LLM providers through one interface.
- **Smart Combos** — Chain multiple providers into fallback sequences. If the primary provider fails, the next one picks up automatically.
- **Visual Canvas** — Drag-and-drop interface for designing routing combos and fallback chains with intuitive flow diagrams.
- **OpenRouter Provider Sort** — Automatically route to the cheapest, fastest, or highest-throughput provider on OpenRouter.
- **RTK (Response Token Keeper)** — Intelligent response caching and token compression to reduce costs without losing quality.
- **Caveman Mode** — Aggressive response compression that strips filler words while preserving meaning, saving up to 40% tokens.
- **Admin Dashboard** — Full-featured web UI for managing providers, API keys, usage analytics, and request logs.
- **Usage Analytics** — Track token consumption, request counts, latency, and costs across all providers and models.
- **SSRF Guard** — Built-in security layer that prevents Server-Side Request Forgery attacks on custom provider endpoints.
- **In-App Changelog** — Track version history and feature updates directly from the dashboard.

---

## 🔌 Supported Providers

WRouter supports any OpenAI-compatible API out of the box. Pre-configured providers include:

| Provider | Type | Notes |
|---|---|---|
| **OpenAI** | API Key | GPT-4o, GPT-4.1, o-series, etc. |
| **Anthropic** | API Key | Claude 4, Claude Sonnet, etc. |
| **OpenRouter** | API Key | Access to 300+ models via single key |
| **DeepSeek** | API Key | DeepSeek V4 Flash, V4 Pro |
| **Google Gemini** | API Key | Gemini 3.5 Flash, 3.1 Pro, 2.5 series |
| **Custom (OpenAI-compatible)** | API Key / Open | Any provider with OpenAI-compatible endpoint |

> **Adding a new provider?** Just enter the base URL and API key in the dashboard — WRouter handles the rest.

---

## 🚀 Quick Start

### Option A: Docker (Recommended)

```bash
cd wrouter
docker compose up -d
```

The app will be available at http://localhost:20128.

### Option B: Manual Setup

```bash
# Clone the repository
git clone https://github.com/your-org/wrouter.git
cd wrouter

# Install dependencies
npm install

# Build the application
npm run build

# Start the production server
npm run start
```

The app will be available at http://localhost:20128.

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
PORT=20128
NEXT_PUBLIC_BASE_URL=http://localhost:20128
JWT_SECRET=***
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `20128` | Port the server listens on |
| `NEXT_PUBLIC_BASE_URL` | Yes | — | Public-facing URL of your WRouter instance |
| `JWT_SECRET` | Yes | — | Secret key used to sign authentication tokens. Use a strong random value. |

---

## 📡 API Reference

WRouter exposes an OpenAI-compatible API so your existing integrations work without modification.

### Authentication

All API requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer ***
```

Generate API keys from the **Dashboard → API Keys** page.

### POST /api/v1/chat/completions

Send a chat completion request. The payload follows the OpenAI specification.

**Example:**

```bash
curl -X POST http://localhost:20128/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ***" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "Hello!" }
    ],
    "temperature": 0.7
  }'
```

**Response:**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1717000000,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 9,
    "total_tokens": 29
  }
}
```

### GET /api/v1/models

List all models available through your configured providers.

**Example:**

```bash
curl http://localhost:20128/api/v1/models \
  -H "Authorization: Bearer ***"
```

**Response:**

```json
{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "owned_by": "openai" },
    { "id": "claude-sonnet-4-20250514", "object": "model", "owned_by": "anthropic" },
    { "id": "gemini-2.5-pro", "object": "model", "owned_by": "google" }
  ]
}
```

---

## 🏗️ Architecture

```
Client App
    │
    ▼
┌────────────────────────────────────┐
│        WRouter Gateway             │
│   POST /api/v1/chat/completions   │
└───────────────┬────────────────────┘
               │
         Routing Engine
         ┌─────┴──────┐
         ▼            ▼
      Combo A      Combo B
      (chain)      (chain)
         │            │
      ┌──┼──┐      ┌──┼──┐
      ▼  ▼  ▼      ▼  ▼  ▼
     P1  P2  P3   P4  P5  P6
```

- **Routing Engine** — Evaluates incoming requests against configured routes and selects the appropriate provider or combo.
- **Provider Fallback Chains (Combos)** — Group multiple providers into ordered sequences. If Provider A returns an error or times out, the request automatically falls through to Provider B, then C — with no client-side retry logic needed.
- **Providers** — Individual adapter modules that normalize each vendor's API into the unified internal format.

---

## 🖥️ Dashboard

The admin dashboard at `http://localhost:20128/dashboard` provides full control over your WRouter instance:

| Section | Description |
|---|---|
| **Provider Management** | Add, edit, enable/disable AI providers and configure their endpoints and credentials |
| **API Key Management** | Generate, revoke, and scope API keys with per-key rate limits and model access |
| **Usage Analytics** | Visualize token usage, request volume, latency, and cost breakdowns over time |
| **Request Logs** | Inspect individual requests with full payload traces, provider responses, and timing data |
| **Visual Canvas** | Drag-and-drop interface for designing routing combos and fallback chains |

---

## 🔒 Security

WRouter is built with security as a first-class concern:

- **SSRF Guard** — Prevents Server-Side Request Forgery by validating and blocking internal/private IP addresses in provider URLs
- **Password Hashing** — All passwords hashed with bcrypt (configurable salt rounds)
- **Token Generation** — API keys generated using `crypto.randomBytes` for cryptographic strength
- **Rate Limiting** — Configurable per-key and per-IP rate limits to prevent abuse
- **Security Headers** — Helmet-style headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc.)
- **CORS Policy** — Strict origin allowlisting for cross-origin requests
- **Secure Cookies** — `HttpOnly`, `Secure`, `SameSite` cookie attributes for session management

---

## 💾 Backup

WRouter stores its data in a local database. To back up your configuration and usage history:

### Manual Backup

```bash
# Stop the application (optional, for consistency)
docker compose stop

# Copy the database file
cp data/wrouter.db backups/wrouter-$(date +%Y%m%d).db

# Restart if stopped
docker compose start
```

### Docker Volume Backup

```bash
docker compose exec wrouter tar czf /tmp/wrouter-backup.tar.gz /app/data
docker compose cp wrouter:/tmp/wrouter-backup.tar.gz ./backups/
```

> **Tip:** Automate backups with a cron job to run daily:
> ```cron
> 0 2 * * * cp /path/to/wrouter/data/wrouter.db /path/to/backups/wrouter-$(date +\%Y\%m\%d).db
> ```

---

## 🛠️ Development

Run WRouter in development mode with hot reload:

```bash
# Install dependencies
npm install

# Start the development server
npm run dev
```

The app will be available at http://localhost:20128 with hot module replacement enabled. Changes to source files will trigger automatic rebuilds.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ by the Wekanz team
</p>
