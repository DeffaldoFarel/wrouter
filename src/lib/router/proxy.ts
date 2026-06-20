import { RoutingResult, logRequest, incrementActiveJobs, decrementActiveJobs, notifyRequestStart } from "./engine";
import { recordError } from "../key-picker";
import { estimateInputTokens, estimateOutputTokens, MessageLike } from "./token-estimator";
import { extractUsage, hasMeaningfulUsage, NormalizedUsage } from "./usage-extractor";
import { openaiToAnthropicRequest, anthropicToOpenaiResponse, translateAnthropicStream } from "./translator/anthropic";
import type { ChatCompletionRequest } from "./proxy-types";
import logger from "@/lib/logger";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Re-export so existing call sites in route.ts keep working
export type { ChatCompletionRequest };

/**
 * Check if a URL is an OpenRouter endpoint.
 */
function isOpenRouter(baseUrl: string): boolean {
  return baseUrl.includes("openrouter.ai");
}

/**
 * Get OpenRouter provider sort setting from DB.
 * Returns "price" | "throughput" | "latency" | null
 */
function getOpenRouterSort(): string | null {
  try {
    const row = db.select().from(settings).where(eq(settings.key, "openrouter_provider_sort")).get();
    return row?.value || null;
  } catch {
    return null;
  }
}

/**
 * Inject OpenRouter provider preferences into the request body if applicable.
 * Only modifies the body when:
 *  1. Target is OpenRouter
 *  2. Setting `openrouter_provider_sort` is configured
 *  3. User hasn't already set their own `provider` field
 */
function injectOpenRouterProvider(
  body: ChatCompletionRequest,
  target: RoutingResult
): ChatCompletionRequest {
  if (!isOpenRouter(target.baseUrl)) return body;

  const sort = getOpenRouterSort();
  if (!sort) return body;

  // Don't override if user already specified provider preferences
  if (body.provider) return body;

  return {
    ...body,
    provider: { sort },
  };
}

interface ProxyResult {
  response: Response;
  providerId: string;
  latencyMs: number;
}

/**
 * Forward a chat completion request to a provider with fallback support.
 */
