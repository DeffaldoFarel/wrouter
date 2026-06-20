/**
 * SDK Adapter -- use official SDKs for ALL API Key Providers.
 *
 * Provider -> SDK mapping:
 * - Anthropic -> @anthropic-ai/sdk
 * - OpenAI -> openai SDK
 * - OpenRouter -> openai SDK (OpenAI-compatible, custom baseURL)
 * - DeepSeek -> openai SDK (OpenAI-compatible, custom baseURL)
 * - Google AI Studio -> @google/genai SDK
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { OpenRouter } from "@openrouter/sdk";
import { GoogleGenAI } from "@google/genai";
import type { ChatCompletionRequest } from "./proxy-types";

// --- Result types ---

export interface SDKUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost?: number;
  totalCost?: number;
}

export interface SDKNonStreamResult {
  type: "non-stream";
  body: Record<string, unknown>;
  usage: SDKUsage;
}

export interface SDKStreamResult {
  type: "stream";
  stream: AsyncIterable<string>;
  usage: Promise<SDKUsage | null>;
}

export type SDKResult = SDKNonStreamResult | SDKStreamResult;

// --- Anthropic SDK ---

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
  const userMessages = messages.filter((m) => m.role !== "system");

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

  if (body.stream) {
    return anthropicStream(anthropic, params, model);
  }

  const message = await anthropic.messages.create(params);
  return anthropicNonStreamResult(message, model);
}

async function anthropicStream(
  anthropic: Anthropic,
  params: Anthropic.MessageCreateParams,
  model: string
): Promise<SDKStreamResult> {
  const stream = await anthropic.messages.create({ ...params, stream: true });

  let inputTokens = 0;
  let outputTokens = 0;
  let accumulatedContent = "";

  const sseStream: AsyncIterable<string> = (async function* () {
    const id = `anthropic-sdk-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    yield `data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created, model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    })}\n\n`;

    for await (const chunk of stream) {
      if (chunk.type === "content_block_delta") {
        const text = chunk.delta?.type === "text_delta" ? chunk.delta.text : "";
        if (text) {
          accumulatedContent += text;
          yield `data: ${JSON.stringify({
            id, object: "chat.completion.chunk", created, model,
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

    yield `data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created, model, choices: [],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    })}\n\n`;
    yield "data: [DONE]\n\n";
  })();

  return {
    type: "stream",
    stream: sseStream,
    usage: Promise.resolve({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }),
  };
}

function anthropicNonStreamResult(message: Anthropic.Message, model: string): SDKNonStreamResult {
  const content = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const usage = {
    inputTokens: message.usage?.input_tokens ?? 0,
    outputTokens: message.usage?.output_tokens ?? 0,
    totalTokens: (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0),
  };

  return {
    type: "non-stream",
    body: {
      id: message.id, object: "chat.completion", created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, message: { role: "assistant", content, refusal: null }, finish_reason: message.stop_reason ?? "stop" }],
      usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.totalTokens },
    },
    usage,
  };
}

// --- OpenAI SDK (OpenAI, OpenRouter, DeepSeek) ---

async function callOpenAICompatible(
  providerType: string,
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

  if (providerType === "openrouter") {
    return callOpenRouter(apiKey, model, body);
  }

  if (body.stream) {
    return openaiStream(client, params, model);
  }

  const completion = await client.chat.completions.create(params) as unknown as Record<string, unknown>;
  return openaiNonStreamResult(completion, model);
}

async function openaiStream(
  client: OpenAI,
  params: OpenAI.ChatCompletionCreateParams,
  model: string
): Promise<SDKStreamResult> {
  const stream = await client.chat.completions.create({
    ...params, stream: true,
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

  return { type: "stream", stream: sseStream, usage: Promise.resolve(usageFromStream) };
}

function openaiNonStreamResult(completion: Record<string, unknown>, model: string): SDKNonStreamResult {
  const u = completion.usage as Record<string, number> | undefined;
  const choices = completion.choices as Array<Record<string, unknown>> | undefined;

  const usage = {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };

  return {
    type: "non-stream",
    body: {
      id: completion.id, object: completion.object, created: completion.created, model,
      choices: (choices ?? []).map((c: Record<string, unknown>) => ({
        index: c.index,
        message: { role: (c.message as Record<string, unknown>)?.role, content: (c.message as Record<string, unknown>)?.content, refusal: null },
        finish_reason: c.finish_reason,
      })),
      usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.totalTokens },
    },
    usage,
  };
}

// --- OpenRouter SDK ---

async function callOpenRouter(
  apiKey: string,
  model: string,
  body: ChatCompletionRequest
): Promise<SDKResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = new OpenRouter({ apiKey });

  const chatRequest: Record<string, unknown> = {
    model,
    messages: body.messages ?? [],
    ...(body.max_tokens !== undefined && { max_tokens: body.max_tokens }),
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.top_p !== undefined && { top_p: body.top_p }),
    ...(body.stop && { stop: Array.isArray(body.stop) ? body.stop : [body.stop] }),
  };

  if (body.stream) {
    return openrouterStream(client, chatRequest, model);
  }

  const response = await client.chat.send({ chatRequest });
  return openrouterNonStreamResult(response, model);
}

async function openrouterStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  chatRequest: Record<string, unknown>,
  model: string
): Promise<SDKStreamResult> {
  const stream: AsyncIterable<Record<string, unknown>> = await client.chat.stream({
    chatRequest: { ...chatRequest, stream: true },
  });

  let resolveUsage: (u: SDKUsage | null) => void;
  const usagePromise = new Promise<SDKUsage | null>((resolve) => {
    resolveUsage = resolve;
  });

  let usageFromStream: SDKUsage | null = null;

  const sseStream: AsyncIterable<string> = (async function* () {
    for await (const chunk of stream) {
      yield `data: ${JSON.stringify(chunk)}

`;
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
    // Resolve usage AFTER stream fully consumed
    resolveUsage!(usageFromStream);
  })();

  return { type: "stream", stream: sseStream, usage: usagePromise };
}

function openrouterNonStreamResult(response: unknown, model: string): SDKNonStreamResult {
  const r = response as Record<string, unknown>;
  const u = r.usage as Record<string, number> | undefined;
  const choices = r.choices as Array<Record<string, unknown>> | undefined;

  const usage = {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    totalTokens: u?.total_tokens ?? 0,
  };

  return {
    type: "non-stream",
    body: {
      id: r.id,
      object: r.object ?? "chat.completion",
      created: r.created ?? Math.floor(Date.now() / 1000),
      model,
      choices: (choices ?? []).map((c: Record<string, unknown>) => ({
        index: c.index,
        message: {
          role: (c.message as Record<string, unknown>)?.role,
          content: (c.message as Record<string, unknown>)?.content,
          refusal: null,
        },
        finish_reason: c.finish_reason,
      })),
      usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.totalTokens },
    },
    usage,
  };
}

// --- Google GenAI SDK ---

async function callGoogleGenAI(
  apiKey: string,
  model: string,
  body: ChatCompletionRequest,
  baseUrl?: string
): Promise<SDKResult> {
  const ai = new GoogleGenAI({ apiKey });

  const messages = body.messages ?? [];
  const systemMsg = messages.find((m) => m.role === "system" && typeof m.content === "string");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));

  const config: Record<string, unknown> = {
    ...(body.temperature !== undefined && { temperature: body.temperature }),
    ...(body.top_p !== undefined && { topP: body.top_p }),
    ...(body.max_tokens !== undefined && { maxOutputTokens: body.max_tokens }),
    ...(body.stop && { stopSequences: Array.isArray(body.stop) ? body.stop : [body.stop] }),
  };
  if (systemMsg && typeof systemMsg.content === "string") {
    config.systemInstruction = systemMsg.content;
  }

  if (body.stream) {
    return googleStream(ai, model, contents, config);
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  const text = response.text ?? "";
  const usage = response.usageMetadata
    ? {
        inputTokens: response.usageMetadata.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata.totalTokenCount ?? 0,
      }
    : { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  return {
    type: "non-stream",
    body: {
      id: `gemini-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message: { role: "assistant", content: text, refusal: null }, finish_reason: "stop" }],
      usage: { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.totalTokens },
    },
    usage,
  };
}

async function googleStream(
  ai: GoogleGenAI,
  model: string,
  contents: Array<Record<string, unknown>>,
  config: Record<string, unknown>
): Promise<SDKStreamResult> {
  const stream = await ai.models.generateContentStream({
    model,
    contents,
    config,
  });

  let accumulatedContent = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const sseStream: AsyncIterable<string> = (async function* () {
    const id = `gemini-sdk-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    yield `data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created, model,
      choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
    })}\n\n`;

    for await (const chunk of stream) {
      const text = chunk.text ?? "";
      if (text) {
        accumulatedContent += text;
        yield `data: ${JSON.stringify({
          id, object: "chat.completion.chunk", created, model,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        })}\n\n`;
      }
      const um = chunk.usageMetadata as Record<string, number> | undefined;
      if (um) {
        inputTokens = um.promptTokenCount ?? inputTokens;
        outputTokens = um.candidatesTokenCount ?? outputTokens;
      }
    }

    yield `data: ${JSON.stringify({
      id, object: "chat.completion.chunk", created, model, choices: [],
      usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    })}\n\n`;
    yield "data: [DONE]\n\n";
  })();

  return {
    type: "stream",
    stream: sseStream,
    usage: Promise.resolve({ inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }),
  };
}

// --- Main entry point ---

/**
 * Route a request through the appropriate SDK based on provider type.
 *
 * Provider -> SDK mapping:
 * - "anthropic" -> @anthropic-ai/sdk
 * - "openai" -> openai SDK
 * - "openrouter" -> openai SDK (custom baseURL)
 * - "deepseek" -> openai SDK (custom baseURL)
 * - "gemini" -> @google/genai SDK
 */
export async function sdkCall(
  providerType: string,
  apiKey: string,
  model: string,
  body: ChatCompletionRequest,
  baseUrl?: string
): Promise<SDKResult | null> {
  try {
    switch (providerType) {
      case "anthropic":
        return callAnthropic(apiKey, model, body, baseUrl);
      case "openai":
      case "deepseek":
      case "mimo":
      case "qwen":
        return callOpenAICompatible(providerType, apiKey, model, body, baseUrl);
      case "openrouter":
        return callOpenRouter(apiKey, model, body);
      case "gemini":
        return callGoogleGenAI(apiKey, model, body, baseUrl);
      default:
        return null;
    }
  } catch (err) {
    console.error("[sdk-adapter] SDK call failed:", providerType, model, err);
    return null;
  }
}
