import { RoutingResult, getFallbackChain, logRequest, incrementActiveJobs, decrementActiveJobs, notifyRequestStart } from "./engine";
import logger from "@/lib/logger";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface ChatCompletionRequest {
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
        
        // Parse original response to extract token usage
        let tokensIn: number | undefined = undefined;
        let tokensOut: number | undefined = undefined;
        let responseJson: string | null = null;
        try {
          const json = await response.json();
          responseJson = JSON.stringify(json);
          tokensIn  = json.usage?.prompt_tokens     ?? undefined;
          tokensOut = json.usage?.completion_tokens ?? undefined;
        } catch { /* ignore parse errors */ }

        logRequest({
          model: target.model,
          providerId: target.providerId,
          apiKeyId: apiKeyId || null,
          latencyMs,
          status: "success",
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
        }, "Proxy request succeeded");

        // Return cloned response (body not consumed)
        return { response: responseForClient, providerId: target.providerId, latencyMs };
      }

      // Provider returned an error, try next in chain
      const errorText = await response.text();
      lastError = new Error(`Provider ${target.providerName} returned ${response.status}: ${errorText}`);

      logRequest({
        model: target.model,
        providerId: target.providerId,
        apiKeyId: apiKeyId || null,
        latencyMs,
        status: "fallback",
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

      logRequest({
        model: target.model,
        providerId: target.providerId,
        apiKeyId: apiKeyId || null,
        latencyMs,
        status: "error",
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
 */
async function forwardRequest(
  requestBody: ChatCompletionRequest,
  target: RoutingResult
): Promise<Response> {
  const url = `${target.baseUrl.replace(/\/$/, "")}/chat/completions`;

  // Build the forwarded body with the resolved model + OpenRouter provider injection
  const injected = injectOpenRouterProvider(requestBody, target);
  const forwardBody = {
    ...injected,
    model: target.model,
  };

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60 seconds

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${target.apiKey}`,
      },
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

      const url = `${target.baseUrl.replace(/\/$/, "")}/chat/completions`;

      // Inject OpenRouter provider preferences + resolved model
      const injected = injectOpenRouterProvider(requestBody, target);
      const forwardBody = {
        ...injected,
        model: target.model,
        stream: true,
        // Request usage stats in the final SSE chunk (OpenAI-compatible providers)
        stream_options: { include_usage: true },
      };

      // Add timeout for initial connection (5 minutes for streaming)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 300000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${target.apiKey}`,
          },
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
        logRequest({
          model: target.model,
          providerId: target.providerId,
          apiKeyId: apiKeyId || null,
          latencyMs,
          status: "fallback",
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

      const timeToFirstByte = Date.now() - startTime;

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
      const originalStream = response.body;
      let tokensIn: number | undefined = undefined;
      let tokensOut: number | undefined = undefined;
      let sseBuffer = "";

      function extractUsageFromJson(json: unknown) {
        if (json && typeof json === "object" && "usage" in json) {
          const u = (json as Record<string, unknown>).usage;
          if (u && typeof u === "object") {
            const obj = u as Record<string, unknown>;
            tokensIn  = (obj.prompt_tokens as number)     ?? tokensIn;
            tokensOut = (obj.completion_tokens as number) ?? tokensOut;
          }
        }
      }

      const tappedStream = new ReadableStream({
        async start(streamController) {
          const reader = originalStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Flush any remaining buffer content
                if (sseBuffer.startsWith("data: ") && sseBuffer.trim() !== "data: [DONE]") {
                  try {
                    extractUsageFromJson(JSON.parse(sseBuffer.slice(6)));
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
                  extractUsageFromJson(json);
                } catch { /* partial / malformed JSON — ignore */ }
              }

              streamController.enqueue(value);
            }
          } finally {
            reader.releaseLock();
            streamController.close();
            // Log after stream completes — use total duration, not time-to-first-byte
            const totalDuration = Date.now() - startTime;
            logRequest({
              model: target.model,
              providerId: target.providerId,
              apiKeyId: apiKeyId || null,
              latencyMs: totalDuration,
              status: "success",
              tokensIn,
              tokensOut,
              requestDetail,
              responseDetail: JSON.stringify({ stream: true, tokensIn, tokensOut, latencyMs: totalDuration }),
            });
            logger.info({
              model: target.model,
              provider: target.providerName,
              providerId: target.providerId,
              latencyMs: totalDuration,
              tokensIn,
              tokensOut,
              stream: true,
            }, "Stream request completed");
            // Decrement active jobs only after the stream is fully consumed
            decrementActiveJobs();
          }
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
