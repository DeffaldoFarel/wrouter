import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, providerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateUrl } from "@/lib/ssrf-guard";
import { dashboardLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

function checkAuth(req: NextRequest): boolean {
  return checkDashboardAuth(req) !== null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F2: Rate limit outbound test-model fetch (60/min/IP)
  const ip = getClientIp(req);
  const limitCheck = dashboardLimiter.consume(ip);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  const { id } = await params;

  try {
    const body = await req.json();
    const { model } = body;

    if (!model || typeof model !== "string") {
      return NextResponse.json({ error: "Model name required" }, { status: 400 });
    }

    const provider = db.select().from(providers).where(eq(providers.id, id)).get();

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // Verify model exists in provider
    if (!provider.models.includes(model)) {
      return NextResponse.json({ error: "Model not found in provider" }, { status: 404 });
    }

    const start = Date.now();

    // SSRF guard
    const completionsUrl = `${provider.baseUrl}/chat/completions`;
    const ssrfCheck = await validateUrl(completionsUrl);
    if (!ssrfCheck.valid) {
      return NextResponse.json({
        success: false,
        latencyMs: Date.now() - start,
        error: `SSRF protection: ${ssrfCheck.error}`,
      });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout for completions

      // Resolve API key: check provider_connections first, fallback to legacy provider.apiKey
      let resolvedApiKey: string | null = null;
      const conn = db.select().from(providerConnections)
        .where(and(
          eq(providerConnections.providerId, id),
          eq(providerConnections.authType, "apikey"),
          eq(providerConnections.isActive, true)
        ))
        .get();
      if (conn?.data) {
        try {
          const data = JSON.parse(conn.data);
          if (data.apiKey) resolvedApiKey = data.apiKey;
        } catch (e) {
          console.warn("[test-model] Failed to parse connection data:", e);
        }
      }
      if (!resolvedApiKey && provider.apiKey) resolvedApiKey = provider.apiKey;

      if (!resolvedApiKey) {
        return NextResponse.json({
          success: false,
          error: "No API key configured for this provider",
        });
      }

      const res = await fetch(completionsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        const data = await res.json();
        // Verify we got a valid response
        if (data.choices && data.choices.length > 0) {
          return NextResponse.json({
            success: true,
            latencyMs,
            model: data.model || model,
          });
        } else {
          return NextResponse.json({
            success: false,
            latencyMs,
            error: "Invalid response format",
          });
        }
      } else {
        const errorText = await res.text();
        let errorMessage = `HTTP ${res.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorJson.message || errorMessage;
        } catch {
          // Use default error message
        }
        return NextResponse.json({
          success: false,
          latencyMs,
          error: errorMessage,
        });
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timed out (15s)"
            : err.message
          : "Connection failed";

      return NextResponse.json({ success: false, latencyMs, error: message });
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
