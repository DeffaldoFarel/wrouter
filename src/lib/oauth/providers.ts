/**
 * OAuth Provider Registry.
 * Central hub for all OAuth provider flow handlers.
 *
 * Each provider implements a standard contract:
 *   - config: OAuthConfig
 *   - flowType: "authorization_code" | "authorization_code_pkce" | "device_code" | "import_token"
 *   - buildAuthUrl: (config, redirectUri, state, codeChallenge, meta) => string
 *   - exchangeToken: async (config, code, redirectUri, codeVerifier, state, meta) => object
 *   - mapTokens: (tokens, extra) => normalized token object
 *   - requestDeviceCode: async (config, codeChallenge) => device code response
 *   - pollToken: async (config, deviceCode, codeVerifier) => token response
 *
 * Inspired by 9router providers.js
 */
import {
  CLAUDE_CONFIG,
  CODEX_CONFIG,
  GITHUB_CONFIG,
  KIRO_CONFIG,
  KIRO_CONSTANTS,
  GEMINI_CONFIG,
  GEMINI_CONSTANTS,
  ANTIGRAVITY_CONFIG,
  FlowType,
  OAuthConfig,
} from "./constants";
import { generatePKCE } from "./pkce";
import logger from "@/lib/logger";

// ─── Standardized Token Output ───
export interface NormalizedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
  tokenType?: string;
  scope?: string;
  idToken?: string;
  email?: string;
  displayName?: string;
  projectId?: string;
  apiKey?: string;
  providerSpecificData?: Record<string, unknown>;
}

// ─── Provider Handler Interface ───
export interface ProviderHandler {
  config: OAuthConfig;
  flowType: FlowType;
  fixedPort?: number;
  pkceVerifierBytes?: number;
  buildAuthUrl: (
    config: OAuthConfig,
    redirectUri: string,
    state: string,
    codeChallenge: string,
    meta?: Record<string, string>
  ) => string;
  exchangeToken: (
    config: OAuthConfig,
    code: string,
    redirectUri: string,
    codeVerifier?: string,
    state?: string,
    meta?: Record<string, string>
  ) => Promise<Record<string, unknown>>;
  mapTokens: (tokens: Record<string, unknown>, extra?: Record<string, unknown>) => NormalizedTokens;
  requestDeviceCode?: (
    config: OAuthConfig,
    codeChallenge?: string
  ) => Promise<DeviceCodeResponse>;
  pollToken?: (
    config: OAuthConfig,
    deviceCode: string,
    codeVerifier?: string
  ) => Promise<Record<string, unknown>>;
}

export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval?: number;
  expiresIn?: number;
}

// ─── Helper: Decode JWT payload ───
function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return {};
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

function extractEmailFromJwt(jwt: string): string | undefined {
  const payload = decodeJwtPayload(jwt);
  return (payload.email as string) ?? undefined;
}

// ─── Provider Implementations ───

const claudeProvider: ProviderHandler = {
  config: CLAUDE_CONFIG,
  flowType: "authorization_code_pkce",

  buildAuthUrl(config, redirectUri, state, codeChallenge) {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope: config.scopes?.join(" ") ?? "",
    });
    return `${config.authorizationEndpoint}?${params.toString()}`;
  },

  async exchangeToken(config, code, redirectUri, codeVerifier) {
    // Claude's code may contain state after '#'
    const cleanCode = code.split("#")[0];

    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: cleanCode,
        redirect_uri: redirectUri,
        client_id: config.clientId,
        code_verifier: codeVerifier,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude token exchange failed: ${response.status} ${text}`);
    }

    return (await response.json()) as Record<string, unknown>;
  },

  mapTokens(tokens) {
    return {
      accessToken: tokens.access_token as string,
      refreshToken: tokens.refresh_token as string | undefined,
      expiresIn: tokens.expires_in as number | undefined,
      tokenType: tokens.token_type as string | undefined,
      email: extractEmailFromJwt(tokens.access_token as string),
    };
  },
};

const codexProvider: ProviderHandler = {
  config: CODEX_CONFIG,
  flowType: "authorization_code_pkce",
  fixedPort: 1455,

  buildAuthUrl(config, redirectUri, state, codeChallenge) {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      scope: config.scopes?.join(" ") ?? "",
      audience: "https://api.openai.com/v1",
    });
    return `${config.authorizationEndpoint}?${params.toString()}`;
  },

  async exchangeToken(config, code, redirectUri, codeVerifier) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier ?? "",
    });

    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Codex token exchange failed: ${response.status} ${text}`);
    }

    return (await response.json()) as Record<string, unknown>;
  },

  mapTokens(tokens) {
    const idToken = tokens.id_token as string | undefined;
    const payload = idToken ? decodeJwtPayload(idToken) : {};
    const authClaims = (payload["https://api.openai.com/auth"] ?? payload) as Record<string, unknown>;

    return {
      accessToken: tokens.access_token as string,
      refreshToken: tokens.refresh_token as string | undefined,
      expiresIn: tokens.expires_in as number | undefined,
      tokenType: tokens.token_type as string | undefined,
      idToken,
      email: (authClaims.email ?? payload.email) as string | undefined,
      providerSpecificData: {
        chatgptAccountId: (authClaims.chatgpt_account_id ?? authClaims.account_id) as string | undefined,
        chatgptPlanType: (authClaims.chatgpt_plan_type ?? authClaims.plan_type) as string | undefined,
      },
    };
  },
};

