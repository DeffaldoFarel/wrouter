import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, providers, apiKeys } from "@/lib/db/schema";
import { sql, gte, and, isNotNull } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";
import { getActiveJobs } from "@/lib/router/engine";
import { maybeCleanupLogs } from "@/lib/log-retention";

function checkAuth(req: NextRequest): boolean {
  return checkDashboardAuth(req) !== null;
}

function getStartDate(filter: string): Date {
  const now = new Date();
  switch (filter) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "24h":  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":   return new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    case "30d":  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "60d":  return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    default:     return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
}

const USE_HOURLY = new Set(["today", "24h"]);

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fire-and-forget log retention cleanup
  maybeCleanupLogs();

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "24h";
  const startDate = getStartDate(filter);
  const startISO = startDate.toISOString();
  const now = new Date();
  const hourly = USE_HOURLY.has(filter);

  // ─── Reference data (small dimension tables) ───
  const providerList = db.select().from(providers).all();
  const providerMap: Record<string, string> = {};
  for (const p of providerList) providerMap[p.id] = p.name;

  const apiKeyList = db.select().from(apiKeys).all();
  const apiKeyMap: Record<string, string> = {};
  for (const k of apiKeyList) apiKeyMap[k.id] = k.name;

  // ═══════════════════════════════════════════════════════
  //  All aggregation pushed to SQL (uses timestamp_idx).
  //  Previously this route loaded every row in the window into
  //  Node and ran multiple O(N) loops; at production scale that
  //  meant transferring thousands of rows per dashboard load.
  // ═══════════════════════════════════════════════════════

  // ─── Summary (single GROUP-less aggregate) ───
  const summaryRow = db
    .select({
      totalRequests:        sql<number>`COUNT(*)`,
      totalErrors:          sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
      totalTokensIn:        sql<number>`COALESCE(SUM(tokens_in), 0)`,
      totalTokensOut:       sql<number>`COALESCE(SUM(tokens_out), 0)`,
      // AVG ignores NULLs natively; original JS filtered out 0/null latencies, so wrap in NULLIF.
      avgLatencyRaw:        sql<number | null>`AVG(NULLIF(latency_ms, 0))`,
      streamingRequests:    sql<number>`COALESCE(SUM(CASE WHEN is_streaming = 1 THEN 1 ELSE 0 END), 0)`,
      nonStreamingRequests: sql<number>`COALESCE(SUM(CASE WHEN is_streaming = 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, startISO))
    .get();

  const totalRequests        = summaryRow?.totalRequests ?? 0;
  const totalErrors          = summaryRow?.totalErrors ?? 0;
  const totalTokensIn        = summaryRow?.totalTokensIn ?? 0;
  const totalTokensOut       = summaryRow?.totalTokensOut ?? 0;
  const avgLatency           = summaryRow?.avgLatencyRaw != null ? Math.round(summaryRow.avgLatencyRaw) : 0;
  const streamingRequests    = summaryRow?.streamingRequests ?? 0;
  const nonStreamingRequests = summaryRow?.nonStreamingRequests ?? 0;

  // ─── Time buckets via GROUP BY SUBSTR(timestamp, ...) ───
  // ISO timestamps slice cleanly: 13 chars = "YYYY-MM-DDTHH", 10 chars = "YYYY-MM-DD".
  const bucketRows = hourly
    ? db
        .select({
          bucket:    sql<string>`SUBSTR(timestamp, 1, 13)`,
          requests:  sql<number>`COUNT(*)`,
          errors:    sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
          tokensIn:  sql<number>`COALESCE(SUM(tokens_in), 0)`,
          tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
        })
        .from(requestLogs)
        .where(gte(requestLogs.timestamp, startISO))
        .groupBy(sql`SUBSTR(timestamp, 1, 13)`)
        .all()
    : db
        .select({
          bucket:    sql<string>`SUBSTR(timestamp, 1, 10)`,
          requests:  sql<number>`COUNT(*)`,
          errors:    sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
          tokensIn:  sql<number>`COALESCE(SUM(tokens_in), 0)`,
          tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
        })
        .from(requestLogs)
        .where(gte(requestLogs.timestamp, startISO))
        .groupBy(sql`SUBSTR(timestamp, 1, 10)`)
        .all();

  // Pre-fill empty buckets so the time series stays continuous (matches old behavior).
  const reqBuckets: Record<string, { hour?: string; date?: string; requests: number; errors: number }> = {};
  const tokBuckets: Record<string, { hour?: string; date?: string; tokensIn: number; tokensOut: number }> = {};

  if (hourly) {
    const cursor = new Date(startDate);
    cursor.setMinutes(0, 0, 0);
    const end = new Date(now);
    end.setMinutes(0, 0, 0);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 13);
      reqBuckets[key] = { hour: key, requests: 0, errors: 0 };
      tokBuckets[key] = { hour: key, tokensIn: 0, tokensOut: 0 };
      cursor.setHours(cursor.getHours() + 1);
    }
  } else {
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      reqBuckets[key] = { date: key, requests: 0, errors: 0 };
      tokBuckets[key] = { date: key, tokensIn: 0, tokensOut: 0 };
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const r of bucketRows) {
    const key = r.bucket;
    if (reqBuckets[key]) {
      reqBuckets[key].requests = r.requests;
      reqBuckets[key].errors = r.errors;
    } else {
      reqBuckets[key] = hourly
        ? { hour: key, requests: r.requests, errors: r.errors }
        : { date: key, requests: r.requests, errors: r.errors };
    }
    if (tokBuckets[key]) {
      tokBuckets[key].tokensIn = r.tokensIn;
      tokBuckets[key].tokensOut = r.tokensOut;
    } else {
      tokBuckets[key] = hourly
        ? { hour: key, tokensIn: r.tokensIn, tokensOut: r.tokensOut }
        : { date: key, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
    }
  }

  // ─── Per-provider breakdown (uses provider_id_idx) ───
  // COALESCE(provider_id, 'unknown') matches the old `pid = log.providerId || "unknown"` fallback.
  const providerRows = db
    .select({
      providerId: sql<string>`COALESCE(provider_id, 'unknown')`,
      requests:   sql<number>`COUNT(*)`,
      tokensIn:   sql<number>`COALESCE(SUM(tokens_in), 0)`,
      tokensOut:  sql<number>`COALESCE(SUM(tokens_out), 0)`,
      errors:     sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
      lastUsed:   sql<string | null>`MAX(timestamp)`,
    })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, startISO))
    .groupBy(sql`COALESCE(provider_id, 'unknown')`)
    .all();

  const perProviderBreakdown = providerRows
    .map((r) => ({
      providerId: r.providerId,
      name: providerMap[r.providerId] || r.providerId,
      requests: r.requests,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      errors: r.errors,
      lastUsed: r.lastUsed,
    }))
    .sort((a, b) => b.requests - a.requests);

  // ─── Per-API-key breakdown (uses api_key_id_idx) ───
  // Skip null api_key_id rows — original code only built entries when log.apiKeyId was truthy.
  const keyRows = db
    .select({
      apiKeyId:  requestLogs.apiKeyId,
      requests:  sql<number>`COUNT(*)`,
      tokensIn:  sql<number>`COALESCE(SUM(tokens_in), 0)`,
      tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
      errors:    sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
      lastUsed:  sql<string | null>`MAX(timestamp)`,
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, startISO), isNotNull(requestLogs.apiKeyId)))
    .groupBy(requestLogs.apiKeyId)
    .all();

  const perApiKeyBreakdown = keyRows
    .map((r) => {
      const kid = r.apiKeyId as string;
      return {
        apiKeyId: kid,
        name: apiKeyMap[kid] || `(deleted key ${kid.slice(0, 8)}…)`,
        requests: r.requests,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        errors: r.errors,
        lastUsed: r.lastUsed,
      };
    })
    .sort((a, b) => b.requests - a.requests);

  // ─── Per-model breakdown ───
  // Group by (model, providerId) in SQL so we can both aggregate counts AND track distinct
  // provider IDs per (raw) model. Then in JS we normalize the raw "vendor/model" string
  // to its short tail and merge entries that collapse onto the same name. The number of
  // groups returned is bounded by O(unique-models * unique-providers), which is tiny
  // compared to O(logs).
  const modelRows = db
    .select({
      model:      requestLogs.model,
      providerId: requestLogs.providerId,
      requests:   sql<number>`COUNT(*)`,
      tokensIn:   sql<number>`COALESCE(SUM(tokens_in), 0)`,
      tokensOut:  sql<number>`COALESCE(SUM(tokens_out), 0)`,
      errors:     sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
      lastUsed:   sql<string | null>`MAX(timestamp)`,
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, startISO), isNotNull(requestLogs.model)))
    .groupBy(requestLogs.model, requestLogs.providerId)
    .all();

  const normalizeModel = (raw: string): string => {
    const idx = raw.lastIndexOf("/");
    const normalized = idx >= 0 ? raw.slice(idx + 1) : raw;
    return normalized || raw;
  };

  const modelMap: Record<string, {
    model: string; requests: number; tokensIn: number; tokensOut: number;
    errors: number; providers: Set<string>; lastUsed: string | null;
  }> = {};

  for (const r of modelRows) {
    if (!r.model) continue;
    const name = normalizeModel(r.model);
    let m = modelMap[name];
    if (!m) {
      m = modelMap[name] = {
        model: name, requests: 0, tokensIn: 0, tokensOut: 0,
        errors: 0, providers: new Set(), lastUsed: null,
      };
    }
    m.requests  += r.requests;
    m.tokensIn  += r.tokensIn;
    m.tokensOut += r.tokensOut;
    m.errors    += r.errors;
    if (r.providerId) m.providers.add(r.providerId);
    if (r.lastUsed && (!m.lastUsed || r.lastUsed > m.lastUsed)) m.lastUsed = r.lastUsed;
  }

  const perModelBreakdown = Object.values(modelMap)
    .map((m) => ({
      model: m.model,
      requests: m.requests,
      tokensIn: m.tokensIn,
      tokensOut: m.tokensOut,
      errors: m.errors,
      providerCount: m.providers.size,
      lastUsed: m.lastUsed,
    }))
    .sort((a, b) => b.requests - a.requests);

  // ─── Active providers (last 5s) — DB-side fallback for initial page load ───
  const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000).toISOString();
  const activeRows = db
    .select({ providerId: requestLogs.providerId })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, fiveSecondsAgo), isNotNull(requestLogs.providerId)))
    .groupBy(requestLogs.providerId)
    .all();
  const activeProviderIds = new Set(
    activeRows.map((r) => r.providerId).filter((x): x is string => !!x),
  );

  const requestsPerPeriod = Object.values(reqBuckets);
  const tokenUsagePerPeriod = Object.values(tokBuckets);

  const canvasProviders = providerList.map((p) => ({
    id: p.id, name: p.name, enabled: p.enabled, active: activeProviderIds.has(p.id),
  }));

  return NextResponse.json({
    filter,
    hourly,
    summary: { totalRequests, totalErrors, totalTokensIn, totalTokensOut, avgLatency, streamingRequests, nonStreamingRequests },
    requestsPerPeriod,
    tokenUsagePerPeriod,
    perProviderBreakdown,
    perApiKeyBreakdown,
    perModelBreakdown,
    canvasProviders,
    activeJobs: getActiveJobs(),
  });
}