export async function proxyWithFallback(
  requestBody: ChatCompletionRequest,
  fallbackChain: RoutingResult[],
  apiKeyId?: string,
  requestDetail?: string
): Promise<ProxyResult> {
  let lastError: Error | null = null;
  incrementActiveJobs();

  try {
  for (const target of fallbackChain) {
    const startTime = Date.now();
    try {
      // Notify UI that a request is starting on this provider
      notifyRequestStart(target.providerId, target.providerName, target.model);

      const response = await forwardRequest(requestBody, target);
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        // Clone response before consuming to avoid double memory allocation
        const responseForClient = response.clone();

        // Parse upstream JSON to extract token usage (multi-format aware).
        // If the upstream did not give us usage, fall back to gpt-tokenizer estimation.
        let tokensIn: number | undefined = undefined;
        let tokensOut: number | undefined = undefined;
        let responseJson: string | null = null;
        let upstreamUsage: NormalizedUsage | null = null;
        let estimated = false;
        let parsedJson: Record<string, unknown> | null = null;

        try {
          const json = await response.json();
          parsedJson = json as Record<string, unknown>;
          responseJson = JSON.stringify(json);
          upstreamUsage = extractUsage(json);
        } catch { /* ignore parse errors — fall through to estimation */ }

        if (hasMeaningfulUsage(upstreamUsage)) {
          tokensIn = upstreamUsage!.prompt_tokens;
          tokensOut = upstreamUsage!.completion_tokens;
        } else {
          // Upstream didn't return usage (or returned all-zeros) → estimate locally
          try {
            const msgs = (requestBody.messages as MessageLike[]) ?? [];
            tokensIn = estimateInputTokens(msgs);

            // Try to read response text from common shapes
            let outText = "";
            if (parsedJson) {
              const choices = parsedJson.choices as Array<Record<string, unknown>> | undefined;
              if (Array.isArray(choices) && choices.length > 0) {
                const msg = choices[0]?.message as Record<string, unknown> | undefined;
                const content = msg?.content;
                if (typeof content === "string") outText = content;
              }
              // Anthropic shape: content: [{ type: "text", text: "..." }]
              if (!outText && Array.isArray(parsedJson.content)) {
                outText = (parsedJson.content as Array<Record<string, unknown>>)
                  .map((c) => (typeof c.text === "string" ? c.text : ""))
                  .join("");
              }
            }
            tokensOut = estimateOutputTokens(outText);
            estimated = true;
          } catch (err) {
            logger.warn({ err }, "Token estimation fallback failed (non-stream)");
          }
        }

        // For Anthropic-format providers, translate response → OpenAI shape so the
        // client (which called WRouter at /chat/completions) sees a familiar payload.
        // We re-extract usage from the translated body so estimated/cache fields stay aligned.
        if (target.format === "anthropic" && parsedJson) {
          const translated = anthropicToOpenaiResponse(parsedJson);
          parsedJson = translated as Record<string, unknown>;
          responseJson = JSON.stringify(parsedJson);
          // Re-pull usage from translated body (it now lives at .usage.prompt_tokens/completion_tokens)
          const reExtracted = extractUsage(parsedJson);
          if (hasMeaningfulUsage(reExtracted)) {
            tokensIn = reExtracted!.prompt_tokens;
            tokensOut = reExtracted!.completion_tokens;
            estimated = false;
          }
        }

        // If we estimated OR translated (Anthropic), build a fresh Response with the
        // augmented body. Otherwise keep the original cloned response.
        let finalResponseForClient: Response = responseForClient;
        const needRebuild = (estimated && parsedJson) || (target.format === "anthropic" && parsedJson);
        if (needRebuild && parsedJson) {
          const baseUsage = (parsedJson.usage as Record<string, unknown>) ?? {};
          const augmented: Record<string, unknown> = {
            ...parsedJson,
            usage: {
              ...baseUsage,
              prompt_tokens: tokensIn ?? Number(baseUsage.prompt_tokens) ?? 0,
              completion_tokens: tokensOut ?? Number(baseUsage.completion_tokens) ?? 0,
              total_tokens: (tokensIn ?? 0) + (tokensOut ?? 0),
              ...(estimated ? { estimated: true } : {}),
            },
          };
          // Strip content-length and content-encoding — body changed
          const cleanHeaders = new Headers(response.headers);
          cleanHeaders.delete("content-length");
          cleanHeaders.delete("content-encoding");
          cleanHeaders.set("content-type", "application/json");
          finalResponseForClient = new Response(JSON.stringify(augmented), {
            status: response.status,
            headers: cleanHeaders,
          });
        }

        logRequest({
          model: target.model,
          providerId: target.providerId,
          apiKeyId: apiKeyId || null,
          latencyMs,
          status: "success",
          isStreaming: false,
          tokensIn,
          tokensOut,
          requestDetail,
          responseDetail: responseJson,
        });

        logger.info({
          model: target.model,
          provider: target.providerName,
          providerId: target.providerId,
          latencyMs,
          tokensIn,
          tokensOut,
          stream: false,
          usageSource: estimated ? "estimated" : "upstream",
        }, "Proxy request succeeded");

        return { response: finalResponseForClient, providerId: target.providerId, latencyMs };
      }

      // Provider returned an error, try next in chain
      const errorText = await response.text();
      lastError = new Error(`Provider ${target.providerName} returned ${response.status}: ${errorText}`);

      // Track error for multi-key failover
      if (target.connectionId) {
        recordError(target.connectionId, response.status);
      }

      logRequest({
        model: target.model,
        providerId: target.providerId,
        apiKeyId: apiKeyId || null,
        latencyMs,
        status: "fallback",
        isStreaming: false,
        error: lastError.message,
        requestDetail,
        responseDetail: JSON.stringify({ status: response.status, error: errorText.slice(0, 2000) }),
      });

      logger.warn({
        model: target.model,
        provider: target.providerName,
        providerId: target.providerId,
        status: response.status,
        latencyMs,
        error: lastError.message,
      }, "Proxy fallback to next provider");
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      lastError = err instanceof Error ? err : new Error(String(err));

      // Track error for multi-key failover (network error = 500 equivalent)
      if (target.connectionId) {
        recordError(target.connectionId, 500);
      }

      logRequest({
        model: target.model,
        providerId: target.providerId,
        apiKeyId: apiKeyId || null,
        latencyMs,
        status: "error",
        isStreaming: false,
        error: lastError.message,
        requestDetail,
        responseDetail: JSON.stringify({ error: lastError.message }),
      });

      logger.error({
        err: lastError,
        model: target.model,
        provider: target.providerName,
        providerId: target.providerId,
        latencyMs,
      }, "Proxy request error");
    }
  }

  throw lastError || new Error("No providers available");
  } finally {
    decrementActiveJobs();
  }
}

