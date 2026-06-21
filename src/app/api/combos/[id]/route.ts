import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { combos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateCombo } from "@/lib/validation";

function checkAuth(req: NextRequest): boolean {
  return checkDashboardAuth(req) !== null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const combo = db.select().from(combos).where(eq(combos.id, id)).get();

  if (!combo) {
    return NextResponse.json({ error: "Combo not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...combo,
    models: JSON.parse(combo.models),
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const validation = validateCombo(body, true);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validation failed", errors: validation.errors },
      { status: 400 }
    );
  }

  const { name, slug, models, enabled } = body;

  const existing = db.select().from(combos).where(eq(combos.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Combo not found" }, { status: 404 });
  }

  // If slug changed, check uniqueness
  if (slug && slug !== existing.slug) {
    const slugExists = db.select().from(combos).where(eq(combos.slug, slug)).get();
    if (slugExists) {
      return NextResponse.json(
        { error: "A combo with this slug already exists" },
        { status: 409 }
      );
    }
  }

  const updated = {
    name: name ?? existing.name,
    slug: slug ?? existing.slug,
    models: models ? JSON.stringify(models) : existing.models,
    enabled: enabled !== undefined ? enabled : existing.enabled,
  };

  db.update(combos).set(updated).where(eq(combos.id, id)).run();

  return NextResponse.json({
    id,
    ...updated,
    models: JSON.parse(updated.models),
    createdAt: existing.createdAt,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = db.select().from(combos).where(eq(combos.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Combo not found" }, { status: 404 });
  }

  db.delete(combos).where(eq(combos.id, id)).run();

  return NextResponse.json({ success: true });
}
