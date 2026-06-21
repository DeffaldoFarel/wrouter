import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, providerConnections } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";
import { safeDecryptApiKey } from "@/lib/crypto";
import { validateUrl } from "@/lib/ssrf-guard";
import { dashboardLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

function checkAuth(req: NextRequest): boolean {
  return checkDashboardAuth(req) !== null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F3: Rate limit outbound health check (60/min/IP)
  const ip = getClientIp(req);
  const limitCheck = dashboardLimiter.consume(ip);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  const { id } = await params;

  try {
    const provider = db.select().from(providers).where(eq(providers.id, id)).get();

    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    const start = Date.now();

    // SSRF guard: validate provider URL before fetching
    const ssrfCheck = await validateUrl(`${provider.baseUrl}/models`);
    if (!ssrfCheck.valid) {
      return NextResponse.json({
        online: false,
        latencyMs: Date.now() - start,
        error: `SSRF protection: ${ssrfCheck.error}`,
      });
    }

    try {
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
          if (data.apiKey) resolvedApiKey = safeDecryptApiKey(data.apiKey);
        } catch (e) {
          console.warn("[health] Failed to parse connection data:", e);
        }
      }
      if (!resolvedApiKey && provider.apiKey) resolvedApiKey = safeDecryptApiKey(provider.apiKey);

      if (!resolvedApiKey) {
        return NextResponse.json({
          online: false,
          error: "No API key configured",
          latencyMs: 0,
        });
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${provider.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${resolvedApiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const latencyMs = Date.now() - start;

      if (res.ok) {
        return NextResponse.json({ online: true, latencyMs });
      } else {
        return NextResponse.json({
          online: false,
          latencyMs,
          error: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      const message =
        err instanceof Error
          ? err.name === "AbortError"
            ? "Request timed out"
            : err.message
          : "Connection failed";

      return NextResponse.json({ online: false, latencyMs, error: message });
    }
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
