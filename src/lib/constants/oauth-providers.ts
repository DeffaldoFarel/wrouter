// Daftar provider OAuth yang dikenal sistem.
// Dipakai bersama oleh halaman Providers, OAuth Connection Manager,
// dan OAuth Flow Modal supaya label/deskripsi konsisten.

export interface KnownOAuthProvider {
  id: string;
  name: string;
  prefix: string;
  description: string;
  brandColor: string;
  iconLabel: string;
}

export const KNOWN_OAUTH_PROVIDERS: KnownOAuthProvider[] = [
  {
    id: "claude",
    name: "Claude Code",
    prefix: "claude",
    description: "Anthropic Claude via OAuth device code flow. Auto-refreshing tokens.",
    brandColor: "#D97757",
    iconLabel: "CL",
  },
  {
    id: "codex",
    name: "OpenAI Codex",
    prefix: "codex",
    description: "OpenAI Codex CLI via OAuth. Supports GPT and o-series models.",
    brandColor: "#10A37F",
    iconLabel: "OA",
  },
  {
    id: "github",
    name: "GitHub Copilot",
    prefix: "github",
    description: "GitHub Copilot OAuth connection. Access to Copilot models.",
    brandColor: "#6e40c9",
    iconLabel: "GH",
  },
  {
    id: "cursor",
    name: "Cursor",
    prefix: "cursor",
    description: "Cursor editor OAuth. Auto-refreshing access to Cursor models.",
    brandColor: "#2563EB",
    iconLabel: "CU",
  },
  {
    id: "kiro",
    name: "Kiro",
    prefix: "kiro",
    description: "AWS CodeWhisperer / Kiro via SSO OIDC device code flow.",
    brandColor: "#FF9900",
    iconLabel: "KI",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    prefix: "gemini-cli",
    description: "Google Gemini via OAuth 2.0. Auto-discovers Cloud project.",
    brandColor: "#4285F4",
    iconLabel: "GE",
  },
];

// Helper buat ambil label provider OAuth berdasarkan id-nya.
// Fallback ke string id mentah kalau provider tidak dikenal.
export function getOAuthProviderLabel(provider: string): string {
  const found = KNOWN_OAUTH_PROVIDERS.find((p) => p.id === provider);
  return found?.name ?? provider;
}
