import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, apiKeys } from "@/lib/db/schema";
import { sql, eq, gte, and } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";

function getStartDate(f: string): Date {
  const now = new Date();
  switch (f) {
    case "today": { const d = new Date(now); d.setHours(0, 0, 0, 0); return d; }
    case "24h":  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":   return new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    case "30d":  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:     return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify key exists
  const key = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!key) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "30d";
  const startDate = getStartDate(filter);
  const startISO = startDate.toISOString();

  // ─── Summary aggregation in SQL (uses timestamp_idx + api_key_id_idx) ───
  // Replaces the old "load all logs into JS, then reduce/filter" path.
  // NULLIF(latency_ms, 0) mirrors the JS `filter((l) => l.latencyMs)` semantics
  // (zero/null are excluded from the average).
  const summaryRow = db
    .select({
      totalRequests:  sql<number>`COUNT(*)`,
      totalErrors:    sql<number>`COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0)`,
      totalTokensIn:  sql<number>`COALESCE(SUM(tokens_in), 0)`,
      totalTokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
      avgLatencyRaw:  sql<number | null>`AVG(NULLIF(latency_ms, 0))`,
    })
    .from(requestLogs)
    .where(and(eq(requestLogs.apiKeyId, id), gte(requestLogs.timestamp, startISO)))
    .get();

  const totalRequests  = summaryRow?.totalRequests ?? 0;
  const totalErrors    = summaryRow?.totalErrors ?? 0;
  const totalTokensIn  = summaryRow?.totalTokensIn ?? 0;
  const totalTokensOut = summaryRow?.totalTokensOut ?? 0;
  const avgLatency = summaryRow?.avgLatencyRaw != null ? Math.round(summaryRow.avgLatencyRaw) : 0;

  // ─── Last 10 requests via ORDER BY + LIMIT ───
  const recentLogs = db
    .select()
    .from(requestLogs)
    .where(and(eq(requestLogs.apiKeyId, id), gte(requestLogs.timestamp, startISO)))
    .orderBy(sql`timestamp DESC`)
    .limit(10)
    .all();

  return NextResponse.json({
    keyId: id,
    keyName: key.name,
    filter,
    summary: { totalRequests, totalErrors, totalTokensIn, totalTokensOut, avgLatency },
    recentLogs,
  });
}
