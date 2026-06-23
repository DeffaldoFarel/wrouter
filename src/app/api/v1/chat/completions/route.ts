import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/session";
import { resolveModel, getFallbackChain } from "@/lib/router/engine";
import { proxyWithFallback, proxyStreamWithFallback } from "@/lib/router/proxy";
import { compressToolResults } from "@/lib/token-saver/rtk";
import { injectCavemanPrompt } from "@/lib/token-saver/caveman";
import { db } from "@/lib/db";
import { settings, combos, providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { chatLimiter, rateLimitResponse } from "@/lib/rate-limit";
import { validateChatRequest } from "@/lib/validation";
import type { Message } from "@/lib/validation";
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
    logger.warn({ key: authHeader?.slice(0, 12) }, "Unauthorized request");
    return corsResponse(
      { error: { message: "Missing API key", type: "auth_error" } },
      { status: 401 }
    );
  }

  const apiKey = authHeader.slice(7);
  const apiKeyRecord = verifyApiKey(apiKey);
  if (!apiKeyRecord) {
    logger.warn({ key: authHeader?.slice(0, 12) }, "Unauthorized request");
    return corsResponse(
      { error: { message: "Invalid API key", type: "auth_error" } },
      { status: 401 }
    );
  }
  const apiKeyId = apiKeyRecord.id;

  // Rate limit: 60 requests per minute per API key
  const limitCheck = chatLimiter.consume(apiKey);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  let model: string | undefined;

  try {
    const body = await req.json();

    // Validate request body
    const validation = validateChatRequest(body);
    if (!validation.valid) {
      return corsResponse(
        { error: { message: "Validation failed", type: "invalid_request_error", errors: validation.errors } },
        { status: 400 }
      );
    }

    model = body.model;
    const stream = body.stream;

    logger.info({
      stream: !!stream,
      messageCount: body.messages?.length,
    }, "Chat completion request");

    // Check if model is allowed for this API key
    if (apiKeyRecord.allowedModels.length > 0) {
      const allowed = apiKeyRecord.allowedModels;
      let isAllowed = allowed.includes(model!);

      // If not a direct match, check if it's a combo whose underlying models are allowed.
      // DESIGN: Combo is allowed if ANY underlying model is in allowedModels.
      // This means fallback can still work even if some combo models are not explicitly allowed.
      // Example: combo has [modelA, modelB, modelC], only modelA is allowed → combo is permitted
      //          and fallback to modelB/C will still work.
      // If stricter behavior is needed (ALL models must be allowed), change this logic.
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
          { status: 403 }
        );
      }
    }

    // Get settings for RTK and Caveman
    const rtkEnabled = db.select().from(settings).where(eq(settings.key, "rtk_enabled")).get();
    const cavemanEnabled = db.select().from(settings).where(eq(settings.key, "caveman_enabled")).get();

    // Apply token savers if enabled
    const processedBody = { ...body };

    if (rtkEnabled?.value === "true" && processedBody.messages) {
      processedBody.messages = compressToolResults(processedBody.messages as Message[]);
    }

    if (cavemanEnabled?.value === "true" && processedBody.messages) {
      processedBody.messages = injectCavemanPrompt(processedBody.messages as Message[]);
    }

    // ─── Debug logging ───
    const systemMsg = processedBody.messages?.find((m: Record<string, unknown>) => m.role === "system");
    logger.info({
      event: "proxy_debug",
      model_requested: model,
      message_count: processedBody.messages?.length ?? 0,
      has_system: !!systemMsg,
      system_preview: systemMsg
        ? typeof systemMsg.content === "string"
          ? systemMsg.content.slice(0, 300)
          : "[non-string content]"
        : null,
      rtk_applied: rtkEnabled?.value === "true",
      caveman_applied: cavemanEnabled?.value === "true",
      stream: !!stream,
      body_keys: Object.keys(processedBody),
    }, "[DEBUG] Chat completion request — check if system prompt is present");

    // ─── Build request detail for DB storage ───
    const requestDetail = JSON.stringify({
      model_requested: model,
      rtk_applied: rtkEnabled?.value === "true",
      caveman_applied: cavemanEnabled?.value === "true",
      stream: !!stream,
      body: processedBody,
    });

    // Get fallback chain for the requested model
    const fallbackChain = getFallbackChain(model!);

    if (fallbackChain.length === 0) {
      // Try direct model resolution (sync)
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
        { status: 404 }
      );
    }

    // Streaming response
    if (stream) {
      const { stream: responseStream } = await proxyStreamWithFallback(
        processedBody,
        fallbackChain,
        apiKeyId,
        requestDetail
      );

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          ...CORS_HEADERS,
        },
      });
    }

    // Non-streaming response
    const { response } = await proxyWithFallback(processedBody, fallbackChain, apiKeyId, requestDetail);
    const data = await response.json();

    // Fire-and-forget log retention cleanup
    maybeCleanupLogs();

    return corsResponse(data);
  } catch (err) {
    logger.error({ err, model }, "Chat completion failed");
    captureException(err, {
      tags: { route: "chat/completions" },
    });
    const message = err instanceof Error ? err.message : "Internal server error";
    return corsResponse(
      { error: { message, type: "server_error" } },
      { status: 500 }
    );
  }
}
