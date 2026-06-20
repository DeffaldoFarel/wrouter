import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, apiKeys, providers } from "@/lib/db/schema";
import { desc, sql, eq } from "drizzle-orm";
import { verifySession } from "@/lib/auth/session";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const id = url.searchParams.get("id"); // Fetch single log with details

  // Single log fetch (with full details) — used by Sheet on-demand
  if (id) {
    const row = db
      .select({
        id: requestLogs.id,
        timestamp: requestLogs.timestamp,
        model: requestLogs.model,
        providerId: requestLogs.providerId,
        providerName: providers.name,
        providerPrefix: providers.prefix,
        comboId: requestLogs.comboId,
        apiKeyId: requestLogs.apiKeyId,
        apiKeyName: apiKeys.name,
        tokensIn: requestLogs.tokensIn,
        tokensOut: requestLogs.tokensOut,
        latencyMs: requestLogs.latencyMs,
        status: requestLogs.status,
        isStreaming: requestLogs.isStreaming,
        error: requestLogs.error,
        costUsd: requestLogs.costUsd,
        requestDetail: requestLogs.requestDetail,
        responseDetail: requestLogs.responseDetail,
      })
      .from(requestLogs)
      .leftJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
      .leftJoin(providers, eq(requestLogs.providerId, providers.id))
      .where(eq(requestLogs.id, id))
      .get();

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ log: row });
  }

  // List fetch (without heavy detail fields) — used by table
  const rows = db
    .select({
      id: requestLogs.id,
      timestamp: requestLogs.timestamp,
      model: requestLogs.model,
      providerId: requestLogs.providerId,
      providerName: providers.name,
      providerPrefix: providers.prefix,
      comboId: requestLogs.comboId,
      apiKeyId: requestLogs.apiKeyId,
      apiKeyName: apiKeys.name,
      tokensIn: requestLogs.tokensIn,
      tokensOut: requestLogs.tokensOut,
      latencyMs: requestLogs.latencyMs,
      status: requestLogs.status,
      isStreaming: requestLogs.isStreaming,
      error: requestLogs.error,
      costUsd: requestLogs.costUsd,
    })
    .from(requestLogs)
    .leftJoin(apiKeys, eq(requestLogs.apiKeyId, apiKeys.id))
    .leftJoin(providers, eq(requestLogs.providerId, providers.id))
    .orderBy(desc(requestLogs.timestamp))
    .limit(limit)
    .offset(offset)
    .all();

  // Total count for pagination
  const [{ count }] = db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(requestLogs)
    .all();

  return NextResponse.json({ logs: rows, total: count, limit, offset });
}
