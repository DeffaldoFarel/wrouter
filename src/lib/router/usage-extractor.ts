/**
 * Multi-format usage extractor.
 *
 * Different providers return token usage in different shapes:
 *   - OpenAI / DeepSeek / Genflow:    usage.prompt_tokens / completion_tokens
 *   - Anthropic Claude:                usage.input_tokens / output_tokens
 *   - OpenAI Responses API:            response.usage.input_tokens / output_tokens (also message_delta)
 *   - Google Gemini:                   usageMetadata.promptTokenCount / candidatesTokenCount
 *   - Ollama:                          prompt_eval_count / eval_count (when done=true)
 *
 * This module normalizes all of them into a single OpenAI-style object so the
 * router can store a consistent shape in the DB and forward the original (or a
 * normalized) usage block to the client.
 */

export interface NormalizedUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Try to pull a usage object out of an arbitrary JSON chunk.
 *
 * Returns `null` if no recognizable usage field is present.
 * Returns an object even when fields are 0 — caller decides if that counts as "real" usage.
 */
export function extractUsage(chunk: unknown): NormalizedUsage | null {
  if (!chunk || typeof chunk !== "object") return null;
  const obj = chunk as Record<string, unknown>;

  // ── Anthropic Claude streaming: message_delta event ──
  // { type: "message_delta", usage: { input_tokens, output_tokens, ... } }
  if (obj.type === "message_delta" && obj.usage && typeof obj.usage === "object") {
    const u = obj.usage as Record<string, unknown>;
    const pt = numOrZero(u.input_tokens);
    const ct = numOrZero(u.output_tokens);
    if (pt > 0 || ct > 0 || "input_tokens" in u || "output_tokens" in u) {
      return normalize({
        prompt_tokens: pt,
        completion_tokens: ct,
        cache_read_input_tokens: numOrUndef(u.cache_read_input_tokens),
        cache_creation_input_tokens: numOrUndef(u.cache_creation_input_tokens),
      });
    }
  }

  // ── Anthropic Claude non-streaming: top-level usage with input_tokens/output_tokens ──
  if (
    obj.usage &&
    typeof obj.usage === "object" &&
    "input_tokens" in (obj.usage as Record<string, unknown>)
  ) {
    const u = obj.usage as Record<string, unknown>;
    return normalize({
      prompt_tokens: numOrZero(u.input_tokens),
      completion_tokens: numOrZero(u.output_tokens),
      cache_read_input_tokens: numOrUndef(u.cache_read_input_tokens),
      cache_creation_input_tokens: numOrUndef(u.cache_creation_input_tokens),
    });
  }

  // ── OpenAI Responses API: response.completed / response.done ──
  if (
    (obj.type === "response.completed" || obj.type === "response.done") &&
    obj.response &&
    typeof obj.response === "object"
  ) {
    const resp = obj.response as Record<string, unknown>;
    if (resp.usage && typeof resp.usage === "object") {
      const u = resp.usage as Record<string, unknown>;
      const inputTokens = numOrZero(u.input_tokens ?? u.prompt_tokens);
      const outputTokens = numOrZero(u.output_tokens ?? u.completion_tokens);
      const inputDetails = u.input_tokens_details as Record<string, unknown> | undefined;
      const outputDetails = u.output_tokens_details as Record<string, unknown> | undefined;
      return normalize({
        prompt_tokens: inputTokens,
        completion_tokens: outputTokens,
        cached_tokens: numOrUndef(inputDetails?.cached_tokens),
        reasoning_tokens: numOrUndef(outputDetails?.reasoning_tokens),
      });
    }
  }

  // ── OpenAI / DeepSeek / Genflow: top-level usage with prompt_tokens ──
  if (
    obj.usage &&
    typeof obj.usage === "object" &&
    "prompt_tokens" in (obj.usage as Record<string, unknown>)
  ) {
    const u = obj.usage as Record<string, unknown>;
    const promptDetails = u.prompt_tokens_details as Record<string, unknown> | undefined;
    const completionDetails = u.completion_tokens_details as Record<string, unknown> | undefined;
    return normalize({
      prompt_tokens: numOrZero(u.prompt_tokens),
      completion_tokens: numOrZero(u.completion_tokens),
      total_tokens: numOrUndef(u.total_tokens),
      cached_tokens: numOrUndef(promptDetails?.cached_tokens ?? u.prompt_cache_hit_tokens),
      reasoning_tokens: numOrUndef(completionDetails?.reasoning_tokens),
    });
  }

  // ── Google Gemini: usageMetadata.promptTokenCount / candidatesTokenCount ──
  // Gemini sometimes wraps inside `response.usageMetadata` (e.g. Antigravity proxy).
  const candidateMeta = obj.usageMetadata ?? (obj.response as Record<string, unknown> | undefined)?.usageMetadata;
  if (candidateMeta && typeof candidateMeta === "object") {
    const meta = candidateMeta as Record<string, unknown>;
    return normalize({
      prompt_tokens: numOrZero(meta.promptTokenCount),
      completion_tokens: numOrZero(meta.candidatesTokenCount),
      total_tokens: numOrUndef(meta.totalTokenCount),
      cached_tokens: numOrUndef(meta.cachedContentTokenCount),
      reasoning_tokens: numOrUndef(meta.thoughtsTokenCount),
    });
  }

  // ── Ollama NDJSON: { done: true, prompt_eval_count, eval_count } ──
  if (obj.done === true && typeof obj.prompt_eval_count === "number") {
    return normalize({
      prompt_tokens: numOrZero(obj.prompt_eval_count),
      completion_tokens: numOrZero(obj.eval_count),
    });
  }

  return null;
}

/**
 * Returns true when at least one token field is greater than zero.
 * Empty {} or all-zeros means upstream "didn't really tell us anything".
 */
export function hasMeaningfulUsage(usage: NormalizedUsage | null): boolean {
  if (!usage) return false;
  return (
    (usage.prompt_tokens ?? 0) > 0 ||
    (usage.completion_tokens ?? 0) > 0 ||
    (usage.total_tokens ?? 0) > 0
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function normalize(u: NormalizedUsage): NormalizedUsage {
  const out: NormalizedUsage = {
    prompt_tokens: u.prompt_tokens,
    completion_tokens: u.completion_tokens,
  };
  out.total_tokens = u.total_tokens ?? u.prompt_tokens + u.completion_tokens;
  if (u.cached_tokens !== undefined) out.cached_tokens = u.cached_tokens;
  if (u.reasoning_tokens !== undefined) out.reasoning_tokens = u.reasoning_tokens;
  if (u.cache_read_input_tokens !== undefined) out.cache_read_input_tokens = u.cache_read_input_tokens;
  if (u.cache_creation_input_tokens !== undefined) out.cache_creation_input_tokens = u.cache_creation_input_tokens;
  return out;
}
