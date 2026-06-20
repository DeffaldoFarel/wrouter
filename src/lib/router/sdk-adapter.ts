/**
 * SDK Adapter -- use official Anthropic and OpenAI SDKs for provider calls.
 *
 * Benefits over raw fetch:
 * - Automatic token usage extraction
 * - Built-in retry with exponential backoff
 * - Native streaming handling
 * - Type-safe request/response
 *
 * The adapter accepts OpenAI-format requests, uses the appropriate SDK,
 * and returns OpenAI-format responses (with usage data).
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatCompletionRequest } from "./proxy-types";

// --- Result types ---

export interface SDKUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface SDKNonStreamResult {
  type: "non-stream";
  body: Record<string, unknown>; // OpenAI-format response body
  usage: SDKUsage;
}

export interface SDKStreamResult {
  type: "stream";
  stream: AsyncIterable<string>; // OpenAI SSE chunks
  usage: Promise<SDKUsage | null>; // resolved after stream ends
}

export type SDKResult = SDKNonStreamResult | SDKStreamResult;

// --- Anthropic SDK adapter ---

async function callAnthropic(
  apiKey: string,
  model: string,
  body: ChatCompletionRequest,
  baseUrl?: string
): Promise<SDKResult> {
  const anthropic = new Anthropic({
    apiKey,
    baseURL: baseUrl ? baseUrl.replace(/\/$/, "") : undefined,
  });

  const messages = body.messages ?? [];
  const systemMsg = messages.find(
    (m) => m.role === "system" && typeof m.content === "string"
  );

  const userMessages = messages.filter(
    (m) => m.role !== "system"
  );

  const params: Anthropic.MessageCreateParams = {
    model,
    messages: userMessages as Anthropic.MessageParam[],
    max_tokens: body.max_tokens ?? 4096,
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.top_p !== undefined && { top_p: body.top_p }),
    ...(body.stop && { stop_sequences: Array.isArray(body.stop) ? body.stop : [body.stop] }),
  };

  if (systemMsg && typeof systemMsg.content === "string") {
    params.system = systemMsg.content;
  }

  // --- Streaming ---
  if (body.stream) {
    const stream = await anthropic.messages.create({
      ...params,
      stream: true,
    });

    let accumulatedContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const sseStream: AsyncIterable<string> = (async function* () {
      const id = `anthropic-sdk-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      // Yield initial chunk
      yield `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
      })}\n\n`;

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta") {
          const text = chunk.delta?.type === "text_delta" ? chunk.delta.text : "";
          if (text) {
            accumulatedContent += text;
            yield `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created,
              model,
              choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
            })}\n\n`;
          }
        }
        if (chunk.type === "message_start" && chunk.message?.usage) {
          inputTokens = chunk.message.usage.input_tokens ?? 0;
        }
        if (chunk.type === "message_delta" && chunk.usage) {
          outputTokens = chunk.usage.output_tokens ?? 0;
        }
      }

      // Final chunk with usage
      yield `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [],
        usage: {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens,
        },
      })}\n\n`;

      yield "data: [DONE]\n\n";
    })();

    return {
      type: "stream",
      stream: sseStream,
      usage: Promise.resolve({
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      }),
    };
  }

  // --- Non-streaming ---
  const message = await anthropic.messages.create(params);

  const content = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const openaiResponse = {
    id: message.id,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content,
          refusal: null,
        },
        finish_reason: message.stop_reason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: message.usage?.input_tokens ?? 0,
      completion_tokens: message.usage?.output_tokens ?? 0,
      total_tokens:
        (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
    },
  };

  return {
    type: "non-stream",
    body: openaiResponse,
    usage: {
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      totalTokens:
        (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
    },
  };
}

// --- OpenAI SDK adapter ---

async function callOpenAI(
  apiKey: string,
  model: string,
  body: ChatCompletionRequest,
  baseUrl?: string
): Promise<SDKResult> {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl ?? undefined,
  });

  const params: OpenAI.ChatCompletionCreateParams = {
    model,
    messages: body.messages as OpenAI.ChatCompletionMessageParam[],
    ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.top_p !== undefined && { top_p: body.top_p }),
    ...(body.stop && { stop: Array.isArray(body.stop) ? body.stop : [body.stop] }),
    ...(body.stream && { stream: true }),
    ...(body.stream_options && typeof body.stream_options === "object" ? { stream_options: body.stream_options as Record<string, unknown> } : {}),
  };

  // --- Streaming ---
  if (body.stream) {
    const stream = await client.chat.completions.create({
      ...params,
      stream: true,
    }) as unknown as AsyncIterable<Record<string, unknown>>;

    let usageFromStream: SDKUsage | null = null;

    const sseStream: AsyncIterable<string> = (async function* () {
      for await (const chunk of stream) {
        yield `data: ${JSON.stringify(chunk)}\n\n`;
        const u = chunk.usage as Record<string, number> | undefined;
        if (u) {
          usageFromStream = {
            inputTokens: u.prompt_tokens ?? 0,
            outputTokens: u.completion_tokens ?? 0,
            totalTokens: u.total_tokens ?? 0,
          };
        }
      }
      yield "data: [DONE]\n\n";
    })();

    return {
      type: "stream",
      stream: sseStream,
      usage: Promise.resolve(usageFromStream),
    };
  }

  // --- Non-streaming ---
  const completion = await client.chat.completions.create(params) as unknown as Record<string, unknown>;
  const u = completion.usage as Record<string, number> | undefined;
  const choices = completion.choices as Array<Record<string, unknown>> | undefined;

  const openaiResponse = {
    id: completion.id,
    object: completion.object,
    created: completion.created,
    model: completion.model,
    choices: (choices ?? []).map((c: Record<string, unknown>) => ({
      index: c.index,
      message: {
        role: (c.message as Record<string, unknown>)?.role,
        content: (c.message as Record<string, unknown>)?.content,
        refusal: null,
      },
      finish_reason: c.finish_reason,
    })),
    usage: u
      ? {
          prompt_tokens: u.prompt_tokens ?? 0,
          completion_tokens: u.completion_tokens ?? 0,
          total_tokens: u.total_tokens ?? 0,
        }
      : undefined,
  };

  return {
    type: "non-stream",
    body: openaiResponse,
    usage: {
      inputTokens: u?.prompt_tokens ?? 0,
      outputTokens: u?.completion_tokens ?? 0,
      totalTokens: u?.total_tokens ?? 0,
    },
  };
}

// --- Main entry point ---

/**
 * Route a request through the appropriate SDK based on provider type.
 *
 * Provider format detection:
 * - "anthropic" -> Anthropic SDK (api.anthropic.com)
 * - "openai" -> OpenAI SDK (api.openai.com)
 * - Other -> falls back to raw fetch (existing behavior)
 */
export async function sdkCall(
  providerType: string,
  apiKey: string,
  model: string,
  body: ChatCompletionRequest,
  baseUrl?: string
): Promise<SDKResult | null> {
  try {
    if (providerType === "anthropic") {
      return callAnthropic(apiKey, model, body, baseUrl);
    }
    if (providerType === "openai") {
      return callOpenAI(apiKey, model, body, baseUrl);
    }
    // Unknown provider type -> return null to signal fallback to raw fetch
    return null;
  } catch (err) {
    console.error("[sdk-adapter] SDK call failed:", providerType, model, err);
    // Return null to signal fallback
    return null;
  }
}