const githubProvider: ProviderHandler = {
  config: GITHUB_CONFIG,
  flowType: "device_code",

  buildAuthUrl() {
    // GitHub uses device code flow, no auth URL needed
    return "";
  },

  async exchangeToken() {
    throw new Error("GitHub uses device code flow, not authorization code");
  },

  mapTokens(tokens) {
    return {
      accessToken: tokens.access_token as string,
      tokenType: tokens.token_type as string | undefined,
      scope: tokens.scope as string | undefined,
    };
  },

  async requestDeviceCode(config) {
    const response = await fetch(config.deviceAuthorizationEndpoint!, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        scope: config.scopes?.join(" ") ?? "",
      }),
    });

    if (!response.ok) {
      throw new Error(`GitHub device code failed: ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      deviceCode: data.device_code as string,
      userCode: data.user_code as string,
      verificationUri: data.verification_uri as string,
      interval: data.interval as number | undefined,
      expiresIn: data.expires_in as number | undefined,
    };
  },

  async pollToken(config, deviceCode) {
    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (data.error === "authorization_pending") {
      throw new Error("pending");
    }
    if (data.error === "slow_down") {
      throw new Error("slow_down");
    }
    if (data.error) {
      throw new Error(`GitHub poll error: ${data.error}`);
    }

    // Fetch Copilot token + user info
    const accessToken = data.access_token as string;
    let copilotToken: string | undefined;
    let copilotExpiresAt: number | undefined;
    let email: string | undefined;
    let displayName: string | undefined;

    try {
      const [copilotRes, userRes] = await Promise.all([
        fetch("https://api.github.com/copilot_internal/token", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "WekanzRouter",
          },
        }),
        fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "WekanzRouter",
          },
        }),
      ]);

      if (copilotRes.ok) {
        const ct = (await copilotRes.json()) as Record<string, unknown>;
        copilotToken = ct.token as string;
        copilotExpiresAt = ct.expires_at as number;
      }

      if (userRes.ok) {
        const user = (await userRes.json()) as Record<string, unknown>;
        email = user.email as string | undefined;
        displayName = user.login as string;
      }
    } catch (err) {
      logger.warn({ err }, "GitHub post-exchange fetch failed");
    }

    return {
      ...data,
      _copilotToken: copilotToken,
      _copilotExpiresAt: copilotExpiresAt,
      _email: email,
      _displayName: displayName,
    };
  },
};

// ─── Kiro Provider (AWS SSO OIDC Device Code) ───

const kiroProvider: ProviderHandler = {
  config: KIRO_CONFIG,
  flowType: "device_code",

  buildAuthUrl() {
    return "";
  },

  async exchangeToken() {
    throw new Error("Kiro uses device code flow, not authorization code");
  },

  mapTokens(tokens) {
    return {
      accessToken: tokens.access_token as string,
      refreshToken: tokens.refresh_token as string | undefined,
      expiresIn: tokens.expires_in as number | undefined,
      tokenType: tokens.token_type as string | undefined,
    };
  },

  async requestDeviceCode() {
    // Step 1: Register client
    const registerRes = await fetch(KIRO_CONSTANTS.registerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: KIRO_CONSTANTS.clientName,
        clientType: "public",
        scopes: KIRO_CONFIG.scopes,
        grantTypes: [
          "urn:ietf:params:oauth:grant-type:device_code",
          "refresh_token",
        ],
        issuerUrl: KIRO_CONSTANTS.issuerUrl,
      }),
    });

    if (!registerRes.ok) {
      const text = await registerRes.text();
      throw new Error(`Kiro client registration failed: ${registerRes.status} ${text}`);
    }

    const client = (await registerRes.json()) as Record<string, unknown>;
    const clientId = client.clientId as string;
    const clientSecret = client.clientSecret as string;

    // Step 2: Device Authorization
    const deviceRes = await fetch(KIRO_CONFIG.deviceAuthorizationEndpoint!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl: KIRO_CONSTANTS.startUrl,
      }),
    });

    if (!deviceRes.ok) {
      const text = await deviceRes.text();
      throw new Error(`Kiro device authorization failed: ${deviceRes.status} ${text}`);
    }

    const deviceData = (await deviceRes.json()) as Record<string, unknown>;
    return {
      deviceCode: deviceData.deviceCode as string,
      userCode: deviceData.userCode as string,
      verificationUri: (deviceData.verificationUriComplete || deviceData.verificationUri) as string,
      interval: deviceData.interval as number | undefined,
      expiresIn: deviceData.expiresIn as number | undefined,
      // Store client credentials for polling
      _clientId: clientId,
      _clientSecret: clientSecret,
    } as DeviceCodeResponse & { _clientId: string; _clientSecret: string };
  },

  async pollToken(_config, deviceCode, _codeVerifier) {
    // Note: Kiro needs clientId/clientSecret from registration step.
    // We pass them via the deviceCode string as JSON if needed,
    // or rely on the stored metadata. For simplicity, we'll re-register.
    // In production, these should be cached per session.

    // Re-register to get credentials (or use cached)
    const registerRes = await fetch(KIRO_CONSTANTS.registerEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: KIRO_CONSTANTS.clientName,
        clientType: "public",
        scopes: KIRO_CONFIG.scopes,
        grantTypes: [
          "urn:ietf:params:oauth:grant-type:device_code",
          "refresh_token",
        ],
        issuerUrl: KIRO_CONSTANTS.issuerUrl,
      }),
    });

    if (!registerRes.ok) {
      throw new Error("Kiro client re-registration failed");
    }

    const client = (await registerRes.json()) as Record<string, unknown>;
    const clientId = client.clientId as string;
    const clientSecret = client.clientSecret as string;

    const response = await fetch(KIRO_CONFIG.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        clientSecret,
        deviceCode,
        grantType: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (data.error === "authorization_pending") {
      throw new Error("pending");
    }
    if (data.error === "slow_down") {
      throw new Error("slow_down");
    }
    if (data.error) {
      throw new Error(`Kiro poll error: ${data.error}`);
    }

    return data;
  },
};

// ─── Gemini CLI Provider (Google OAuth) ───

const geminiProvider: ProviderHandler = {
  config: GEMINI_CONFIG,
  flowType: "authorization_code",

  buildAuthUrl(config, redirectUri, state) {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: config.scopes?.join(" ") ?? "",
      access_type: "offline",
      prompt: "consent",
    });
    return `${config.authorizationEndpoint}?${params.toString()}`;
  },

  async exchangeToken(config, code, redirectUri) {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      client_secret: GEMINI_CONSTANTS.clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini token exchange failed: ${response.status} ${text}`);
    }

    const tokens = (await response.json()) as Record<string, unknown>;

    // Post-exchange: fetch user info
    let email: string | undefined;
    let displayName: string | undefined;
    try {
      const userRes = await fetch(GEMINI_CONSTANTS.userInfoEndpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const user = (await userRes.json()) as Record<string, unknown>;
        email = user.email as string | undefined;
        displayName = user.name as string | undefined;
      }
    } catch (err) {
      logger.warn({ err }, "Gemini user info fetch failed");
    }

    // Post-exchange: discover project ID
    let projectId: string | undefined;
    try {
      const projectRes = await fetch(GEMINI_CONSTANTS.projectDiscoveryEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          metadata: { ideType: 9, platform: 3, pluginType: 2 },
          mode: 1,
        }),
      });
      if (projectRes.ok) {
        const projData = (await projectRes.json()) as Record<string, unknown>;
        const project = projData.cloudaicompanionProject as Record<string, unknown> | undefined;
        projectId = project?.id as string | undefined;
      }
    } catch (err) {
      logger.warn({ err }, "Gemini project discovery failed");
    }

    return { ...tokens, _email: email, _displayName: displayName, _projectId: projectId };
  },

  mapTokens(tokens) {
    return {
      accessToken: tokens.access_token as string,
      refreshToken: tokens.refresh_token as string | undefined,
      expiresIn: tokens.expires_in as number | undefined,
      scope: tokens.scope as string | undefined,
      email: tokens._email as string | undefined,
      displayName: tokens._displayName as string | undefined,
      projectId: tokens._projectId as string | undefined,
    };
  },
};

