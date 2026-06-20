import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/auth/session";
import { safeDecryptApiKey } from "@/lib/crypto";
import { validateUrl } from "@/lib/ssrf-guard";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      if (!provider.apiKey) {
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
          Authorization: `Bearer ${safeDecryptApiKey(provider.apiKey)}`,
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
