/**
 * OpenAI Responses API endpoint.
 *
 * POST /api/v1/responses
 *
 * Accepts OpenAI Responses API format and translates it to Chat Completions
 * format for WRouter's internal routing, then translates the response back
 * to Responses format.
 *
 * Supports both streaming and non-streaming requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/session";
import { resolveModel, getFallbackChain } from "@/lib/router/engine";
import { proxyWithFallback, proxyStreamWithFallback } from "@/lib/router/proxy";
import { compressToolResults } from "@/lib/token-saver/rtk";
import { injectCavemanPrompt } from "@/lib/token-saver/caveman";
import { responsesToChat, chatToResponses, translateChatStreamToResponses } from "@/lib/router/translator/responses";
import { db } from "@/lib/db";
import type { Message } from "@/lib/validation";
import { settings, combos, providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { chatLimiter, rateLimitResponse } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import { maybeCleanupLogs } from "@/lib/log-retention";
import { captureException } from "@/lib/sentry";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return NextResponse.json(body, { ...init, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logger.warn({ key: authHeader?.slice(0, 12) }, "Unauthorized request (Responses API)");
    return corsResponse(
      { error: { message: "Missing API key", type: "auth_error" } },
      { status: 401 },
    );
  }

  const apiKey = authHeader.slice(7);
  const apiKeyRecord = verifyApiKey(apiKey);
  if (!apiKeyRecord) {
    logger.warn({ key: authHeader?.slice(0, 12) }, "Unauthorized request (Responses API)");
    return corsResponse(
      { error: { message: "Invalid API key", type: "auth_error" } },
      { status: 401 },
    );
  }
  const apiKeyId = apiKeyRecord.id;

  // Rate limit
  const limitCheck = chatLimiter.consume(apiKey);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  let model: string | undefined;

  try {
    const body = await req.json();

    // Validate: Responses API requires `model` and `input`
    if (!body.model || body.input === undefined) {
      return corsResponse(
        { error: { message: "Missing required fields: model, input", type: "invalid_request_error" } },
        { status: 400 },
      );
    }

    model = body.model;
    const stream = body.stream === true;

    const requestStartTime = Date.now();

    logger.info(
      {
        model,
        apiKeyId,
        stream,
        inputType: typeof body.input,
      },
      "Responses API request",
    );

    // Check if model is allowed for this API key
    if (apiKeyRecord.allowedModels.length > 0) {
      const allowed = apiKeyRecord.allowedModels;
      let isAllowed = allowed.includes(model!);

      if (!isAllowed) {
        const combo = db.select().from(combos).where(eq(combos.slug, model!)).get();
        if (combo && combo.enabled) {
          let comboModels: Array<{ model: string; providerId: string }>;
          try {
            comboModels = JSON.parse(combo.models);
          } catch {
            comboModels = [];
          }
          const allProviders = db.select().from(providers).all();
          for (const entry of comboModels) {
            const prov = allProviders.find((p) => p.id === entry.providerId);
            if (prov && allowed.includes(`${prov.prefix}/${entry.model}`)) {
              isAllowed = true;
              break;
            }
          }
        }
      }

      if (!isAllowed) {
        return corsResponse(
          { error: { message: `Model not allowed: ${model}`, type: "invalid_request_error" } },
          { status: 403 },
        );
      }
    }

    // Translate Responses format → Chat Completions format
    const chatBody = responsesToChat(body);

    // Get settings for RTK and Caveman
    const rtkEnabled = db.select().from(settings).where(eq(settings.key, "rtk_enabled")).get();
    const cavemanEnabled = db.select().from(settings).where(eq(settings.key, "caveman_enabled")).get();

    // Apply token savers if enabled
    const processedBody = { ...chatBody };

    if (rtkEnabled?.value === "true" && processedBody.messages) {
      processedBody.messages = compressToolResults(processedBody.messages as Message[]);
    }

    if (cavemanEnabled?.value === "true" && processedBody.messages) {
      processedBody.messages = injectCavemanPrompt(processedBody.messages as Message[]);
    }

    // Build request detail for DB storage
    const requestDetail = JSON.stringify({
      format: "responses",
      model_requested: model,
      rtk_applied: rtkEnabled?.value === "true",
      caveman_applied: cavemanEnabled?.value === "true",
      stream,
      body: processedBody,
    });

    // Get fallback chain
    const fallbackChain = getFallbackChain(model!);
    if (fallbackChain.length === 0) {
      const direct = resolveModel(model!);
      if (direct) {
        fallbackChain.push(direct);
      }
    }

    if (fallbackChain.length === 0) {
      return corsResponse(
        {
          error: {
            message: `Model not found: ${model}. Make sure the model is registered in WRouter.`,
            type: "invalid_request_error",
          },
        },
        { status: 404 },
      );
    }

    // Streaming response
    if (stream) {
      const { stream: responseStream } = await proxyStreamWithFallback(
        processedBody,
        fallbackChain,
        apiKeyId,
        requestDetail,
      );

      // Translate Chat SSE → Responses SSE
      const responsesStream = translateChatStreamToResponses(responseStream);

      return new Response(responsesStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...CORS_HEADERS,
        },
      });
    }

    // Non-streaming response
    const { response } = await proxyWithFallback(
      processedBody,
      fallbackChain,
      apiKeyId,
      requestDetail,
    );
    const chatData = await response.json();

    // Translate Chat Completions → Responses format
    const responsesData = chatToResponses(chatData);

    // Fire-and-forget log retention cleanup
    maybeCleanupLogs();

    return corsResponse(responsesData);
  } catch (err) {
    logger.error({ err, model }, "Responses API request failed");
    captureException(err, {
      tags: { route: "responses" },
    });
    const message = err instanceof Error ? err.message : "Internal server error";
    return corsResponse(
      { error: { message, type: "server_error" } },
      { status: 500 },
    );
  }
}
