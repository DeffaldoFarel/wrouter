import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { combos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateCombo } from "@/lib/validation";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allCombos = db.select().from(combos).all();
  const result = allCombos.map((c) => ({
    ...c,
    models: JSON.parse(c.models),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    const validation = validateCombo(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", errors: validation.errors },
        { status: 400 }
      );
    }

    const { name, slug, models } = body;

    // Check slug uniqueness
    const existing = db.select().from(combos).where(eq(combos.slug, slug)).get();
    if (existing) {
      return NextResponse.json(
        { error: "A combo with this slug already exists" },
        { status: 409 }
      );
    }

    const combo = {
      id: uuidv4(),
      name,
      slug,
      models: JSON.stringify(models || []),
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    db.insert(combos).values(combo).run();

    return NextResponse.json({
      ...combo,
      models: models || [],
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
