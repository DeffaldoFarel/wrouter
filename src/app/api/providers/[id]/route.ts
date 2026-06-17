import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/auth/session";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const provider = db.select().from(providers).where(eq(providers.id, id)).get();

  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  return NextResponse.json({
    ...provider,
    models: JSON.parse(provider.models),
    apiKey: maskApiKey(provider.apiKey),
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
  const { name, prefix, baseUrl, apiKey, models, enabled, type } = body;

  const existing = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  // If prefix changed, validate and check uniqueness
  if (prefix && prefix !== existing.prefix) {
    if (!/^[a-z0-9-]+$/.test(prefix)) {
      return NextResponse.json(
        { error: "prefix must be lowercase alphanumeric with hyphens only" },
        { status: 400 }
      );
    }
    const prefixExists = db.select().from(providers).where(eq(providers.prefix, prefix)).get();
    if (prefixExists) {
      return NextResponse.json(
        { error: "A provider with this prefix already exists" },
        { status: 409 }
      );
    }
  }

  const updated = {
    name: name ?? existing.name,
    prefix: prefix ?? existing.prefix,
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, "") : existing.baseUrl,
    apiKey: apiKey ?? existing.apiKey,
    models: models ? JSON.stringify(models) : existing.models,
    enabled: enabled !== undefined ? enabled : existing.enabled,
    type: type ?? existing.type,
    updatedAt: new Date().toISOString(),
  };

  db.update(providers).set(updated).where(eq(providers.id, id)).run();

  return NextResponse.json({
    id,
    ...updated,
    models: JSON.parse(updated.models),
    apiKey: maskApiKey(updated.apiKey),
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
  const existing = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  db.delete(providers).where(eq(providers.id, id)).run();

  return NextResponse.json({ success: true });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
