import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateProviderUpdate } from "@/lib/validation";
import { encrypt, isEncrypted, safeDecryptApiKey } from "@/lib/crypto";
import { validateUrl } from "@/lib/ssrf-guard";
import { invalidateProviderCache } from "@/lib/router/engine";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(req)) {
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
    apiKey: provider.apiKey ? maskApiKey(safeDecryptApiKey(provider.apiKey)) : null,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  // Validate request body (partial — only provided fields)
  const validation = validateProviderUpdate(body);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validation failed", errors: validation.errors },
      { status: 400 }
    );
  }

  const { name, prefix, baseUrl, apiKey, models, enabled, type, format, connectionStrategy } = body as {
    name?: string;
    prefix?: string;
    baseUrl?: string;
    apiKey?: string;
    models?: string[];
    enabled?: boolean;
    type?: string;
    format?: string;
    connectionStrategy?: string;
  };

  // Validate format if provided
  if (format !== undefined && !["openai", "anthropic", "gemini"].includes(format)) {
    return NextResponse.json(
      { error: `Invalid format: ${format}. Must be 'openai', 'anthropic', or 'gemini'.` },
      { status: 400 }
    );
  }

  const existing = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  // If prefix changed, check uniqueness (exclude current provider)
  if (prefix && prefix !== existing.prefix) {
    const prefixExists = db
      .select()
      .from(providers)
      .where(and(eq(providers.prefix, prefix), ne(providers.id, id)))
      .get();
    if (prefixExists) {
      return NextResponse.json(
        { error: "A provider with this prefix already exists" },
        { status: 409 }
      );
    }
  }

  // SSRF guard: validate baseUrl if it's being updated
  if (baseUrl) {
    const ssrfCheck = await validateUrl(baseUrl);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { error: `SSRF protection: ${ssrfCheck.error}` },
        { status: 400 }
      );
    }
  }

  const updated = {
    name: name ?? existing.name,
    prefix: prefix ?? existing.prefix,
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, "") : existing.baseUrl,
    apiKey: apiKey ? (isEncrypted(apiKey) ? apiKey : encrypt(apiKey)) : existing.apiKey,
    models: models ? JSON.stringify(models) : existing.models,
    enabled: enabled !== undefined ? enabled : existing.enabled,
    type: type ?? existing.type,
    format: format ?? (existing as { format?: string }).format ?? "openai",
    connectionStrategy: connectionStrategy ?? (existing as { connectionStrategy?: string }).connectionStrategy ?? "priority",
    updatedAt: new Date().toISOString(),
  };

  db.update(providers).set(updated).where(eq(providers.id, id)).run();
  invalidateProviderCache();

  return NextResponse.json({
    id,
    ...updated,
    models: JSON.parse(updated.models),
    apiKey: updated.apiKey ? maskApiKey(safeDecryptApiKey(updated.apiKey)) : null,
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
  const existing = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  db.delete(providers).where(eq(providers.id, id)).run();
  invalidateProviderCache();

  return NextResponse.json({ success: true });
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
