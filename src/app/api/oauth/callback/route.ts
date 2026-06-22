/**
 * OAuth Callback Route.
 * Handles the redirect from Google OAuth after user authorizes.
 * Route: GET /api/oauth/callback?code=xxx&state=yyy
 *
 * This route:
 * 1. Extracts code and state from query params
 * 2. Exchanges code for tokens (calls Gemini token endpoint)
 * 3. Saves the connection to DB
 * 4. Redirects user to dashboard
 */
import { NextRequest, NextResponse } from "next/server";
import { exchangeTokens } from "@/lib/oauth/providers";
import { createOrUpdateConnection } from "@/lib/oauth/connections";
import { autoProvisionProvider } from "@/lib/oauth/auto-provision";
import logger from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth error
  if (error) {
    logger.error({ error, errorDescription }, "OAuth callback error");
    const redirectUrl = new URL("/dashboard/providers", request.url);
    redirectUrl.searchParams.set("oauth_error", errorDescription || error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state parameter" },
      { status: 400 }
    );
  }

  // Verify state matches (basic CSRF protection)
  const storedState = request.cookies.get("oauth_state")?.value;
  if (storedState && storedState !== state) {
    return NextResponse.json(
      { error: "Invalid state parameter" },
      { status: 400 }
    );
  }

  // Retrieve PKCE code_verifier from cookie (set during /authorize)
  const codeVerifier = request.cookies.get("oauth_code_verifier")?.value;

  try {
    // Exchange code for tokens
    const redirectUri = `${request.nextUrl.origin}/api/oauth/callback`;
    const tokens = await exchangeTokens(
      "gemini-cli",
      code,
      redirectUri,
      codeVerifier, // Pass stored code_verifier for PKCE
      state
    );

    if (!tokens) {
      throw new Error("Token exchange returned null");
    }

    // Save connection to DB
    const connection = createOrUpdateConnection({
      provider: "gemini-cli",
      authType: "oauth",
      name: tokens.displayName || tokens.email || "gemini-oauth",
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
      { provider: "gemini-cli", connectionId: connection.id, email: connection.email },
      "OAuth callback: connection created"
    );

    // Auto-provision: create provider if not exists + link connection
    autoProvisionProvider("gemini-cli", connection.id);

    // Redirect to dashboard with success
    const redirectUrl = new URL("/dashboard/providers", request.url);
    redirectUrl.searchParams.set("oauth_success", "1");
    const response = NextResponse.redirect(redirectUrl);
    // Clear OAuth cookies
    response.cookies.delete("oauth_code_verifier");
    response.cookies.delete("oauth_state");
    return response;
  } catch (err) {
    logger.error({ err, code }, "OAuth callback exchange failed");
    const redirectUrl = new URL("/dashboard/providers", request.url);
    redirectUrl.searchParams.set(
      "oauth_error",
      err instanceof Error ? err.message : "Token exchange failed"
    );
    return NextResponse.redirect(redirectUrl);
  }
}
