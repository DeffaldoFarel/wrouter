/**
 * Token estimation utility for streaming responses where the upstream provider
 * does not honor `stream_options.include_usage: true` (e.g., Genflow).
 *
 * Uses gpt-tokenizer (cl100k_base / o200k_base) which is a reasonable proxy
 * for most modern LLM tokenizers. Accuracy is ~90-95% for common LLMs.
 *
 * Strategy:
 *   1. If upstream returns usage → use that (most accurate, free).
 *   2. Otherwise → tokenize request messages (input) and accumulated content (output).
 */

import { encode } from "gpt-tokenizer";
import logger from "@/lib/logger";

export interface MessageLike {
  role: string;
  content: string | unknown;
  [key: string]: unknown;
}

/**
 * Coerce arbitrary content (string, array of parts, object) to a string for tokenization.
 * OpenAI vision/multimodal messages have content as an array; we approximate by joining text parts.
 */
function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          // Image / non-text parts: approximate with a constant cost
          if (p.type === "image_url" || p.type === "image") return "[image]";
        }
        return "";
      })
      .join("\n");
  }
  if (content && typeof content === "object") {
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return "";
}

/**
 * Estimate input token count from a list of chat messages.
 *
 * This counts the textual content plus a small per-message overhead to mirror
 * OpenAI's documented chat-format overhead (~3-4 tokens per message for role/separators).
 */
export function estimateInputTokens(messages: MessageLike[]): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  let total = 0;
  for (const msg of messages) {
    try {
      const text = contentToString(msg.content);
      // 4 tokens per message for chat-format overhead (role, separators)
      total += 4 + encode(text).length;
      // Role itself adds ~1 token
      if (typeof msg.role === "string") {
        total += encode(msg.role).length;
      }
    } catch (err) {
      logger.warn({ err }, "estimateInputTokens: failed to encode message, skipping");
    }
  }
  // Add 2 tokens for assistant priming (OpenAI convention)
  total += 2;
  return total;
}

/**
 * Estimate output token count from accumulated assistant content.
 */
export function estimateOutputTokens(content: string): number {
  if (!content) return 0;
  try {
    return encode(content).length;
  } catch (err) {
    logger.warn({ err }, "estimateOutputTokens: failed to encode, returning 0");
    return 0;
  }
}
