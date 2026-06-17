# WRouter

Self-hosted AI API router that unifies multiple AI providers into one OpenAI-compatible endpoint.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run in development mode
npm run dev
```

Dashboard opens at `http://localhost:3000`

## Production

```bash
npm run build
PORT=20128 npm run start
```

## Default Credentials

- **Password:** `qwertyui`
- **API Key:** Generated on first run (check Settings page)

## Usage

1. Login to dashboard
2. Add providers (Base URL + API Key + Models)
3. Optionally create Combos for fallback chains
4. Point your AI tools to the endpoint:

```
Endpoint: http://localhost:20128/api/v1
API Key: <from settings page>
Model: <model-name> or <combo-slug>/<model-name>
```

## Tech Stack

- Next.js (App Router)
- TailwindCSS + shadcn/ui
- SQLite (better-sqlite3 + drizzle-orm)
- TypeScript
