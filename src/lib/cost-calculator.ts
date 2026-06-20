/**
 * Cost Calculator — estimates request cost based on model pricing.
 *
 * 3-layer fallback (inspired by 9router):
 *   1. Provider-specific override (PROVIDER_PRICING)
 *   2. Exact model match (MODEL_PRICING)
 *   3. Glob pattern match (PATTERN_PRICING)
 *
 * Tracks 5 token types: input, output, cached, reasoning, cache_creation.
 * Prices are in USD per 1M tokens.
 */

// ─── Types ───

export interface ModelPricing {
  input: number;
  output: number;
  cached?: number;
  reasoning?: number;
  cache_creation?: number;
}

export interface TokenUsage {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  cached_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_tokens?: number;
  cache_creation_input_tokens?: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  cachedCost: number;
  reasoningCost: number;
  cacheCreationCost: number;
  totalCost: number;
  pricing: ModelPricing;
}

// ─── Canonical Model Pricing (provider-agnostic) ───

const MODEL_PRICING: Record<string, ModelPricing> = {
  // === Anthropic / Claude ===
  "claude-opus-4-6":            { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-opus-4-5-20251101":   { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  },
  "claude-sonnet-4-6":          { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-sonnet-4-5-20250929": { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  },
  "claude-haiku-4-5-20251001":  { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  },
  "claude-sonnet-4-20250514":   { input: 3.00,  output: 15.00, cached: 1.50,  reasoning: 15.00,  cache_creation: 3.00  },
  "claude-opus-4-20250514":     { input: 15.00, output: 25.00, cached: 7.50,  reasoning: 112.50, cache_creation: 15.00 },
  "claude-3-5-sonnet-20241022": { input: 3.00,  output: 15.00, cached: 1.50,  reasoning: 15.00,  cache_creation: 3.00  },
  "claude-haiku-4.5":           { input: 0.50,  output: 2.50,  cached: 0.05,  reasoning: 3.75,   cache_creation: 0.50  },
  "claude-opus-4.1":            { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-opus-4.5":            { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-opus-4.6":            { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 37.50,  cache_creation: 5.00  },
  "claude-sonnet-4":            { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-sonnet-4.5":          { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },
  "claude-sonnet-4.6":          { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 22.50,  cache_creation: 3.00  },

  // === OpenAI / GPT ===
  "gpt-3.5-turbo":              { input: 0.50,  output: 1.50,  cached: 0.25,  reasoning: 2.25,   cache_creation: 0.50  },
  "gpt-4":                      { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-4-turbo":                { input: 10.00, output: 30.00, cached: 5.00,  reasoning: 45.00,  cache_creation: 10.00 },
  "gpt-4o":                     { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-4o-mini":                { input: 0.15,  output: 0.60,  cached: 0.075, reasoning: 0.90,   cache_creation: 0.15  },
  "gpt-4.1":                    { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  },
  "gpt-4.1-mini":               { input: 0.40,  output: 1.60,  cached: 0.20,  reasoning: 2.40,   cache_creation: 0.40  },
  "gpt-4.1-nano":               { input: 0.10,  output: 0.40,  cached: 0.05,  reasoning: 0.60,   cache_creation: 0.10  },
  "gpt-5":                      { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  },
  "gpt-5-mini":                 { input: 0.75,  output: 3.00,  cached: 0.375, reasoning: 4.50,   cache_creation: 0.75  },
  "gpt-5-codex":                { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  },
  "gpt-5.1":                    { input: 4.00,  output: 16.00, cached: 2.00,  reasoning: 24.00,  cache_creation: 4.00  },
  "gpt-5.1-codex":              { input: 4.00,  output: 16.00, cached: 2.00,  reasoning: 24.00,  cache_creation: 4.00  },
  "o1":                         { input: 15.00, output: 60.00, cached: 7.50,  reasoning: 90.00,  cache_creation: 15.00 },
  "o1-mini":                    { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  },
  "o3":                         { input: 2.00,  output: 8.00,  cached: 1.00,  reasoning: 12.00,  cache_creation: 2.00  },
  "o3-mini":                    { input: 1.10,  output: 4.40,  cached: 0.55,  reasoning: 6.60,   cache_creation: 1.10  },
  "o4-mini":                    { input: 1.10,  output: 4.40,  cached: 0.55,  reasoning: 6.60,   cache_creation: 1.10  },

  // === Gemini ===
  "gemini-2.5-pro":             { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  },
  "gemini-2.5-flash":           { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.30  },
  "gemini-2.5-flash-lite":      { input: 0.15,  output: 1.25,  cached: 0.015, reasoning: 1.875,  cache_creation: 0.15  },
  "gemini-2.0-flash":           { input: 0.10,  output: 0.40,  cached: 0.01,  reasoning: 0.60,   cache_creation: 0.10  },
  "gemini-1.5-pro":             { input: 1.25,  output: 5.00,  cached: 0.16,  reasoning: 7.50,   cache_creation: 1.25  },
  "gemini-1.5-flash":           { input: 0.075, output: 0.30,  cached: 0.01,  reasoning: 0.45,   cache_creation: 0.075 },

  // === DeepSeek ===
  "deepseek-chat":              { input: 0.14,  output: 0.28,  cached: 0.003, reasoning: 0.28,   cache_creation: 0.14  },
  "deepseek-reasoner":          { input: 0.14,  output: 0.28,  cached: 0.003, reasoning: 0.28,   cache_creation: 0.14  },
  "deepseek-r1":                { input: 0.14,  output: 0.28,  cached: 0.003, reasoning: 0.28,   cache_creation: 0.14  },

  // === Qwen ===
  "qwen3-coder-plus":           { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  },
  "qwen3-coder-flash":          { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  },

  // === Kimi ===
  "kimi-k2":                    { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  },
  "kimi-k2-thinking":           { input: 1.50,  output: 6.00,  cached: 0.75,  reasoning: 9.00,   cache_creation: 1.50  },

  // === GLM ===
  "glm-4.6":                    { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  },
  "glm-4.7":                    { input: 0.75,  output: 3.00,  cached: 0.375, reasoning: 4.50,   cache_creation: 0.75  },
  "glm-5":                      { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  },
  "glm-5-2":                    { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  },

  // === MiniMax ===
  "MiniMax-M3":                 { input: 0.30,  output: 1.20,  cached: 0.06,  reasoning: 1.80,   cache_creation: 0.30  },

  // === Grok ===
  "grok-3":                     { input: 3.00,  output: 15.00, cached: 1.50,  reasoning: 22.50,  cache_creation: 3.00  },
  "grok-3-mini":                { input: 0.30,  output: 0.50,  cached: 0.15,  reasoning: 0.75,   cache_creation: 0.30  },

  // === Mistral ===
  "mistral-large":              { input: 2.00,  output: 6.00,  cached: 1.00,  reasoning: 9.00,   cache_creation: 2.00  },
  "codestral":                  { input: 0.30,  output: 0.90,  cached: 0.15,  reasoning: 1.35,   cache_creation: 0.30  },

  // === Meta Llama ===
  "llama-4-maverick":           { input: 0.50,  output: 1.50,  cached: 0.25,  reasoning: 2.25,   cache_creation: 0.50  },
  "llama-4-scout":              { input: 0.20,  output: 0.60,  cached: 0.10,  reasoning: 0.90,   cache_creation: 0.20  },
};

// ─── Provider-specific pricing overrides ───

const PROVIDER_PRICING: Record<string, Record<string, ModelPricing>> = {
  // GitHub Copilot has different GPT-5 codex pricing
  gh: {
    "gpt-5.3-codex": { input: 1.75, output: 14.00, cached: 0.175, reasoning: 14.00, cache_creation: 1.75 },
  },
};

// ─── Pattern-based pricing fallback ───

interface PatternEntry {
  pattern: string;
  pricing: ModelPricing;
}

const PATTERN_PRICING: PatternEntry[] = [
  // Claude
  { pattern: "claude-opus-*",   pricing: { input: 5.00,  output: 25.00, cached: 0.50,  reasoning: 25.00,  cache_creation: 6.25  } },
  { pattern: "claude-sonnet-*", pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  } },
  { pattern: "claude-haiku-*",  pricing: { input: 1.00,  output: 5.00,  cached: 0.10,  reasoning: 5.00,   cache_creation: 1.25  } },
  { pattern: "claude-*",        pricing: { input: 3.00,  output: 15.00, cached: 0.30,  reasoning: 15.00,  cache_creation: 3.75  } },

  // Gemini
  { pattern: "gemini-*-flash-lite", pricing: { input: 0.15, output: 1.25, cached: 0.015, reasoning: 1.875, cache_creation: 0.15 } },
  { pattern: "gemini-*-flash",  pricing: { input: 0.30,  output: 2.50,  cached: 0.03,  reasoning: 3.75,   cache_creation: 0.30  } },
  { pattern: "gemini-*-pro",    pricing: { input: 2.00,  output: 12.00, cached: 0.25,  reasoning: 18.00,  cache_creation: 2.00  } },
  { pattern: "gemini-*",        pricing: { input: 0.50,  output: 3.00,  cached: 0.03,  reasoning: 4.50,   cache_creation: 0.50  } },

  // GPT / OpenAI
  { pattern: "gpt-5*-codex-*",  pricing: { input: 4.00,  output: 16.00, cached: 2.00,  reasoning: 24.00,  cache_creation: 4.00  } },
  { pattern: "gpt-5*-codex",    pricing: { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  } },
  { pattern: "gpt-5*",          pricing: { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  } },
  { pattern: "gpt-4o-*",        pricing: { input: 0.15,  output: 0.60,  cached: 0.075, reasoning: 0.90,   cache_creation: 0.15  } },
  { pattern: "gpt-4*",          pricing: { input: 2.50,  output: 10.00, cached: 1.25,  reasoning: 15.00,  cache_creation: 2.50  } },

  // o-series
  { pattern: "o1-*",            pricing: { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  } },
  { pattern: "o3-*",            pricing: { input: 10.00, output: 40.00, cached: 5.00,  reasoning: 60.00,  cache_creation: 10.00 } },
  { pattern: "o4-*",            pricing: { input: 2.00,  output: 8.00,  cached: 1.00,  reasoning: 12.00,  cache_creation: 2.00  } },

  // Qwen
  { pattern: "qwen*-coder-*",  pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },
  { pattern: "qwen*",          pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // Kimi
  { pattern: "kimi-*-thinking", pricing: { input: 1.80,  output: 7.20,  cached: 0.90,  reasoning: 10.80,  cache_creation: 1.80  } },
  { pattern: "kimi-*",         pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },

  // DeepSeek
  { pattern: "deepseek-*",     pricing: { input: 0.14,  output: 0.28,  cached: 0.003, reasoning: 0.28,   cache_creation: 0.14  } },

  // GLM
  { pattern: "glm-5*",         pricing: { input: 1.00,  output: 4.00,  cached: 0.50,  reasoning: 6.00,   cache_creation: 1.00  } },
  { pattern: "glm-*",          pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // MiniMax
  { pattern: "minimax-*",      pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // Grok
  { pattern: "grok-*",         pricing: { input: 0.50,  output: 2.00,  cached: 0.25,  reasoning: 3.00,   cache_creation: 0.50  } },

  // Mistral
  { pattern: "mistral-*",      pricing: { input: 2.00,  output: 6.00,  cached: 1.00,  reasoning: 9.00,   cache_creation: 2.00  } },
  { pattern: "codestral*",     pricing: { input: 0.30,  output: 0.90,  cached: 0.15,  reasoning: 1.35,   cache_creation: 0.30  } },

  // Llama
  { pattern: "llama-4-*",      pricing: { input: 0.50,  output: 1.50,  cached: 0.25,  reasoning: 2.25,   cache_creation: 0.50  } },
  { pattern: "llama-*",        pricing: { input: 0.20,  output: 0.60,  cached: 0.10,  reasoning: 0.90,   cache_creation: 0.20  } },

  // Codex (generic)
  { pattern: "codex-*",        pricing: { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  } },
  { pattern: "*-codex",        pricing: { input: 3.00,  output: 12.00, cached: 1.50,  reasoning: 18.00,  cache_creation: 3.00  } },
];

// ─── Pattern Matching ───

/**
 * Match a model against a glob pattern. Supports * as wildcard.
 * Case-insensitive.
 */
function matchPattern(pattern: string, model: string): boolean {
  const regex = new RegExp(
    "^" + pattern.split("*").map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    "i"
  );
  return regex.test(model);
}

// ─── Pricing Resolution ───

/**
 * Resolve pricing for a model using 3-step fallback:
 *   1. PROVIDER_PRICING[provider][model]
 *   2. MODEL_PRICING[model]
 *   3. PATTERN_PRICING (glob match, first wins)
 *
 * @param model - Model name (e.g. "claude-sonnet-4", "openrouter/gpt-4o")
 * @param provider - Provider alias or prefix (optional)
 */
export function getPricingForModel(model: string, provider?: string): ModelPricing | null {
  if (!model) return null;

  // Strip vendor prefix: "openrouter/claude-sonnet-4" → "claude-sonnet-4"
  const baseModel = model.includes("/") ? model.split("/").pop()! : model;

  // 1. Provider-specific override
  if (provider && PROVIDER_PRICING[provider]?.[baseModel]) {
    return PROVIDER_PRICING[provider][baseModel];
  }

  // 2. Exact model match
  if (MODEL_PRICING[baseModel]) return MODEL_PRICING[baseModel];
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  // 3. Pattern fallback (first match wins)
  for (const { pattern, pricing } of PATTERN_PRICING) {
    if (matchPattern(pattern, baseModel) || matchPattern(pattern, model)) {
      return pricing;
    }
  }

  return null;
}

// ─── Cost Calculation ───

/**
 * Calculate cost from token usage and pricing.
 * Handles cached tokens, reasoning tokens, and cache creation tokens.
 */
export function calculateCost(
  model: string,
  tokens: TokenUsage,
  provider?: string
): CostEstimate | null {
  const pricing = getPricingForModel(model, provider);
  if (!pricing) return null;

  const inputTokens = tokens.prompt_tokens || tokens.input_tokens || 0;
  const cachedTokens = tokens.cached_tokens || tokens.cache_read_input_tokens || 0;
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  const outputTokens = tokens.completion_tokens || tokens.output_tokens || 0;
  const reasoningTokens = tokens.reasoning_tokens || 0;
  const cacheCreationTokens = tokens.cache_creation_input_tokens || 0;

  const inputCost = (nonCachedInput / 1_000_000) * pricing.input;
  const cachedCost = (cachedTokens / 1_000_000) * (pricing.cached ?? pricing.input);
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const reasoningCost = (reasoningTokens / 1_000_000) * (pricing.reasoning ?? pricing.output);
  const cacheCreationCost = (cacheCreationTokens / 1_000_000) * (pricing.cache_creation ?? pricing.input);

  return {
    inputCost,
    outputCost,
    cachedCost,
    reasoningCost,
    cacheCreationCost,
    totalCost: inputCost + outputCost + cachedCost + reasoningCost + cacheCreationCost,
    pricing,
  };
}

/**
 * Simple cost calculation when you only have input/output token counts.
 * (backward compat with our existing request_logs that only track tokens_in/tokens_out)
 */
export function calculateSimpleCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  provider?: string
): number | null {
  const pricing = getPricingForModel(model, provider);
  if (!pricing) return null;

  const inputCost = (tokensIn / 1_000_000) * pricing.input;
  const outputCost = (tokensOut / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Format cost for display.
 */
export function formatCost(cost: number): string {
  if (cost === null || cost === undefined || isNaN(cost)) return "$0.00";
  if (cost === 0) return "$0.00";
  if (cost < 0.0001) return "< $0.0001";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}