/**
 * Forward request to a single provider.
 *
 * For OpenAI-format providers (default): POST {baseUrl}/chat/completions with the
 * caller's body (after model resolution + OpenRouter prefs injection).
 *
 * For Anthropic-format providers (target.format === "anthropic"): translate the
 * OpenAI-shaped request to /v1/messages, swap headers (x-api-key + anthropic-version),
 * and let the response come back in Anthropic shape — proxyWithFallback will
 * detect that and call anthropicToOpenaiResponse before returning to the client.
 */
async function forwardRequest(
  requestBody: ChatCompletionRequest,
  target: RoutingResult
): Promise<Response> {
  const isAnthropic = target.format === "anthropic";
  const url = isAnthropic
    ? `${target.baseUrl.replace(/\/$/, "")}/messages`
    : `${target.baseUrl.replace(/\/$/, "")}/chat/completions`;

  let forwardBody: unknown;
  let headers: Record<string, string>;

  if (isAnthropic) {
    const anthropicReq = openaiToAnthropicRequest({
      ...requestBody,
      model: target.model,
    });
    forwardBody = anthropicReq;
    headers = {
      "Content-Type": "application/json",
      "x-api-key": target.apiKey,
      "anthropic-version": "2023-06-01",
    };
  } else {
    // Build the forwarded body with the resolved model + OpenRouter provider injection
    const injected = injectOpenRouterProvider(requestBody, target);
    forwardBody = {
      ...injected,
      model: target.model,
    };
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${target.apiKey}`,
    };
  }

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60 seconds

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(forwardBody),
      signal: controller.signal,
    });

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Forward a streaming request and return a ReadableStream.
 */
export async function proxyStreamWithFallback(
  requestBody: ChatCompletionRequest,
  fallbackChain: RoutingResult[],
  apiKeyId?: string,
  requestDetail?: string
): Promise<{ stream: ReadableStream; providerId: string }> {
  let lastError: Error | null = null;
  incrementActiveJobs();
  let handedOff = false;

  try {
  for (const target of fallbackChain) {
    const startTime = Date.now();
    try {
      // Notify UI that a request is starting on this provider
      notifyRequestStart(target.providerId, target.providerName, target.model);

      const isAnthropic = target.format === "anthropic";
      const url = isAnthropic
        ? `${target.baseUrl.replace(/\/$/, "")}/messages`
        : `${target.baseUrl.replace(/\/$/, "")}/chat/completions`;

      let forwardBody: unknown;
      let headers: Record<string, string>;

      if (isAnthropic) {
        const anthropicReq = openaiToAnthropicRequest({
          ...requestBody,
          model: target.model,
        });
        forwardBody = { ...anthropicReq, stream: true };
        headers = {
          "Content-Type": "application/json",
          "x-api-key": target.apiKey,
          "anthropic-version": "2023-06-01",
        };
      } else {
        // Inject OpenRouter provider preferences + resolved model
        const injected = injectOpenRouterProvider(requestBody, target);
        forwardBody = {
          ...injected,
          model: target.model,
          stream: true,
          // Request usage stats in the final SSE chunk (OpenAI-compatible providers)
          stream_options: { include_usage: true },
        };
        headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${target.apiKey}`,
        };
      }

      // Add timeout for initial connection (5 minutes for streaming)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(forwardBody),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(`Provider ${target.providerName} returned ${response.status}: ${errorText}`);
        const latencyMs = Date.now() - startTime;

        // Track error for multi-key failover
        if (target.connectionId) {
          recordError(target.connectionId, response.status);
        }

        logRequest({
          model: target.model,
          providerId: target.providerId,
          apiKeyId: apiKeyId || null,
          latencyMs,
          status: "fallback",
          isStreaming: true,
          error: lastError.message,
          requestDetail,
          responseDetail: JSON.stringify({ stream: true, status: response.status, error: errorText.slice(0, 2000) }),
        });
        logger.warn({
          model: target.model,
          provider: target.providerName,
          providerId: target.providerId,
          status: response.status,
          latencyMs,
          stream: true,
          error: lastError.message,
        }, "Stream proxy fallback to next provider");
        continue;
      }

      if (!response.body) {
        throw new Error("No response body for streaming");
      }

      const _timeToFirstByte = Date.now() - startTime;

      // Tap the stream to extract token usage from the final SSE chunk.
      // Many providers (OpenRouter, DeepSeek, etc.) send usage in the final
      // SSE chunk — which can be either:
      //   • data: {"id":"...","usage":{"prompt_tokens":155,"completion_tokens":2611}}
      //   • data: [DONE] followed by data: {"usage":{...}}
      // The parser now handles all variants:
      //   1. Usage embedded in the [DONE] chunk
      //   2. Usage as a separate chunk after [DONE]
      //   3. Usage anywhere in the stream
      // It also accumulates a partial buffer so JSON split across multiple
      // TCP chunks is reassembled before parsing.
      //
      // FALLBACK: Some providers (e.g., Genflow) ignore stream_options.include_usage
      // and never send a usage chunk. We accumulate delta.content from every chunk
      // and tokenize it ourselves with gpt-tokenizer when usage is missing.
      // For Anthropic providers: translate the upstream Anthropic-SSE stream into
      // OpenAI-SSE chunks first, then run all the same usage-extraction logic on
      // the OpenAI shape. The translator already emits a usage chunk at the end
      // (mirroring `stream_options.include_usage`), so downstream code can stay format-agnostic.
      const originalStream = isAnthropic
        ? translateAnthropicStream(response.body)
        : response.body;
      let tokensIn: number | undefined = undefined;
      let tokensOut: number | undefined = undefined;
      let usageFromUpstream = false;
      let accumulatedContent = "";
      let sseBuffer = "";

      function tryExtractUsage(json: unknown) {
        const u = extractUsage(json);
        if (hasMeaningfulUsage(u)) {
          tokensIn = u!.prompt_tokens;
          tokensOut = u!.completion_tokens;
          usageFromUpstream = true;
        }
      }

      function accumulateDeltaContent(json: unknown) {
        if (!json || typeof json !== "object") return;
        const obj = json as Record<string, unknown>;

        // OpenAI / DeepSeek / Genflow streaming: choices[0].delta.content
        const choices = obj.choices as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(choices) && choices.length > 0) {
          const delta = choices[0]?.delta as Record<string, unknown> | undefined;
          if (delta && typeof delta.content === "string") {
            accumulatedContent += delta.content;
            return;
          }
        }

        // Anthropic content_block_delta: { type, delta: { type: "text_delta", text } }
        if (obj.type === "content_block_delta") {
          const delta = obj.delta as Record<string, unknown> | undefined;
          if (delta && typeof delta.text === "string") {
            accumulatedContent += delta.text;
          }
          return;
        }

        // Gemini-shaped streaming: candidates[0].content.parts[].text
        const candidates = obj.candidates as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(candidates) && candidates.length > 0) {
          const content = candidates[0]?.content as Record<string, unknown> | undefined;
          const parts = content?.parts as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (typeof part.text === "string") accumulatedContent += part.text;
            }
          }
        }
      }

      // Shared reference so cancel() can signal the reader to stop.
      // When client disconnects, cancel() calls reader.cancel() which causes
      // reader.read() to throw, triggering the finally block that decrements activeJobs.
      let _reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

      const tappedStream = new ReadableStream({
        async start(streamController) {
          _reader = originalStream.getReader();
          try {
            while (true) {
              const { done, value } = await _reader.read();
              if (done) {
                // Flush any remaining buffer content
                if (sseBuffer.startsWith("data: ") && sseBuffer.trim() !== "data: [DONE]") {
                  try {
                    const json = JSON.parse(sseBuffer.slice(6));
                    tryExtractUsage(json);
                    accumulateDeltaContent(json);
                  } catch { /* ignore */ }
                }
                break;
              }
              const chunk = new TextDecoder().decode(value);
              sseBuffer += chunk;

              // Split on newline boundaries and process complete lines
              const parts = sseBuffer.split("\n");
              // Keep the last (potentially incomplete) part in the buffer
              sseBuffer = parts.pop() ?? "";

              for (const line of parts) {
                if (!line.startsWith("data: ")) continue;

                const payload = line.slice(6).trim();
                if (!payload || payload === "[DONE]") continue;

                try {
                  const json = JSON.parse(payload);
                  tryExtractUsage(json);
                  accumulateDeltaContent(json);
                } catch { /* partial / malformed JSON — ignore */ }
              }

              streamController.enqueue(value);
            }
          } finally {
            _reader.releaseLock();
            _reader = null;

            // FALLBACK: If upstream did not return usage, estimate it locally
            // using gpt-tokenizer on the request messages and accumulated content.
            let usageSource: "upstream" | "estimated" = "upstream";
            if (!usageFromUpstream) {
              try {
                const msgs = (requestBody.messages as MessageLike[]) ?? [];
                tokensIn = estimateInputTokens(msgs);
                tokensOut = estimateOutputTokens(accumulatedContent);
                usageSource = "estimated";

                // Inject a synthetic SSE chunk with estimated usage so the client
                // can read it from the stream (mirrors upstream `include_usage`).
                // Sent as a final OpenAI-format chunk: empty choices + usage block.
                const syntheticChunk =
                  "data: " +
                  JSON.stringify({
                    id: `wrouter-estimated-${Date.now()}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: target.model,
                    choices: [],
                    usage: {
                      prompt_tokens: tokensIn ?? 0,
                      completion_tokens: tokensOut ?? 0,
                      total_tokens: (tokensIn ?? 0) + (tokensOut ?? 0),
                      estimated: true,
                    },
                  }) +
                  "\n\n";
                try {
                  streamController.enqueue(new TextEncoder().encode(syntheticChunk));
                } catch { /* stream may already be closed */ }
              } catch (err) {
                logger.warn({ err }, "Token estimation fallback failed");
              }
            }

            try {
              streamController.close();
            } catch { /* stream may already be closed/cancelled */ }

            // Log after stream completes — use total duration, not time-to-first-byte
            const totalDuration = Date.now() - startTime;
            logRequest({
              model: target.model,
              providerId: target.providerId,
              apiKeyId: apiKeyId || null,
              latencyMs: totalDuration,
              status: "success",
              isStreaming: true,
              tokensIn,
              tokensOut,
              requestDetail,
              responseDetail: JSON.stringify({
                stream: true,
                tokensIn,
                tokensOut,
                latencyMs: totalDuration,
                usageSource,
                contentPreview: accumulatedContent.slice(0, 500),
                hasContent: accumulatedContent.length > 0,
                totalContentChars: accumulatedContent.length,
              }),
            });
            logger.info({
              model: target.model,
              provider: target.providerName,
              providerId: target.providerId,
              latencyMs: totalDuration,
              tokensIn,
              tokensOut,
              stream: true,
              usageSource,
            }, "Stream request completed");
            // Decrement active jobs only after the stream is fully consumed
            decrementActiveJobs();
          }
        },
        async cancel(_reason) {
          // Client disconnected — cancel the upstream reader so reader.read() throws
          // and the finally block runs to decrement activeJobs.
          logger.debug({ provider: target.providerName, reason: String(_reason) }, "Stream cancelled by client");
          _reader?.cancel();
        },
      });

      handedOff = true;
      return { stream: tappedStream, providerId: target.providerId };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      lastError = err instanceof Error ? err : new Error(String(err));
      logRequest({
        model: target.model,
        providerId: target.providerId,
        apiKeyId: apiKeyId || null,
        latencyMs,
        status: "error",
        isStreaming: true,
        error: lastError.message,
        requestDetail,
        responseDetail: JSON.stringify({ stream: true, error: lastError.message }),
      });
      logger.error({
        err: lastError,
        model: target.model,
        provider: target.providerName,
        providerId: target.providerId,
        latencyMs,
        stream: true,
      }, "Stream proxy error");
    }
  }

  throw lastError || new Error("No providers available for streaming");
  } finally {
    // Only decrement here if the stream was NOT handed off (i.e., all providers failed).
    // When handed off, decrementActiveJobs runs inside the tappedStream's finally block.
    if (!handedOff) {
      decrementActiveJobs();
    }
  }
}
