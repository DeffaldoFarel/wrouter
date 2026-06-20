/**
 * POST /api/oauth/connections/[id]/refresh - Refresh OAuth token
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAndRefreshToken } from "@/lib/oauth/token-refresh";
import { getConnectionById } from "@/lib/oauth/connections";
import logger from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const existing = getConnectionById(id);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const refreshed = await checkAndRefreshToken(id);
    if (!refreshed) {
      return NextResponse.json(
        { error: "Failed to refresh token" },
        { status: 400 }
      );
    }

    logger.info({ id }, "OAuth token refreshed manually");
    return NextResponse.json({ connection: refreshed });
  } catch (err) {
    logger.error({ err, id }, "Failed to refresh OAuth token");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Refresh failed" },
      { status: 500 }
    );
  }
}
