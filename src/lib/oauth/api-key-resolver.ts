/**
 * OAuth-aware API key resolver.
 * Checks for active OAuth connections before falling back to static API keys.
 *
 * Priority:
 *   1. OAuth connection (auto-refresh if needed)
 *   2. Static API key from provider config
 *
 * Inspired by 9router's multi-connection support.
 */
import { getProviderConnections } from "./connections";
import { checkAndRefreshToken } from "./token-refresh";
import logger from "@/lib/logger";

// Map provider prefix to OAuth provider name
const PROVIDER_MAP: Record<string, string> = {
  claude: "claude",
  openai: "codex",
  codex: "codex",
  github: "github",
  cursor: "cursor",
  kiro: "kiro",
  "gemini-cli": "gemini-cli",
  gemini: "gemini-cli",
};

/**
 * Get the best available API key for a provider.
 * Checks OAuth connections first, then falls back to static key.
 *
 * @param providerPrefix - Provider prefix (e.g., "claude", "openai", "github")
 * @param staticApiKey - Fallback static API key from provider config
 * @returns Resolved API key or null if none available
 */
export async function resolveApiKey(
  providerPrefix: string,
  staticApiKey: string | null
): Promise<string | null> {
  const oauthProvider = PROVIDER_MAP[providerPrefix];

  // Check for active OAuth connections
  if (oauthProvider) {
    try {
      const connections = getProviderConnections(oauthProvider, {
        isActive: true,
      });

      if (connections.length > 0) {
        const connection = connections[0]; // Highest priority
        logger.debug(
          { provider: oauthProvider, connectionId: connection.id },
          "Using OAuth connection"
        );

        // Auto-refresh token if needed
        const refreshed = await checkAndRefreshToken(connection.id);
        const token = refreshed?.accessToken ?? connection.accessToken;

        if (token) {
          return token as string;
        }
      }
    } catch (err) {
      logger.warn(
        { err, provider: oauthProvider },
        "Failed to fetch OAuth connection, falling back to static key"
      );
    }
  }

  // Fall back to static API key
  return staticApiKey;
}

/**
 * Get all available connections for a provider (for round-robin load balancing).
 */
export function getAvailableConnections(providerPrefix: string) {
  const oauthProvider = PROVIDER_MAP[providerPrefix];
  if (!oauthProvider) return [];

  try {
    return getProviderConnections(oauthProvider);
  } catch {
    return [];
  }
}
