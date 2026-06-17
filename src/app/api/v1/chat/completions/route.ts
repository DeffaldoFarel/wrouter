import { NextRequest, NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/auth/session";
import { resolveModel, getFallbackChain, logRequest } from "@/lib/router/engine";
import { proxyWithFallback, proxyStreamWithFallback } from "@/lib/router/proxy";
import { compressToolResults } from "@/lib/token-saver/rtk";
import { injectCavemanPrompt } from "@/lib/token-saver/caveman";
import { db } from "@/lib/db";
import { settings, combos, providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: { message: "Missing API key", type: "auth_error" } },
      { status: 401 }
    );
  }

  const apiKey = authHeader.slice(7);
  const apiKeyRecord = verifyApiKey(apiKey);
  if (!apiKeyRecord) {
    return NextResponse.json(
      { error: { message: "Invalid API key", type: "auth_error" } },
      { status: 401 }
    );
  }
  const apiKeyId = apiKeyRecord.id;

  try {
    const body = await req.json();
    const { model, stream } = body;

    if (!model) {
      return NextResponse.json(
        { error: { message: "model is required", type: "invalid_request_error" } },
        { status: 400 }
      );
    }

    // Check if model is allowed for this API key
    if (apiKeyRecord.allowedModels.length > 0) {
      const allowed = apiKeyRecord.allowedModels;
      let isAllowed = allowed.includes(model);

      // If not a direct match, check if it's a combo whose underlying models are allowed.
      // DESIGN: Combo is allowed if ANY underlying model is in allowedModels.
      // This means fallback can still work even if some combo models are not explicitly allowed.
      // Example: combo has [modelA, modelB, modelC], only modelA is allowed → combo is permitted
      //          and fallback to modelB/C will still work.
      // If stricter behavior is needed (ALL models must be allowed), change this logic.
      if (!isAllowed) {
        const combo = db.select().from(combos).where(eq(combos.slug, model)).get();
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
        return NextResponse.json(
          { error: { message: `Model not allowed: ${model}`, type: "invalid_request_error" } },
          { status: 403 }
        );
      }
    }

    // Get settings for RTK and Caveman
    const rtkEnabled = db.select().from(settings).where(eq(settings.key, "rtk_enabled")).get();
    const cavemanEnabled = db.select().from(settings).where(eq(settings.key, "caveman_enabled")).get();

    // Apply token savers if enabled
    let processedBody = { ...body };

    if (rtkEnabled?.value === "true" && processedBody.messages) {
      processedBody.messages = compressToolResults(processedBody.messages);
    }

    if (cavemanEnabled?.value === "true" && processedBody.messages) {
      processedBody.messages = injectCavemanPrompt(processedBody.messages);
    }

    // Get fallback chain for the requested model
    const fallbackChain = getFallbackChain(model);

    if (fallbackChain.length === 0) {
      // Try direct model resolution
      const direct = resolveModel(model);
      if (direct) {
        fallbackChain.push(direct);
      }
    }

    if (fallbackChain.length === 0) {
      return NextResponse.json(
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
        apiKeyId
      );

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Non-streaming response
    const { response } = await proxyWithFallback(processedBody, fallbackChain, apiKeyId);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: { message, type: "server_error" } },
      { status: 500 }
    );
  }
}
