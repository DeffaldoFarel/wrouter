import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiKeys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkDashboardAuth, invalidateApiKeyCache } from "@/lib/auth/session";
import { invalidateCache } from "@/lib/api-cache";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, enabled, allowedModels } = body;

  const existing = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  const updated = {
    name: name ?? existing.name,
    enabled: enabled !== undefined ? enabled : existing.enabled,
    allowedModels: allowedModels !== undefined ? JSON.stringify(allowedModels) : existing.allowedModels,
  };

  db.update(apiKeys).set(updated).where(eq(apiKeys.id, id)).run();

  // Invalidate server-side and client-side caches
  if (existing.key) invalidateApiKeyCache(existing.key);
  invalidateCache("/api/keys");

  return NextResponse.json({ 
    ...existing, 
    ...updated,
    allowedModels: allowedModels ?? JSON.parse(existing.allowedModels || "[]")
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  db.delete(apiKeys).where(eq(apiKeys.id, id)).run();

  // Invalidate server-side and client-side caches
  if (existing.key) invalidateApiKeyCache(existing.key);
  invalidateCache("/api/keys");

  return NextResponse.json({ success: true });
}
