/**
 * Token Refresh Engine.
 * Handles automatic token refresh before API requests.
 *
 * Key design:
 *   - checkAndRefreshToken() runs before every request
 *   - Each provider has its own refresh implementation
 *   - Proactive refresh: refresh when within TOKEN_EXPIRY_BUFFER_MS of expiry
 *   - Atomic updates: merge old + new tokens in transaction
 *
 * Inspired by 9router tokenRefresh.js
 */
import { getConnectionById, updateConnection, Connection, ConnectionData } from "./connections";
import { TOKEN_EXPIRY_BUFFER_MS } from "./constants";
import logger from "@/lib/logger";

// ─── Token Refresh Functions per Provider ───

async function refreshClaudeToken(refreshToken: string): Promise<ConnectionData> {
  const response = await fetch("https://claude.ai/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: "JfGZIaHfKkuauKlsJciQb4qz3v9WwVj8",
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? refreshToken,
    expiresIn: data.expires_in as number | undefined,
    lastRefreshAt: new Date().toISOString(),
  };
}

async function refreshCodexToken(refreshToken: string): Promise<ConnectionData> {
  const response = await fetch("https://auth.openai.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: "app_EMoamEEZ7HfaoGR9Lb2njZbs",
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Codex token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    refreshToken: (data.refresh_token as string) ?? refreshToken,
    expiresIn: data.expires_in as number | undefined,
    idToken: data.id_token as string | undefined,
    lastRefreshAt: new Date().toISOString(),
  };
}

async function refreshGoogleToken(
  refreshToken: string,
  clientId: string
): Promise<ConnectionData> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    expiresIn: data.expires_in as number | undefined,
    lastRefreshAt: new Date().toISOString(),
  };
}

// Map provider name to refresh function
const REFRESH_HANDLERS: Record<
  string,
  (refreshToken: string, extra?: Record<string, unknown>) => Promise<ConnectionData>
> = {
  claude: refreshClaudeToken,
  codex: refreshCodexToken,
  "gemini-cli": (rt) => refreshGoogleToken(rt, "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com"),
  antigravity: (rt) => refreshGoogleToken(rt, "764086051850-6qr4p6gbb6j5f8s7m0j6f7f3m6g4t0v0.apps.googleusercontent.com"),
};

// ─── Expiry Check ───

function shouldRefresh(connection: Connection): boolean {
  const expiresAt = connection.expiresAt as string | undefined;
  if (!expiresAt) return false;

  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const remaining = expiryTime - now;

  return remaining < TOKEN_EXPIRY_BUFFER_MS;
}

function toExpiresAt(expiresIn: number): string {
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

// ─── Public API ───

/**
 * Check if a connection's token needs refreshing and refresh it if so.
 * Called before every API request.
 *
 * @returns The (possibly updated) connection with fresh tokens.
 */
export async function checkAndRefreshToken(connectionId: string): Promise<Connection | null> {
  const connection = getConnectionById(connectionId);
  if (!connection) return null;

  // No refresh token → can't refresh
  const refreshToken = connection.refreshToken as string | undefined;
  if (!refreshToken) return connection;

  // Not expired yet → return as-is
  if (!shouldRefresh(connection)) return connection;

  // Find refresh handler for this provider
  const handler = connection.provider ? REFRESH_HANDLERS[connection.provider] : undefined;
  if (!handler) {
    logger.debug({ provider: connection.provider }, "No refresh handler for provider");
    return connection;
  }

  try {
    logger.info(
      { provider: connection.provider, connectionId },
      "Refreshing OAuth token"
    );

    const newCreds = await handler(
      refreshToken,
      connection.providerSpecificData as Record<string, unknown>
    );

    // Convert expiresIn to expiresAt
    if (newCreds.expiresIn && !newCreds.expiresAt) {
      newCreds.expiresAt = toExpiresAt(newCreds.expiresIn);
    }

    // Persist updated tokens
    const updated = updateConnection(connectionId, newCreds);
    logger.info(
      { provider: connection.provider, connectionId, expiresIn: newCreds.expiresIn },
      "OAuth token refreshed successfully"
    );

    return updated;
  } catch (err) {
    logger.error(
      { err, provider: connection.provider, connectionId },
      "OAuth token refresh failed"
    );

    // Mark connection as having an error
    updateConnection(connectionId, {
      lastError: err instanceof Error ? err.message : String(err),
      lastErrorAt: new Date().toISOString(),
    });

    return connection; // Return stale connection
  }
}

/**
 * Get fresh credentials for a connection, refreshing if needed.
 * Returns the access token or API key to use for the request.
 */
export async function getFreshCredentials(
  connectionId: string
): Promise<{
  accessToken?: string;
  apiKey?: string;
  tokenType?: string;
  providerSpecificData?: Record<string, unknown>;
} | null> {
  const connection = await checkAndRefreshToken(connectionId);
  if (!connection) return null;

  return {
    accessToken: connection.accessToken as string | undefined,
    apiKey: connection.apiKey as string | undefined,
    tokenType: connection.tokenType as string | undefined,
    providerSpecificData: connection.providerSpecificData as Record<string, unknown> | undefined,
  };
}
