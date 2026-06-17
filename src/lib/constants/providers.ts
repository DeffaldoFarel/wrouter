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
  {
    name: "DeepSeek",
    prefix: "deepseek",
    baseUrl: "https://api.deepseek.com",
    description: "High-performance reasoning models (V4-Flash & V4-Pro) with thinking mode, 1M context",
    docsUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    keyHint: "platform.deepseek.com",
  },
  {
    name: "Google Gemini",
    prefix: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    description: "Frontier models (Gemini 3.5 Flash, 3.1 Pro, 2.5 Pro) with OpenAI-compatible endpoint, up to 2M context",
    docsUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    keyHint: "aistudio.google.com/apikey",
  },
  // Add more API Key Providers here as needed
];
