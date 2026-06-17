BT = chr(96)  # backtick
BT3 = BT * 3  # triple backtick

content = f"""# WRouter

> Unified AI routing layer \u2014 one API to rule all LLM providers.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Status](https://img.shields.io/badge/status-production--ready-brightgreen)

WRouter is a self-hosted API gateway that sits between your applications and multiple AI providers. Send requests to a single OpenAI-compatible endpoint and let WRouter handle provider routing, automatic fallbacks, cost optimization, and usage analytics \u2014 all through a beautiful admin dashboard.

---

## \u2728 Features

- **Unified API** \u2014 Single OpenAI-compatible endpoint for all providers. Switch models without changing your application code.
- **Multi-Provider Support** \u2014 Route requests across OpenAI, Anthropic, Google, and other LLM providers through one interface.
- **Smart Combos** \u2014 Chain multiple providers into fallback sequences. If the primary provider fails, the next one picks up automatically.
- **Admin Dashboard** \u2014 Full-featured web UI for managing providers, API keys, usage analytics, and request logs.
- **Usage Analytics** \u2014 Track token consumption, request counts, latency, and costs across all providers and models.
- **Token Saver** \u2014 Optimize token usage with intelligent caching and response compression strategies.
- **Rate Limiting** \u2014 Per-key and per-provider rate limits to protect your budgets and stay within provider quotas.

---

## \U0001f680 Quick Start

### Option A: Docker (Recommended)

{BT3}bash
cd wrouter
docker compose up -d
{BT3}

The app will be available at http://localhost:3000.

### Option B: Manual Setup

{BT3}bash
# Clone the repository
git clone https://github.com/your-org/wrouter.git
cd wrouter

# Install dependencies
npm install

# Build the application
npm run build

# Start the production server
npm run start
{BT3}

The app will be available at http://localhost:3000.

---

## \u2699\ufe0f Configuration

Create a {BT}.env{BT} file in the project root:

{BT3}env
PORT=3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
JWT_SECRET=*** Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| {BT}PORT{BT} | No | {BT}3000{BT} | Port the server listens on |
| {BT}NEXT_PUBLIC_BASE_URL{BT} | Yes | \u2014 | Public-facing URL of your WRouter instance |
| {BT}JWT_SECRET{BT} | Yes | \u2014 | Secret key used to sign authentication tokens. Use a strong random value. |

---

## \U0001f4e1 API Reference

WRouter exposes an OpenAI-compatible API so your existing integrations work without modification.

### Authentication

All API requests require a Bearer token in the {BT}Authorization{BT} header:

{BT3}
Authorization: Bearer *** API keys from the **Dashboard \u2192 API Keys** page.

### POST /api/v1/chat/completions

Send a chat completion request. The payload follows the OpenAI specification.

**Example:**

{BT3}bash
curl -X POST http://localhost:3000/api/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer *** \\
  -d '{{
    "model": "gpt-4o",
    "messages": [
      {{ "role": "system", "content": "You are a helpful assistant." }},
      {{ "role": "user", "content": "Hello!" }}
    ],
    "temperature": 0.7
  }}'
{BT3}

**Response:**

{BT3}json
{{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1717000000,
  "model": "gpt-4o",
  "choices": [
    {{
      "index": 0,
      "message": {{
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      }},
      "finish_reason": "stop"
    }}
  ],
  "usage": {{
    "prompt_tokens": 20,
    "completion_tokens": 9,
    "total_tokens": 29
  }}
}}
{BT3}

### GET /api/v1/models

List all models available through your configured providers.

**Example:**

{BT3}bash
curl http://localhost:3000/api/v1/models \\
  -H "Authorization: Bearer ***wr-your-api-key-here"
{BT3}

**Response:**

{BT3}json
{{
  "object": "list",
  "data": [
    {{ "id": "gpt-4o", "object": "model", "owned_by": "openai" }},
    {{ "id": "claude-sonnet-4-20250514", "object": "model", "owned_by": "anthropic" }},
    {{ "id": "gemini-2.5-pro", "object": "model", "owned_by": "google" }}
  ]
}}
{BT3}

---

## \U0001f3d7\ufe0f Architecture

{BT3}
Client App
    \u2502
    \u25bc
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502        WRouter Gateway          \u2502
\u2502   POST /api/v1/chat/completions \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u252c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
               \u2502
         Routing Engine
         \u250c\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2510
         \u25bc            \u25bc
      Combo A      Combo B
      (chain)      (chain)
         \u2502            \u2502
      \u250c\u2500\u2500\u253c\u2500\u2500\u2510      \u250c\u2500\u2500\u253c\u2500\u2500\u2510
      \u25bc  \u25bc  \u25bc      \u25bc  \u25bc  \u25bc
     P1  P2  P3   P4  P5  P6
{BT3}

- **Routing Engine** \u2014 Evaluates incoming requests against configured routes and selects the appropriate provider or combo.
- **Provider Fallback Chains (Combos)** \u2014 Group multiple providers into ordered sequences. If Provider A returns an error or times out, the request automatically falls through to Provider B, then C \u2014 with no client-side retry logic needed.
- **Providers** \u2014 Individual adapter modules that normalize each vendor's API into the unified internal format.

---

## \U0001f5a5\ufe0f Dashboard

The admin dashboard at {BT}http://localhost:3000/dashboard{BT} provides full control over your WRouter instance:

| Section | Description |
|---|---|
| **Provider Management** | Add, edit, enable/disable AI providers and configure their endpoints and credentials |
| **API Key Management** | Generate, revoke, and scope API keys with per-key rate limits and model access |
| **Usage Analytics** | Visualize token usage, request volume, latency, and cost breakdowns over time |
| **Request Logs** | Inspect individual requests with full payload traces, provider responses, and timing data |
| **Visual Canvas** | Drag-and-drop interface for designing routing combos and fallback chains |

---

## \U0001f512 Security

WRouter is built with security as a first-class concern:

- **Password Hashing** \u2014 All passwords hashed with bcrypt (configurable salt rounds)
- **Token Generation** \u2014 API keys generated using {BT}crypto.randomBytes{BT} for cryptographic strength
- **Rate Limiting** \u2014 Configurable per-key and per-IP rate limits to prevent abuse
- **Security Headers** \u2014 Helmet-style headers ({BT}X-Content-Type-Options{BT}, {BT}X-Frame-Options{BT}, {BT}Referrer-Policy{BT}, etc.)
- **CORS Policy** \u2014 Strict origin allowlisting for cross-origin requests
- **Secure Cookies** \u2014 {BT}HttpOnly{BT}, {BT}Secure{BT}, {BT}SameSite{BT} cookie attributes for session management

---

## \U0001f4be Backup

WRouter stores its data in a local database. To back up your configuration and usage history:

### Manual Backup

{BT3}bash
# Stop the application (optional, for consistency)
docker compose stop

# Copy the database file
cp data/wrouter.db backups/wrouter-$(date +%Y%m%d).db

# Restart if stopped
docker compose start
{BT3}

### Docker Volume Backup

{BT3}bash
docker compose exec wrouter tar czf /tmp/wrouter-backup.tar.gz /app/data
docker compose cp wrouter:/tmp/wrouter-backup.tar.gz ./backups/
{BT3}

> **Tip:** Automate backups with a cron job to run daily:
> {BT3}cron
> 0 2 * * * cp /path/to/wrouter/data/wrouter.db /path/to/backups/wrouter-$(date +\\%Y\\%m\\%d).db
> {BT3}

---

## \U0001f6e0\ufe0f Development

Run WRouter in development mode with hot reload:

{BT3}bash
# Install dependencies
npm install

# Start the development server
npm run dev
{BT3}

The app will be available at http://localhost:3000 with hot module replacement enabled. Changes to source files will trigger automatic rebuilds.

---

## \U0001f4c4 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with \u2764\ufe0f by the Wekanz team
</p>
"""

with open(r"E:\MyApps\WekanzRouter\wrouter\README.md", "w", encoding="utf-8") as f:
    f.write(content)

print(f"Written {len(content)} bytes successfully")
