import { NextRequest, NextResponse } from "next/server";
import {
  updateApiKeyConnection,
  deleteApiKeyConnection,
  toggleConnection,
} from "@/lib/key-picker";

/**
 * PUT /api/providers/[id]/keys/[connectionId]
 * Update an API key connection.
 */
export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: _providerId, connectionId } = await ctx.params;
  const body = await req.json();

  try {
    updateApiKeyConnection(connectionId, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update key" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/providers/[id]/keys/[connectionId]
 * Delete an API key connection.
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: _providerId, connectionId } = await ctx.params;

  try {
    deleteApiKeyConnection(connectionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete key" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/providers/[id]/keys/[connectionId]
 * Toggle active state of a connection.
 */
export async function PATCH(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: _providerId, connectionId } = await ctx.params;

  try {
    const conn = toggleConnection(connectionId);
    return NextResponse.json({ connection: conn });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to toggle key" },
      { status: 500 }
    );
  }
}
