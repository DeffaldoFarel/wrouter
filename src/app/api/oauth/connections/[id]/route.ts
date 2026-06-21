/**
 * PATCH /api/oauth/connections/[id] - Toggle active status
 * DELETE /api/oauth/connections/[id] - Delete connection
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getConnectionById,
  updateConnection,
  deleteConnection,
} from "@/lib/oauth/connections";
import { checkDashboardAuth } from "@/lib/auth/session";
import logger from "@/lib/logger";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!checkDashboardAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const body = await request.json();
    const { isActive } = body;

    if (typeof isActive !== "boolean") {
      return NextResponse.json(
        { error: "isActive must be a boolean" },
        { status: 400 }
      );
    }

    const existing = getConnectionById(id);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const updated = updateConnection(id, { isActive } as any);
    logger.info({ id, isActive }, "OAuth connection updated");
    return NextResponse.json({ connection: updated });
  } catch (err) {
    logger.error({ err, id }, "Failed to update OAuth connection");
    return NextResponse.json(
      { error: "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!checkDashboardAuth(_request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const existing = getConnectionById(id);
    if (!existing) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    deleteConnection(id);
    logger.info({ id }, "OAuth connection deleted");
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err, id }, "Failed to delete OAuth connection");
    return NextResponse.json(
      { error: "Failed to delete connection" },
      { status: 500 }
    );
  }
}
