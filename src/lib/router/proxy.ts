import { RoutingResult, getFallbackChain, logRequest, incrementActiveJobs, decrementActiveJobs } from "./engine";
import logger from "@/lib/logger";

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
  [key: string]: unknown;
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
  apiKeyId?: string
): Promise<ProxyResult> {
  let lastError: Error | null = null;
  incrementActiveJobs();

  try {
  for (const target of fallbackChain) {
    const startTime = Date.now();
    try {
      const response = await forwardRequest(requestBody, target);
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        // Clone response before consuming to avoid double memory allocation
        const responseForClient = response.clone();
        
        // Parse original response to extract token usage
        let tokensIn: number | undefined = undefined;
        let tokensOut: number | undefined = undefined;
        try {
          const json = await response.json();
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

  // Build the forwarded body with the resolved model
  const forwardBody = {
    ...requestBody,
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
  apiKeyId?: string
): Promise<{ stream: ReadableStream; providerId: string }> {
  let lastError: Error | null = null;
  incrementActiveJobs();

  try {
  for (const target of fallbackChain) {
    const startTime = Date.now();
    try {
      const url = `${target.baseUrl.replace(/\/$/, "")}/chat/completions`;

      const forwardBody = {
        ...requestBody,
        model: target.model,
        stream: true,
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

      // Tap the stream to extract token usage from the final SSE chunk
      const originalStream = response.body;
      let tokensIn: number | undefined = undefined;
      let tokensOut: number | undefined = undefined;

      const tappedStream = new ReadableStream({
        async start(controller) {
          const reader = originalStream.getReader();
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              // Try to extract usage from SSE chunks
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ") && line !== "data: [DONE]") {
                  try {
                    const json = JSON.parse(line.slice(6));
                    if (json.usage) {
                      tokensIn  = json.usage.prompt_tokens     ?? tokensIn;
                      tokensOut = json.usage.completion_tokens ?? tokensOut;
                    }
                  } catch { /* ignore */ }
                }
              }
              controller.enqueue(value);
            }
          } finally {
            reader.releaseLock();
            controller.close();
            // Log after stream completes - use total duration, not time-to-first-byte
            const totalDuration = Date.now() - startTime;
            logRequest({
              model: target.model,
              providerId: target.providerId,
              apiKeyId: apiKeyId || null,
              latencyMs: totalDuration,
              status: "success",
              tokensIn,
              tokensOut,
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
          }
        },
      });

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
    decrementActiveJobs();
  }
}
