import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, providers, apiKeys } from "@/lib/db/schema";
import { gte } from "drizzle-orm";
import { verifySession } from "@/lib/auth/session";
import { getActiveJobs } from "@/lib/router/engine";
import { maybeCleanupLogs } from "@/lib/log-retention";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
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

// --- Hour buckets ---
function buildHourBuckets(startDate: Date, now: Date) {
  const reqBuckets: Record<string, { hour: string; requests: number; errors: number }> = {};
  const tokBuckets: Record<string, { hour: string; tokensIn: number; tokensOut: number }> = {};
  const cursor = new Date(startDate);
  cursor.setMinutes(0, 0, 0);
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  while (cursor <= end) {
    const key = cursor.toISOString().slice(0, 13); // "2024-06-16T14"
    reqBuckets[key] = { hour: key, requests: 0, errors: 0 };
    tokBuckets[key] = { hour: key, tokensIn: 0, tokensOut: 0 };
    cursor.setHours(cursor.getHours() + 1);
  }
  return { reqBuckets, tokBuckets };
}

// --- Day buckets ---
function buildDayBuckets(startDate: Date, now: Date) {
  const reqBuckets: Record<string, { date: string; requests: number; errors: number }> = {};
  const tokBuckets: Record<string, { date: string; tokensIn: number; tokensOut: number }> = {};
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
  return { reqBuckets, tokBuckets };
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fire-and-forget log retention cleanup
  maybeCleanupLogs();

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "24h";
  const startDate = getStartDate(filter);
  const now = new Date();
  const hourly = USE_HOURLY.has(filter);

  // --- Fetch only the columns needed for aggregation (skip large JSON columns) ---
  const logs = db
    .select({
      id: requestLogs.id,
      timestamp: requestLogs.timestamp,
      model: requestLogs.model,
      providerId: requestLogs.providerId,
      comboId: requestLogs.comboId,
      apiKeyId: requestLogs.apiKeyId,
      tokensIn: requestLogs.tokensIn,
      tokensOut: requestLogs.tokensOut,
      latencyMs: requestLogs.latencyMs,
      status: requestLogs.status,
      isStreaming: requestLogs.isStreaming,
      error: requestLogs.error,
    })
    .from(requestLogs)
    .where(gte(requestLogs.timestamp, startDate.toISOString()))
    .all();

  const providerList = db.select().from(providers).all();
  const providerMap: Record<string, string> = {};
  for (const p of providerList) providerMap[p.id] = p.name;

  const apiKeyList = db.select().from(apiKeys).all();
  const apiKeyMap: Record<string, string> = {};
  for (const k of apiKeyList) apiKeyMap[k.id] = k.name;

  // --- Build time buckets ---
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

  // --- Breakdown accumulators ---
  const providerBreakdown: Record<string, {
    providerId: string; name: string; requests: number;
    tokensIn: number; tokensOut: number; errors: number; lastUsed: string | null;
  }> = {};

  const keyBreakdown: Record<string, {
    apiKeyId: string; name: string; requests: number;
    tokensIn: number; tokensOut: number; errors: number; lastUsed: string | null;
  }> = {};

  const modelBreakdown: Record<string, {
    model: string; requests: number; tokensIn: number; tokensOut: number;
    errors: number; providers: Set<string>; lastUsed: string | null;
  }> = {};

  // --- Summary accumulators ---
  let totalErrors = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalLatency = 0;
  let latencyCount = 0;
  let streamingRequests = 0;
  let nonStreamingRequests = 0;

  // --- Normalize model name helper ---
  const normalizeModel = (raw: string): string => {
    const idx = raw.lastIndexOf("/");
    const normalized = idx >= 0 ? raw.slice(idx + 1) : raw;
    return normalized || raw;
  };

  // --- Active providers tracking (last 5 seconds — client-side SSE tracking is primary) ---
  const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000).toISOString();
  const activeProviderIds = new Set<string>();

  // ═══════════════════════════════════════════════════════
  //  SINGLE LOOP — process each log entry exactly once
  // ═══════════════════════════════════════════════════════
  for (const log of logs) {
    const tokensIn = log.tokensIn || 0;
    const tokensOut = log.tokensOut || 0;
    const isError = log.status === "error";

    // ── Summary ──
    totalTokensIn += tokensIn;
    totalTokensOut += tokensOut;
    if (isError) totalErrors++;
    if (log.latencyMs) {
      totalLatency += log.latencyMs;
      latencyCount++;
    }
    if (log.isStreaming) {
      streamingRequests++;
    } else {
      nonStreamingRequests++;
    }

    // ── Time buckets ──
    const bucketKey = hourly ? log.timestamp.slice(0, 13) : log.timestamp.slice(0, 10);
    if (reqBuckets[bucketKey]) {
      reqBuckets[bucketKey].requests++;
      if (isError) reqBuckets[bucketKey].errors++;
    }
    if (tokBuckets[bucketKey]) {
      tokBuckets[bucketKey].tokensIn += tokensIn;
      tokBuckets[bucketKey].tokensOut += tokensOut;
    }

    // ── Per-provider breakdown ──
    const pid = log.providerId || "unknown";
    if (!providerBreakdown[pid]) {
      providerBreakdown[pid] = {
        providerId: pid, name: providerMap[pid] || pid,
        requests: 0, tokensIn: 0, tokensOut: 0, errors: 0, lastUsed: null,
      };
    }
    const pb = providerBreakdown[pid];
    pb.requests++;
    pb.tokensIn += tokensIn;
    pb.tokensOut += tokensOut;
    if (isError) pb.errors++;
    if (!pb.lastUsed || log.timestamp > pb.lastUsed!) pb.lastUsed = log.timestamp;

    // ── Track active providers (last 5 seconds — fallback for initial page load) ──
    if (log.timestamp >= fiveSecondsAgo && log.providerId) {
      activeProviderIds.add(log.providerId);
    }

    // ── Per-API-Key breakdown ──
    if (log.apiKeyId) {
      const kid = log.apiKeyId;
      if (!keyBreakdown[kid]) {
        const keyName = apiKeyMap[kid] || `(deleted key ${kid.slice(0, 8)}…)`;
        keyBreakdown[kid] = {
          apiKeyId: kid, name: keyName,
          requests: 0, tokensIn: 0, tokensOut: 0, errors: 0, lastUsed: null,
        };
      }
      const kb = keyBreakdown[kid];
      kb.requests++;
      kb.tokensIn += tokensIn;
      kb.tokensOut += tokensOut;
      if (isError) kb.errors++;
      if (!kb.lastUsed || log.timestamp > kb.lastUsed!) kb.lastUsed = log.timestamp;
    }

    // ── Per-Model breakdown ──
    if (log.model) {
      const modelName = normalizeModel(log.model);
      if (!modelBreakdown[modelName]) {
        modelBreakdown[modelName] = {
          model: modelName, requests: 0, tokensIn: 0, tokensOut: 0,
          errors: 0, providers: new Set(), lastUsed: null,
        };
      }
      const mb = modelBreakdown[modelName];
      mb.requests++;
      mb.tokensIn += tokensIn;
      mb.tokensOut += tokensOut;
      if (isError) mb.errors++;
      if (log.providerId) mb.providers.add(log.providerId);
      if (!mb.lastUsed || log.timestamp > mb.lastUsed!) mb.lastUsed = log.timestamp;
    }
  }

  // --- Build sorted results ---
  const requestsPerPeriod = Object.values(reqBuckets);
  const tokenUsagePerPeriod = Object.values(tokBuckets);
  const perProviderBreakdown = Object.values(providerBreakdown).sort((a, b) => b.requests - a.requests);
  const perApiKeyBreakdown = Object.values(keyBreakdown).sort((a, b) => b.requests - a.requests);
  const perModelBreakdown = Object.values(modelBreakdown)
    .map(m => ({
      model: m.model, requests: m.requests,
      tokensIn: m.tokensIn, tokensOut: m.tokensOut,
      errors: m.errors, providerCount: m.providers.size, lastUsed: m.lastUsed,
    }))
    .sort((a, b) => b.requests - a.requests);

  const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;

  // --- Canvas active providers ---
  const canvasProviders = providerList.map((p) => ({
    id: p.id, name: p.name, enabled: p.enabled, active: activeProviderIds.has(p.id),
  }));

  return NextResponse.json({
    filter,
    hourly,
    summary: { totalRequests: logs.length, totalErrors, totalTokensIn, totalTokensOut, avgLatency, streamingRequests, nonStreamingRequests },
    requestsPerPeriod,
    tokenUsagePerPeriod,
    perProviderBreakdown,
    perApiKeyBreakdown,
    perModelBreakdown,
    canvasProviders,
    activeJobs: getActiveJobs(),
  });
}
