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

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F1: Rate limit outbound fetch (60/min/IP)
  const ip = getClientIp(req);
  const limitCheck = dashboardLimiter.consume(ip);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  try {
    const { baseUrl, apiKey, providerId } = await req.json();

    // If providerId is given, use the stored API key, baseUrl, and detect type
    let resolvedApiKey = apiKey;
    let resolvedBaseUrl = baseUrl;
    let providerType = "custom";
    
    if (providerId) {
      const provider = db.select().from(providers).where(eq(providers.id, providerId)).get();
      if (provider) {
        // Try provider_connections first (multi-key), fallback to legacy provider.apiKey
        if (!resolvedApiKey) {
          const conn = db.select().from(providerConnections)
            .where(and(
              eq(providerConnections.providerId, providerId),
              eq(providerConnections.authType, "apikey"),
              eq(providerConnections.isActive, true)
            ))
            .get();
          if (conn?.data) {
            try {
              const data = JSON.parse(conn.data);
              if (data.apiKey) resolvedApiKey = data.apiKey;
            } catch (e) {
              console.warn("[fetch-models] Failed to parse connection data:", e);
            }
          }
        }
        if (!resolvedApiKey && provider.apiKey) resolvedApiKey = provider.apiKey;
        if (!resolvedBaseUrl) resolvedBaseUrl = provider.baseUrl;
        providerType = provider.type ?? "custom";
      }
    }

    if (!resolvedBaseUrl) {
      return NextResponse.json(
        { error: "baseUrl is required (or provide providerId to use stored baseUrl)" },
        { status: 400 }
      );
    }

    if (!resolvedApiKey) {
      return NextResponse.json(
        { error: "apiKey is required (or provide providerId to use stored apiKey)" },
        { status: 400 }
      );
    }

    const url = `${resolvedBaseUrl.replace(/\/$/, "")}/models`;

    // SSRF guard: validate the target URL before fetching
    const ssrfCheck = await validateUrl(url);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { error: `SSRF protection: ${ssrfCheck.error}` },
        { status: 400 }
      );
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        ...(providerType === "apikey" ? { "HTTP-Referer": "https://wrouter.app", "X-Title": "WRouter" } : {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Provider returned ${response.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    // OpenAI-compatible format: { data: [{ id: "model-name", name?, context_length?, pricing? }, ...] }
    // OpenRouter returns richer objects — extract id, name, context_length
    let models: string[] = [];

    if (data.data && Array.isArray(data.data)) {
      models = data.data
        .map((m: { id?: string; name?: string }) => m.id)
        .filter((id: string | undefined): id is string => !!id)
        .sort();
    } else if (Array.isArray(data)) {
      models = data
        .map((m: { id?: string; name?: string }) => m.id || m.name)
        .filter((id: string | undefined): id is string => !!id)
        .sort();
    }

    return NextResponse.json({ models, count: models.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
