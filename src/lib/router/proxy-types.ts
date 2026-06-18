/**
 * Shared types for the proxy/router layer.
 *
 * Kept in its own file so translators (anthropic, gemini, etc.) can import
 * the canonical request shape without pulling in the full proxy.ts module
 * (which would create a circular import).
 */

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string | unknown }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  provider?: Record<string, unknown>;
  [key: string]: unknown;
}
