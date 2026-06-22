/**
 * OAuth API Route Handler.
 * Dynamic route: /api/oauth/[provider]/[action]
 *
 * Supported actions:
 *   GET  /api/oauth/{provider}/authorize     → Generate PKCE + auth URL
 *   GET  /api/oauth/{provider}/device-code    → Initiate device code flow
 *   POST /api/oauth/{provider}/exchange       → Exchange code → tokens → save DB
 *   POST /api/oauth/{provider}/poll           → Poll device code for tokens
 *   POST /api/oauth/{provider}/import         → Import token (Cursor)
 *
 * Inspired by 9router's [provider]/[action]/route.js
 */
import { NextRequest, NextResponse } from "next/server";
import {
  generateAuthData,
  exchangeTokens,
  requestDeviceCode,
  pollForToken,
} from "@/lib/oauth/providers";
import { generatePKCE } from "@/lib/oauth/pkce";
import { KIRO_CONSTANTS } from "@/lib/oauth/constants";
import { createOrUpdateConnection } from "@/lib/oauth/connections";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateOAuthToken } from "@/lib/validation";
import { oauthLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import logger from "@/lib/logger";

type RouteParams = { params: Promise<{ provider: string; action: string }> };

// ─── GET Handler ───
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!checkDashboardAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { provider, action } = await params;

  try {
    switch (action) {
      case "authorize":
        return handleAuthorize(request, provider);
      case "device-code":
        return handleDeviceCode(provider);
      case "social-login":
        return handleSocialLogin(request, provider);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    logger.error({ err, provider, action }, "OAuth GET error");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// ─── POST Handler ───
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!checkDashboardAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F4: Rate limit OAuth network-heavy operations (exchange/poll/import)
  const ip = getClientIp(request);
  const limitCheck = oauthLimiter.consume(ip);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  const { provider, action } = await params;

  try {
    const body = await request.json();

    // E6: Validate OAuth token payload length (prevent DoS via huge tokens)
    const tokenValidation = validateOAuthToken(body);
    if (!tokenValidation.valid) {
      return NextResponse.json(
        { error: "Validation failed", errors: tokenValidation.errors },
        { status: 400 }
      );
    }

    switch (action) {
      case "exchange":
        return handleExchange(request, provider, body);
      case "poll":
        return handlePoll(provider, body);
      case "import":
        return handleImport(provider, body);
      case "social-exchange":
        return handleSocialExchange(provider, body);
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    logger.error({ err, provider, action }, "OAuth POST error");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

// ─── Action Handlers ───

/**
 * GET /authorize — Generate PKCE + auth URL for authorization_code flows.
 */
function handleAuthorize(request: NextRequest, provider: string) {
  const url = new URL(request.url);
  const redirectUri =
    url.searchParams.get("redirect_uri") ||
    `${url.origin}/api/oauth/callback`;

  // Collect extra query params as meta
  const meta: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "redirect_uri") meta[key] = value;
  });

  const result = generateAuthData(provider, redirectUri, meta);
  if (!result) {
    return NextResponse.json(
      { error: `Unknown provider: ${provider}` },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}

/**
 * GET /device-code — Initiate device code flow.
 */
async function handleDeviceCode(provider: string) {
  const result = await requestDeviceCode(provider);
  if (!result) {
    return NextResponse.json(
      { error: `Provider ${provider} does not support device code flow` },
      { status: 400 }
    );
  }

  return NextResponse.json(result);
}

/**
 * POST /exchange — Exchange authorization code for tokens + save to DB.
 */
async function handleExchange(
  request: NextRequest,
  provider: string,
  body: {
    code: string;
    redirectUri?: string;
    codeVerifier?: string;
    state?: string;
    name?: string;
  }
) {
  const { code, redirectUri, codeVerifier, state, name } = body;

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  // Detect raw JWT token paste (ChatGPT website tokens)
  if (code.startsWith("eyJ") && code.includes(".")) {
    const connection = createOrUpdateConnection({
      provider,
      authType: "access_token",
      name: name || `${provider}-manual`,
      accessToken: code,
      testStatus: "active",
    });

    return NextResponse.json({ connection });
  }

  // Standard code exchange
  const url = new URL(request.url);
  const resolvedRedirectUri =
    redirectUri || `${url.origin}/api/oauth/callback`;

  const tokens = await exchangeTokens(
    provider,
    code,
    resolvedRedirectUri,
    codeVerifier,
    state
  );

  if (!tokens) {
    return NextResponse.json(
      { error: `Token exchange failed for ${provider}` },
      { status: 500 }
    );
  }

  // Save to database
  const connection = createOrUpdateConnection({
    provider,
    authType: "oauth",
    name: name || tokens.displayName || tokens.email || `${provider}-oauth`,
    email: tokens.email ?? null,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
    expiresAt: tokens.expiresAt,
    tokenType: tokens.tokenType,
    scope: tokens.scope,
    idToken: tokens.idToken,
    projectId: tokens.projectId,
    lastRefreshAt: new Date().toISOString(),
    testStatus: "active",
    providerSpecificData: tokens.providerSpecificData,
  });

  logger.info(
    { provider, connectionId: connection.id, email: connection.email },
    "OAuth connection created/updated"
  );

  return NextResponse.json({ connection });
}

/**
 * POST /poll — Poll device code for tokens.
 */
async function handlePoll(
  provider: string,
  body: { deviceCode: string; codeVerifier?: string; name?: string }
) {
  const { deviceCode, codeVerifier, name } = body;

  if (!deviceCode) {
    return NextResponse.json({ error: "Missing deviceCode" }, { status: 400 });
  }

  try {
    const tokens = await pollForToken(provider, deviceCode, codeVerifier);

    if (!tokens) {
      return NextResponse.json(
        { error: `Poll failed for ${provider}` },
        { status: 500 }
      );
    }

    // Save to database
    const connection = createOrUpdateConnection({
      provider,
      authType: "oauth",
      name: name || tokens.displayName || tokens.email || `${provider}-oauth`,
      email: tokens.email ?? null,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      expiresAt: tokens.expiresAt,
      tokenType: tokens.tokenType,
      lastRefreshAt: new Date().toISOString(),
      testStatus: "active",
      providerSpecificData: tokens.providerSpecificData,
    });

    logger.info(
      { provider, connectionId: connection.id, email: connection.email },
      "OAuth device code connection created"
    );

    return NextResponse.json({ connection });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === "pending") {
      return NextResponse.json({ status: "pending" });
    }
    if (message === "slow_down") {
      return NextResponse.json({ status: "slow_down" });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /import — Import a token directly (e.g., Cursor).
 */
async function handleImport(
  provider: string,
  body: {
    accessToken?: string;
    apiKey?: string;
    name?: string;
    email?: string;
    providerSpecificData?: Record<string, unknown>;
  }
) {
  const { accessToken, apiKey, name, email, providerSpecificData } = body;

  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: "Missing accessToken or apiKey" },
      { status: 400 }
    );
  }

  const connection = createOrUpdateConnection({
    provider,
    authType: apiKey ? "apikey" : "access_token",
    name: name || `${provider}-import`,
    email: email ?? null,
    accessToken,
    apiKey,
    testStatus: "active",
    providerSpecificData,
  });

  return NextResponse.json({ connection });
}

/**
 * GET /social-login — Generate PKCE + social login URL for Openagentic (Google/GitHub via Cognito).
 * Query params: ?idp=Google|Github
 */
function handleSocialLogin(request: NextRequest, provider: string) {
  if (provider !== "kiro") {
    return NextResponse.json(
      { error: "Social login only supported for kiro" },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const idp = url.searchParams.get("idp") || "Google";

  // Generate PKCE
  const { codeVerifier, codeChallenge, state } = generatePKCE(32);

  const authUrl = `${KIRO_CONSTANTS.socialAuthBase}/login?` +
    new URLSearchParams({
      idp,
      redirect_uri: KIRO_CONSTANTS.socialRedirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      prompt: "select_account",
    }).toString();

  return NextResponse.json({ authUrl, codeVerifier, state, idp });
}

/**
 * POST /social-exchange — Exchange social login code for tokens (Openagentic Cognito).
 */
async function handleSocialExchange(
  provider: string,
  body: { code: string; codeVerifier: string; name?: string }
) {
  if (provider !== "kiro") {
    return NextResponse.json(
      { error: "Social exchange only supported for kiro" },
      { status: 400 }
    );
  }

  const { code, codeVerifier, name } = body;
  if (!code || !codeVerifier) {
    return NextResponse.json(
      { error: "Missing code or codeVerifier" },
      { status: 400 }
    );
  }

  const response = await fetch(`${KIRO_CONSTANTS.socialAuthBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      code_verifier: codeVerifier,
      redirect_uri: KIRO_CONSTANTS.socialRedirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { error: `Social token exchange failed: ${response.status} ${text}` },
      { status: 500 }
    );
  }

  const tokens = (await response.json()) as Record<string, unknown>;

  // Extract email from JWT
  let email: string | undefined;
  try {
    const payload = tokens.accessToken as string;
    if (payload) {
      const parts = payload.split(".");
      if (parts.length === 3) {
        const decoded = JSON.parse(Buffer.from(parts[1], "base64url").toString());
        email = decoded.email || decoded.preferred_username || decoded.sub;
      }
    }
  } catch { /* ignore */ }

  const connection = createOrUpdateConnection({
    provider,
    authType: "oauth",
    name: name || email || `${provider}-social`,
    email: email ?? null,
    accessToken: tokens.accessToken as string,
    refreshToken: tokens.refreshToken as string | undefined,
    expiresIn: tokens.expiresIn as number | undefined,
    lastRefreshAt: new Date().toISOString(),
    testStatus: "active",
    providerSpecificData: {
      authMethod: "social",
      profileArn: tokens.profileArn as string | undefined,
    },
  });

  logger.info(
    { provider, connectionId: connection.id, email },
    "Openagentic social connection created"
  );

  return NextResponse.json({ connection });
}
