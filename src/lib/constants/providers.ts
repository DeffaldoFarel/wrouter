// Shared constants for API Key Providers

export interface KnownApiKeyProvider {
  prefix: string;
  name: string;
  description: string;
  baseUrl: string;
  docsUrl?: string;
  keyPlaceholder: string;
  keyHint?: string;
}

export const KNOWN_API_KEY_PROVIDERS: KnownApiKeyProvider[] = [
  {
    name: "OpenRouter",
    prefix: "openrouter",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "300+ models from 50+ providers via one API",
    docsUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-...",
    keyHint: "openrouter.ai/keys",
  },
  // Add more API Key Providers here as needed
];
