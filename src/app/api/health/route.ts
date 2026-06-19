import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { checkDashboardAuth } from "@/lib/auth/session";
import { safeDecryptApiKey } from "@/lib/crypto";
import { validateUrl } from "@/lib/ssrf-guard";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ status: "ok" });
  }

  const allProviders = db.select().from(providers).all();

  const results = await Promise.all(
    allProviders.map(async (p) => {
      if (!p.enabled) {
        return {
          id: p.id,
          name: p.name,
          prefix: p.prefix,
          type: p.type,
          enabled: false,
          status: "disabled" as const,
          latencyMs: null,
          error: null,
        };
      }

      const startTime = Date.now();

      // SSRF guard: validate provider URL before fetching
      const ssrfCheck = await validateUrl(`${p.baseUrl}/models`);
      if (!ssrfCheck.valid) {
        return {
          id: p.id,
          name: p.name,
          prefix: p.prefix,
          type: p.type,
          enabled: true,
          status: "ssrf-blocked" as const,
          latencyMs: null,
          error: `SSRF protection: ${ssrfCheck.error}`,
        };
      }

      try {
        const res = await fetch(`${p.baseUrl}/models`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${safeDecryptApiKey(p.apiKey)}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(8000),
        });
        const latencyMs = Date.now() - startTime;

        return {
          id: p.id,
          name: p.name,
          prefix: p.prefix,
          type: p.type,
          enabled: true,
          status: res.ok ? ("ok" as const) : ("error" as const),
          latencyMs,
          error: res.ok ? null : `HTTP ${res.status}`,
        };
      } catch (err) {
        return {
          id: p.id,
          name: p.name,
          prefix: p.prefix,
          type: p.type,
          enabled: true,
          status: "error" as const,
          latencyMs: Date.now() - startTime,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    })
  );

  return NextResponse.json(results);
}
