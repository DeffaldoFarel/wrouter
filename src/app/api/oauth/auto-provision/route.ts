/**
 * POST /api/oauth/auto-provision
 * Auto-provision an OAuth provider entry in the DB.
 * Called when user clicks on an OAuth provider card that doesn't have a DB entry yet.
 */
import { NextRequest, NextResponse } from "next/server";
import { autoProvisionProvider } from "@/lib/oauth/auto-provision";
import { checkDashboardAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { invalidateProviderCache } from "@/lib/router/engine";
import logger from "@/lib/logger";

// Same defaults as auto-provision.ts
const OAUTH_PROVIDER_DEFAULTS: Record<string, {
  name: string;
  prefix: string;
  baseUrl: string;
  format: string;
  models: string[];
}> = {
  "gemini-cli": {
    name: "Gemini CLI",
    prefix: "gemini-cli",
    baseUrl: "https://cloudcode-pa.googleapis.com/v1internal",
    format: "gemini-cli",
    models: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ],
  },
  claude: {
    name: "Claude (OAuth)",
    prefix: "claude-oauth",
    baseUrl: "https://api.anthropic.com/v1",
    format: "anthropic",
    models: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-haiku-3-20250414",
    ],
  },
  codex: {
    name: "OpenAI (OAuth)",
    prefix: "codex-oauth",
    baseUrl: "https://api.openai.com/v1",
    format: "openai",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
    ],
  },
};

export async function POST(request: NextRequest) {
  const authToken = checkDashboardAuth(request);
  if (!authToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { provider: oauthProvider } = body;

  if (!oauthProvider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  const config = OAUTH_PROVIDER_DEFAULTS[oauthProvider];
  if (!config) {
    return NextResponse.json({ error: `Unknown OAuth provider: ${oauthProvider}` }, { status: 404 });
  }

  // Check if provider already exists
  let existing = db.select().from(providers).where(eq(providers.prefix, config.prefix)).get();

  if (!existing) {
    // Create it
    const now = new Date().toISOString();
    const providerId = uuidv4();
    db.insert(providers).values({
      id: providerId,
      name: config.name,
      prefix: config.prefix,
      baseUrl: config.baseUrl,
      apiKey: "",
      models: JSON.stringify(config.models),
      enabled: true,
      type: "custom",
      format: config.format,
      connectionStrategy: "priority",
      createdAt: now,
      updatedAt: now,
    }).run();

    existing = db.select().from(providers).where(eq(providers.id, providerId)).get();
    invalidateProviderCache();

    logger.info(
      { providerId, prefix: config.prefix },
      "Auto-provisioned OAuth provider via API"
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Failed to create provider" }, { status: 500 });
  }

  return NextResponse.json({ providerId: existing.id, prefix: existing.prefix });
}
