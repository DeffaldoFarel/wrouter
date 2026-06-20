/**
 * PKCE (Proof Key for Code Exchange) utilities per RFC 7636.
 * Used for OAuth 2.0 Authorization Code Flow with PKCE.
 *
 * Inspired by 9router's implementation.
 */
import { randomBytes, createHash } from "crypto";

/**
 * Generate a cryptographically random code verifier.
 * @param bytes Number of random bytes (default 32, xAI uses 96)
 * @returns Base64url-encoded string (43-128 chars for 32 bytes)
 */
export function generateCodeVerifier(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Generate a code challenge from a code verifier using SHA-256 (S256 method).
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generate a cryptographically random state parameter for CSRF protection.
 */
export function generateState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Generate a complete PKCE set: codeVerifier, codeChallenge, and state.
 */
export function generatePKCE(bytes = 32): {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
} {
  const codeVerifier = generateCodeVerifier(bytes);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  return { codeVerifier, codeChallenge, state };
}