// ─── Provider Registry ───

const PROVIDERS: Record<string, ProviderHandler> = {
  claude: claudeProvider,
  codex: codexProvider,
  github: githubProvider,
  kiro: kiroProvider,
  "gemini-cli": geminiProvider,
};

// ─── Cursor (import_token only, no OAuth flow handler needed) ───
// Cursor uses /api/oauth/cursor/import directly from the frontend.
// It doesn't need a ProviderHandler since there's no OAuth dance involved.

// ─── Import-only providers ───
// These providers only support token import, not full OAuth flows.
export const IMPORT_ONLY_PROVIDERS = new Set(["cursor"]);

// ─── Public API ───

export function getProvider(name: string): ProviderHandler | null {
  return PROVIDERS[name] ?? null;
}

export function getProviderNames(): string[] {
  return Object.keys(PROVIDERS);
}

/**
 * Generate PKCE data + auth URL for authorization_code flows.
 */
export function generateAuthData(
  providerName: string,
  redirectUri: string,
  meta?: Record<string, string>
): { authUrl: string; state: string; codeVerifier: string } | null {
  const provider = getProvider(providerName);
  if (!provider) return null;

  const pkceBytes = provider.pkceVerifierBytes ?? 32;
  const { codeVerifier, codeChallenge, state } = generatePKCE(pkceBytes);

  const authUrl = provider.buildAuthUrl(
    provider.config,
    redirectUri,
    state,
    codeChallenge,
    meta
  );

  return { authUrl, state, codeVerifier };
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeTokens(
  providerName: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
  state?: string,
  meta?: Record<string, string>
): Promise<NormalizedTokens | null> {
  const provider = getProvider(providerName);
  if (!provider) return null;

  const rawTokens = await provider.exchangeToken(
    provider.config,
    code,
    redirectUri,
    codeVerifier,
    state,
    meta
  );

  return provider.mapTokens(rawTokens);
}

/**
 * Request a device code for device_code flows.
 */
export async function requestDeviceCode(
  providerName: string
): Promise<DeviceCodeResponse | null> {
  const provider = getProvider(providerName);
  if (!provider?.requestDeviceCode) return null;
  return provider.requestDeviceCode(provider.config);
}

/**
 * Poll for a device code token.
 * Throws "pending" or "slow_down" to indicate the caller should retry.
 */
export async function pollForToken(
  providerName: string,
  deviceCode: string,
  codeVerifier?: string
): Promise<NormalizedTokens | null> {
  const provider = getProvider(providerName);
  if (!provider?.pollToken) return null;

  const rawTokens = await provider.pollToken(provider.config, deviceCode, codeVerifier);

  // Merge extra data from post-exchange fetches (e.g., GitHub copilot token)
  const mapped = provider.mapTokens(rawTokens);
  if (rawTokens._copilotToken) {
    mapped.providerSpecificData = {
      ...mapped.providerSpecificData,
      copilotToken: rawTokens._copilotToken as string,
      copilotTokenExpiresAt: rawTokens._copilotExpiresAt as number,
    };
  }
  if (rawTokens._email) mapped.email = rawTokens._email as string;
  if (rawTokens._displayName) mapped.displayName = rawTokens._displayName as string;

  return mapped;
}
