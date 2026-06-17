import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";
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

  const logs = db
    .select()
    .from(requestLogs)
    .orderBy(desc(requestLogs.timestamp))
    .limit(limit)
    .offset(offset)
    .all();

  // Total count for pagination
  const [{ count }] = db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(requestLogs)
    .all();

  return NextResponse.json({ logs, total: count, limit, offset });
}
