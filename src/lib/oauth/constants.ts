/**
 * OAuth provider constants and configurations.
 * Defines all supported OAuth providers with their client IDs, endpoints, and flow types.
 *
 * Inspired by 9router's constants/oauth.js
 */

// ─── Provider Names ───
export const PROVIDERS = {
  CLAUDE: "claude",
  CODEX: "codex",
  GITHUB: "github",
  CURSOR: "cursor",
  KIRO: "kiro",
  GEMINI: "gemini-cli",
  ANTIGRAVITY: "antigravity",
} as const;

export type ProviderName = (typeof PROVIDERS)[keyof typeof PROVIDERS];

// ─── Flow Types ───
export type FlowType =
  | "authorization_code"
  | "authorization_code_pkce"
  | "device_code"
  | "import_token";

// ─── OAuth Timeout (5 minutes) ───
export const OAUTH_TIMEOUT = 300_000;          // 5 menit
export const TOKEN_EXPIRY_BUFFER_MS = 60_000;  // 60 detik

// ─── Provider OAuth Configs ───
export interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes?: string[];
  redirectUri?: string;
  /** For device code flow */
  deviceAuthorizationEndpoint?: string;
  /** Extra parameters to include in auth URL */
  extraParams?: Record<string, string>;
}

export const CLAUDE_CONFIG: OAuthConfig = {
  clientId: "JfGZIaHfKkuauKlsJciQb4qz3v9WwVj8",
  authorizationEndpoint: "https://claude.ai/oauth/authorize",
  tokenEndpoint: "https://claude.ai/oauth/token",
  scopes: ["user:read", "user:write"],
};

export const CODEX_CONFIG: OAuthConfig = {
  clientId: "app_EMoamEEZ7HfaoGR9Lb2njZbs",
  authorizationEndpoint: "https://auth.openai.com/oauth/authorize",
  tokenEndpoint: "https://auth.openai.com/oauth/token",
  scopes: ["openid", "profile", "email"],
  extraParams: {
    response_type: "code",
    redirect_uri: "http://localhost:1455/callback",
    audience: "https://api.openai.com/v1",
  },
};

export const GITHUB_CONFIG: OAuthConfig = {
  clientId: "Iv1.b507a08c875fe8d2",
  authorizationEndpoint: "https://github.com/login/oauth/authorize",
  tokenEndpoint: "https://github.com/login/oauth/access_token",
  deviceAuthorizationEndpoint: "https://github.com/login/device/code",
  scopes: ["read:user", "user:email", "copilot"],
};

export const KIRO_CONFIG: OAuthConfig = {
  clientId: "dynamic", // registered at runtime via AWS SSO OIDC
  authorizationEndpoint: "https://oidc.us-east-1.amazonaws.com/authorize",
  tokenEndpoint: "https://oidc.us-east-1.amazonaws.com/token",
  deviceAuthorizationEndpoint:
    "https://oidc.us-east-1.amazonaws.com/device_authorization",
  scopes: [
    "codewhisperer:completions",
    "codewhisperer:analysis",
    "codewhisperer:conversations",
  ],
};

export const KIRO_CONSTANTS = {
  region: "us-east-1",
  clientName: "kiro-oauth-client",
  issuerUrl: "https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6",
  startUrl: "https://view.awsapps.com/start",
  registerEndpoint: "https://oidc.us-east-1.amazonaws.com/client/register",
  socialAuthBase: "https://prod.us-east-1.auth.desktop.kiro.dev",
  socialRedirectUri: "kiro://kiro.kiroAgent/authenticate-success",
  codeWhispererEndpoint: "https://codewhisperer.us-east-1.amazonaws.com",
  tokenValidPrefix: "aorAAAAAG",
};

export const GEMINI_CONFIG: OAuthConfig = {
  clientId:
    process.env.GEMINI_OAUTH_CLIENT_ID || "",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
  extraParams: {
    access_type: "offline",
    prompt: "consent",
  },
};

export const GEMINI_CONSTANTS = {
  clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET || "",
  userInfoEndpoint: "https://www.googleapis.com/oauth2/v1/userinfo?alt=json",
  projectDiscoveryEndpoint: "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
};

export const ANTIGRAVITY_CONFIG: OAuthConfig = {
  clientId:
    process.env.ANTIGRAVITY_OAUTH_CLIENT_ID || "",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
};

// ─── Cursor token storage paths (for import_token flow) ───
export const CURSOR_TOKEN_PATHS = {
  linux: "~/.config/Cursor/User/globalStorage/state.vscdb",
  darwin:
    "~/Library/Application Support/Cursor/User/globalStorage/state.vscdb",
  win32: "%APPDATA%\\Cursor\\User\\globalStorage\\state.vscdb",
};

// ─── AWS Region Validation (SSRF prevention) ───
export const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d{1,2}$/;

export function isValidAwsRegion(region: string): boolean {
  return AWS_REGION_PATTERN.test(region);
}

// ─── Provider Display Info ───
export interface ProviderDisplayInfo {
  name: string;
  icon?: string;
  description: string;
  flowType: FlowType;
  authMethods?: string[];
}

export const PROVIDER_INFO: Record<string, ProviderDisplayInfo> = {
  claude: {
    name: "Claude Code",
    description: "Anthropic Claude subscription via OAuth",
    flowType: "authorization_code_pkce",
  },
  codex: {
    name: "OpenAI Codex",
    description: "OpenAI ChatGPT Plus/Pro/Team subscription",
    flowType: "authorization_code_pkce",
  },
  github: {
    name: "GitHub Copilot",
    description: "GitHub Copilot subscription via device code",
    flowType: "device_code",
  },
  cursor: {
    name: "Cursor",
    description: "Import token from Cursor IDE",
    flowType: "import_token",
    authMethods: ["import"],
  },
  kiro: {
    name: "Kiro",
    description: "AWS CodeWhisperer / Kiro via multiple auth methods",
    flowType: "device_code",
    authMethods: [
      "builder-id",
      "idc",
      "social-google",
      "social-github",
      "import",
      "api-key",
    ],
  },
  "gemini-cli": {
    name: "Gemini CLI",
    description: "Google Gemini via OAuth 2.0",
    flowType: "authorization_code",
  },
  antigravity: {
    name: "Antigravity",
    description: "Google Cloud CodeAssist",
    flowType: "authorization_code",
  },
};
