/**
 * GET /api/oauth/connections - List all OAuth connections
 */
import { NextResponse } from "next/server";
import { getAllConnections } from "@/lib/oauth/connections";
import logger from "@/lib/logger";

export async function GET() {
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
