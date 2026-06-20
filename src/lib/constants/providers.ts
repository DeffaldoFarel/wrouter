// Shared constants for API Key Providers

export interface KnownApiKeyProvider {
  prefix: string;
  name: string;
  description: string;
  baseUrl: string;
  docsUrl?: string;
  keyPlaceholder: string;
  keyHint?: string;
  // Brand color (CSS color or hex) for icon background
  brandColor?: string;
  // Short label used inside the icon (e.g., "OR" for OpenRouter)
  iconLabel?: string;
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
    brandColor: "#000000",
    iconLabel: "OR",
  },
  {
    name: "DeepSeek",
    prefix: "deepseek",
    baseUrl: "https://api.deepseek.com",
    description: "High-performance reasoning models (V4-Flash & V4-Pro) with thinking mode, 1M context",
    docsUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    keyHint: "platform.deepseek.com",
    brandColor: "#4d6bfe",
    iconLabel: "DS",
  },
  {
    name: "Google AI Studio",
    prefix: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    description: "Frontier models (Gemini 3.5 Flash, 3.1 Pro, 2.5 Pro) with OpenAI-compatible endpoint, up to 2M context",
    docsUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    keyHint: "aistudio.google.com/apikey",
    brandColor: "#4285f4",
    iconLabel: "AI",
  },
  {
    name: "Anthropic",
    prefix: "anthropic",
    baseUrl: "https://api.anthropic.com",
    description: "Claude models (Opus 4, Sonnet 4, Haiku 3.5) — native API with thinking mode",
    docsUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    keyHint: "console.anthropic.com",
    brandColor: "#d97706",
    iconLabel: "AP",
  },
  {
    name: "OpenAI",
    prefix: "openai",
    baseUrl: "https://api.openai.com/v1",
    description: "GPT-5, GPT-4o, o3, o4-mini — official OpenAI API",
    docsUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-proj-...",
    keyHint: "platform.openai.com",
    brandColor: "#10a37f",
    iconLabel: "OA",
  },
  // Add more API Key Providers here as needed
];
