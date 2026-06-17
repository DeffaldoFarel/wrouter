1|# WRouter
2|
3|> Unified AI routing layer — one API to rule all LLM providers.
4|
5|![Version](https://img.shields.io/badge/version-1.0.0-blue)
6|![License](https://img.shields.io/badge/license-MIT-green)
7|![Status](https://img.shields.io/badge/status-beta-yellow)
8|
9|WRouter is a self-hosted API gateway that sits between your applications and multiple AI providers. Send requests to a single OpenAI-compatible endpoint and let WRouter handle provider routing, automatic fallbacks, cost optimization, and usage analytics — all through a beautiful admin dashboard.
10|
11|---
12|
13|## ✨ Features
14|
15|- **Unified API** — Single OpenAI-compatible endpoint for all providers. Switch models without changing your application code.
16|- **Multi-Provider Support** — Route requests across OpenAI, Anthropic, Google, and other LLM providers through one interface.
17|- **Smart Combos** — Chain multiple providers into fallback sequences. If the primary provider fails, the next one picks up automatically.
18|- **Admin Dashboard** — Full-featured web UI for managing providers, API keys, usage analytics, and request logs.
19|- **Usage Analytics** — Track token consumption, request counts, latency, and costs across all providers and models.
20|- **Token Saver** — Optimize token usage with intelligent caching and response compression strategies.
21|- **Rate Limiting** — Per-key and per-provider rate limits to protect your budgets and stay within provider quotas.
22|
23|---
24|
25|## 🚀 Quick Start
26|
27|### Option A: Docker (Recommended)
28|
29|```bash
30|cd wrouter
31|docker compose up -d
32|```
33|
34|The app will be available at http://localhost:20128.
35|
36|### Option B: Manual Setup
37|
38|```bash
39|# Clone the repository
40|git clone https://github.com/your-org/wrouter.git
41|cd wrouter
42|
43|# Install dependencies
44|npm install
45|
46|# Build the application
47|npm run build
48|
49|# Start the production server
50|npm run start
51|```
52|
53|The app will be available at http://localhost:20128.
54|
55|---
56|
57|## ⚙️ Configuration
58|
59|Create a `.env` file in the project root:
60|
61|```env
62|PORT=20128
63|NEXT_PUBLIC_BASE_URL=http://localhost:20128
64|JWT_SECRET=***
65|```
66|
67|### Environment Variables
68|
69|| Variable | Required | Default | Description |
70||---|---|---|---|
71|| `PORT` | No | `20128` | Port the server listens on |
72|| `NEXT_PUBLIC_BASE_URL` | Yes | — | Public-facing URL of your WRouter instance |
73|| `JWT_SECRET` | Yes | — | Secret key used to sign authentication tokens. Use a strong random value. |
74|
75|---
76|
77|## 📡 API Reference
78|
79|WRouter exposes an OpenAI-compatible API so your existing integrations work without modification.
80|
81|### Authentication
82|
83|All API requests require a Bearer token in the `Authorization` header:
84|
85|```
86|Authorization: Bearer *** ```
87|
88|Generate API keys from the **Dashboard → API Keys** page.
89|
90|### POST /api/v1/chat/completions
91|
92|Send a chat completion request. The payload follows the OpenAI specification.
93|
94|**Example:**
95|
96|```bash
97|curl -X POST http://localhost:20128/api/v1/chat/completions \
98|  -H "Content-Type: application/json" \
99|  -H "Authorization: Bearer *** \
100|  -d '{
101|    "model": "gpt-4o",
102|    "messages": [
103|      { "role": "system", "content": "You are a helpful assistant." },
104|      { "role": "user", "content": "Hello!" }
105|    ],
106|    "temperature": 0.7
107|  }'
108|```
109|
110|**Response:**
111|
112|```json
113|{
114|  "id": "chatcmpl-abc123",
115|  "object": "chat.completion",
116|  "created": 1717000000,
117|  "model": "gpt-4o",
118|  "choices": [
119|    {
120|      "index": 0,
121|      "message": {
122|        "role": "assistant",
123|        "content": "Hello! How can I help you today?"
124|      },
125|      "finish_reason": "stop"
126|    }
127|  ],
128|  "usage": {
129|    "prompt_tokens": 20,
130|    "completion_tokens": 9,
131|    "total_tokens": 29
132|  }
133|}
134|```
135|
136|### GET /api/v1/models
137|
138|List all models available through your configured providers.
139|
140|**Example:**
141|
142|```bash
143|curl http://localhost:20128/api/v1/models \
144|  -H "Authorization: Bearer ***wkz-..."
145|```
146|
147|**Response:**
148|
149|```json
150|{
151|  "object": "list",
152|  "data": [
153|    { "id": "gpt-4o", "object": "model", "owned_by": "openai" },
154|    { "id": "claude-sonnet-4-20250514", "object": "model", "owned_by": "anthropic" },
155|    { "id": "gemini-2.5-pro", "object": "model", "owned_by": "google" }
156|  ]
157|}
158|```
159|
160|---
161|
162|## 🏗️ Architecture
163|
164|```
165|Client App
166|    │
167|    ▼
168|┌────────────────────────────────────┐
169|│        WRouter Gateway          │
170|│   POST /api/v1/chat/completions │
171|└───────────────┬─────────────────────┘
172|               │
173|         Routing Engine
174|         ┌─────┴──────┐
175|         ▼            ▼
176|      Combo A      Combo B
177|      (chain)      (chain)
178|         │            │
179|      ┌──┼──┐      ┌──┼──┐
180|      ▼  ▼  ▼      ▼  ▼  ▼
181|     P1  P2  P3   P4  P5  P6
182|```
183|
184|- **Routing Engine** — Evaluates incoming requests against configured routes and selects the appropriate provider or combo.
185|- **Provider Fallback Chains (Combos)** — Group multiple providers into ordered sequences. If Provider A returns an error or times out, the request automatically falls through to Provider B, then C — with no client-side retry logic needed.
186|- **Providers** — Individual adapter modules that normalize each vendor's API into the unified internal format.
187|
188|---
189|
190|## 🖥️ Dashboard
191|
192|The admin dashboard at `http://localhost:20128/dashboard` provides full control over your WRouter instance:
193|
194|| Section | Description |
195||---|---|
196|| **Provider Management** | Add, edit, enable/disable AI providers and configure their endpoints and credentials |
197|| **API Key Management** | Generate, revoke, and scope API keys with per-key rate limits and model access |
198|| **Usage Analytics** | Visualize token usage, request volume, latency, and cost breakdowns over time |
199|| **Request Logs** | Inspect individual requests with full payload traces, provider responses, and timing data |
200|| **Visual Canvas** | Drag-and-drop interface for designing routing combos and fallback chains |
201|
202|---
203|
204|## 🔒 Security
205|
206|WRouter is built with security as a first-class concern:
207|
208|- **Password Hashing** — All passwords hashed with bcrypt (configurable salt rounds)
209|- **Token Generation** — API keys generated using `crypto.randomBytes` for cryptographic strength
210|- **Rate Limiting** — Configurable per-key and per-IP rate limits to prevent abuse
211|- **Security Headers** — Helmet-style headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, etc.)
212|- **CORS Policy** — Strict origin allowlisting for cross-origin requests
213|- **Secure Cookies** — `HttpOnly`, `Secure`, `SameSite` cookie attributes for session management
214|
215|---
216|
217|## 💾 Backup
218|
219|WRouter stores its data in a local database. To back up your configuration and usage history:
220|
221|### Manual Backup
222|
223|```bash
224|# Stop the application (optional, for consistency)
225|docker compose stop
226|
227|# Copy the database file
228|cp data/wrouter.db backups/wrouter-$(date +%Y%m%d).db
229|
230|# Restart if stopped
231|docker compose start
232|```
233|
234|### Docker Volume Backup
235|
236|```bash
237|docker compose exec wrouter tar czf /tmp/wrouter-backup.tar.gz /app/data
238|docker compose cp wrouter:/tmp/wrouter-backup.tar.gz ./backups/
239|```
240|
241|> **Tip:** Automate backups with a cron job to run daily:
242|> ```cron
243|> 0 2 * * * cp /path/to/wrouter/data/wrouter.db /path/to/backups/wrouter-$(date +\%Y\%m\%d).db
244|> ```
245|
246|---
247|
248|## 🛠️ Development
249|
250|Run WRouter in development mode with hot reload:
251|
252|```bash
253|# Install dependencies
254|npm install
255|
256|# Start the development server
257|npm run dev
258|```
259|
260|The app will be available at http://localhost:20128 with hot module replacement enabled. Changes to source files will trigger automatic rebuilds.
261|
262|---
263|
264|## 📄 License
265|
266|This project is licensed under the [MIT License](LICENSE).
267|
268|---
269|
270|<p align="center">
271|  Built with ❤️ by the Wekanz team
272|</p>
273|