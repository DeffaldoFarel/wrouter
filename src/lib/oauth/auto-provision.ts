/**
 * Auto-provision OAuth providers.
 * When a user completes OAuth login, automatically create the provider entry
 * (if it doesn't exist) and link the connection to it.
 *
 * Inspired by 9router's approach where OAuth connections are immediately
 * usable without manual provider creation.
 */
import { db } from "@/lib/db";
import { providers, providerConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { invalidateProviderCache } from "@/lib/router/engine";
import logger from "@/lib/logger";

// Default provider configs for OAuth providers (like 9router's registry)
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

/**
 * Auto-provision a provider for an OAuth connection.
 * Creates the provider if it doesn't exist, then links the connection to it.
 *
 * @param oauthProvider - The OAuth provider name (e.g., "gemini-cli", "claude", "codex")
 * @param connectionId - The ID of the newly created connection
 * @returns The provider ID (existing or newly created)
 */
export function autoProvisionProvider(
  oauthProvider: string,
  connectionId: string
): string | null {
  const config = OAUTH_PROVIDER_DEFAULTS[oauthProvider];
  if (!config) {
    logger.debug({ oauthProvider }, "No auto-provision config for this OAuth provider");
    return null;
  }

  const now = new Date().toISOString();

  // Check if provider already exists (by prefix)
  let provider = db.select().from(providers).where(eq(providers.prefix, config.prefix)).get();

  if (!provider) {
    // Auto-create the provider
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

    provider = db.select().from(providers).where(eq(providers.id, providerId)).get();
    logger.info(
      { providerId, prefix: config.prefix, name: config.name },
      "Auto-provisioned OAuth provider"
    );

    // Invalidate provider cache so routing picks up the new entry
    invalidateProviderCache();
  }

  if (!provider) return null;

  // Link the connection to the provider (set providerId)
  db.update(providerConnections)
    .set({ providerId: provider.id, updatedAt: now })
    .where(eq(providerConnections.id, connectionId))
    .run();

  logger.info(
    { connectionId, providerId: provider.id, prefix: config.prefix },
    "Linked OAuth connection to provider"
  );

  return provider.id;
}
