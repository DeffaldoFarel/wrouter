/**
 * GET /api/oauth/connections - List all OAuth connections
 */
import { NextRequest, NextResponse } from "next/server";
import { getAllConnections } from "@/lib/oauth/connections";
import { checkDashboardAuth } from "@/lib/auth/session";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const connections = getAllConnections();
    return NextResponse.json({ connections });
  } catch (err) {
    logger.error({ err }, "Failed to fetch OAuth connections");
    return NextResponse.json(
      { error: "Failed to fetch connections" },
      { status: 500 }
    );
  }
}
