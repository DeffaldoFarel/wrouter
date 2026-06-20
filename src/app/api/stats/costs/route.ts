import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs } from "@/lib/db/schema";
import { sql, gte, and, isNotNull } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";

/**
 * GET /api/stats/costs
 *
 * Returns cost aggregation:
 * - today, last 7 days, last 30 days totals
 * - breakdown per model
 * - breakdown per provider
 * - daily cost series (last 30 days)
 */
export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Total costs: today, 7d, 30d
  const todayCost = db
    .select({ total: sql<string>`COALESCE(SUM(CAST(cost_usd AS REAL)), 0)` })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, todayStart), isNotNull(requestLogs.costUsd)))
    .get();

  const weekCost = db
    .select({ total: sql<string>`COALESCE(SUM(CAST(cost_usd AS REAL)), 0)` })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, weekAgo), isNotNull(requestLogs.costUsd)))
    .get();

  const monthCost = db
    .select({ total: sql<string>`COALESCE(SUM(CAST(cost_usd AS REAL)), 0)` })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, monthAgo), isNotNull(requestLogs.costUsd)))
    .get();

  // Breakdown by model (last 30 days)
  const byModel = db
    .select({
      model: requestLogs.model,
      totalCost: sql<string>`COALESCE(SUM(CAST(cost_usd AS REAL)), 0)`,
      requests: sql<number>`COUNT(*)`,
      tokensIn: sql<number>`COALESCE(SUM(tokens_in), 0)`,
      tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, monthAgo), isNotNull(requestLogs.costUsd)))
    .groupBy(requestLogs.model)
    .orderBy(sql`SUM(CAST(cost_usd AS REAL)) DESC`)
    .limit(20)
    .all();

  // Breakdown by provider (last 30 days)
  const byProvider = db
    .select({
      providerId: requestLogs.providerId,
      totalCost: sql<string>`COALESCE(SUM(CAST(cost_usd AS REAL)), 0)`,
      requests: sql<number>`COUNT(*)`,
      tokensIn: sql<number>`COALESCE(SUM(tokens_in), 0)`,
      tokensOut: sql<number>`COALESCE(SUM(tokens_out), 0)`,
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, monthAgo), isNotNull(requestLogs.costUsd)))
    .groupBy(requestLogs.providerId)
    .orderBy(sql`SUM(CAST(cost_usd AS REAL)) DESC`)
    .limit(20)
    .all();

  // Daily cost series (last 30 days)
  const dailySeries = db
    .select({
      date: sql<string>`DATE(timestamp)`,
      totalCost: sql<string>`COALESCE(SUM(CAST(cost_usd AS REAL)), 0)`,
      requests: sql<number>`COUNT(*)`,
    })
    .from(requestLogs)
    .where(and(gte(requestLogs.timestamp, monthAgo), isNotNull(requestLogs.costUsd)))
    .groupBy(sql`DATE(timestamp)`)
    .orderBy(sql`DATE(timestamp) ASC`)
    .all();

  return NextResponse.json({
    totals: {
      today: parseFloat(todayCost?.total ?? "0"),
      week: parseFloat(weekCost?.total ?? "0"),
      month: parseFloat(monthCost?.total ?? "0"),
    },
    byModel: byModel.map((r) => ({
      model: r.model,
      cost: parseFloat(r.totalCost),
      requests: r.requests,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    })),
    byProvider: byProvider.map((r) => ({
      providerId: r.providerId,
      cost: parseFloat(r.totalCost),
      requests: r.requests,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    })),
    dailySeries: dailySeries.map((r) => ({
      date: r.date,
      cost: parseFloat(r.totalCost),
      requests: r.requests,
    })),
  });
}
