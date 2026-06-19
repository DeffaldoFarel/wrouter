import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, apiKeys } from "@/lib/db/schema";
import { eq, gte, and } from "drizzle-orm";
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

  // Filter at DB level using both conditions (uses timestamp_idx + api_key_id_idx)
  const logs = db
    .select()
    .from(requestLogs)
    .where(
      and(
        eq(requestLogs.apiKeyId, id),
        gte(requestLogs.timestamp, startDate.toISOString())
      )
    )
    .all();

  const totalRequests = logs.length;
  const totalErrors   = logs.filter((l) => l.status === "error").length;
  const totalTokensIn  = logs.reduce((s, l) => s + (l.tokensIn  || 0), 0);
  const totalTokensOut = logs.reduce((s, l) => s + (l.tokensOut || 0), 0);
  const logsWithLatency = logs.filter((l) => l.latencyMs);
  const avgLatency = logsWithLatency.length > 0
    ? Math.round(logsWithLatency.reduce((s, l) => s + (l.latencyMs || 0), 0) / logsWithLatency.length)
    : 0;

  // Last 10 requests
  const recentLogs = [...logs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 10);

  return NextResponse.json({
    keyId: id,
    keyName: key.name,
    filter,
    summary: { totalRequests, totalErrors, totalTokensIn, totalTokensOut, avgLatency },
    recentLogs,
  });
}
