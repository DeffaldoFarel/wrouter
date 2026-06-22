import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, providerConnections } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateUrl } from "@/lib/ssrf-guard";
// API keys stored plaintext — matches 9router upstream.
import { validateProvider } from "@/lib/validation";
import { invalidateProviderCache } from "@/lib/router/engine";
import { maskApiKey } from "@/lib/utils/mask-key";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allProviders = db.select().from(providers).all();
  const result = allProviders.map((p) => ({
    ...p,
    models: JSON.parse(p.models),
    apiKey: p.apiKey ? maskApiKey(p.apiKey) : null,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Validate request body
    const validation = validateProvider(body);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Validation failed", errors: validation.errors },
        { status: 400 }
      );
    }

    const { name, prefix, baseUrl, apiKey, type = "custom" } = body;
    // Format determines upstream API dialect: "openai" (default) | "anthropic" | "gemini"
    // Auto-detect from baseUrl if caller didn't specify (e.g. anthropic.com → anthropic).
    let { format } = body as { format?: string };
    if (!format) {
      if (baseUrl.includes("anthropic.com")) format = "anthropic";
      else if (baseUrl.includes("cloudcode-pa.googleapis.com")) format = "gemini-cli";
      else if (baseUrl.includes("generativelanguage.googleapis.com")) format = "gemini";
      else format = "openai";
    }
    if (!["openai", "anthropic", "gemini", "gemini-cli"].includes(format)) {
      return NextResponse.json(
        { error: `Invalid format: ${format}. Must be 'openai', 'anthropic', 'gemini', or 'gemini-cli'.` },
        { status: 400 }
      );
    }

    // SSRF guard: validate baseUrl before storing
    const ssrfCheck = await validateUrl(baseUrl);
    if (!ssrfCheck.valid) {
      return NextResponse.json(
        { error: `SSRF protection: ${ssrfCheck.error}` },
        { status: 400 }
      );
    }

    // Check prefix uniqueness
    const existing = db.select().from(providers).where(eq(providers.prefix, prefix)).get();
    if (existing) {
      return NextResponse.json(
        { error: "A provider with this prefix already exists" },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const provider = {
      id: uuidv4(),
      name,
      prefix,
      baseUrl: baseUrl.replace(/\/$/, ""),
      apiKey: apiKey ?? null,
      models: JSON.stringify([]),
      enabled: true,
      type,
      format,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(providers).values(provider).run();

    // Also create a provider_connections entry for the API key (multi-key support)
    if (apiKey) {
      db.insert(providerConnections).values({
        id: uuidv4(),
        providerId: provider.id,
        provider: prefix,
        authType: "apikey",
        name: "Primary Key",
        priority: 0,
        isActive: true,
        data: JSON.stringify({ apiKey: apiKey }),
        maxErrors: 5,
        currentUsage: 0,
        errorCount: 0,
        createdAt: now,
        updatedAt: now,
      }).run();
    }

    invalidateProviderCache();

    return NextResponse.json({
      ...provider,
      models: [],
      apiKey: apiKey ? maskApiKey(apiKey) : null,
    }, { status: 201 });
  } catch (err) {
    console.error("POST /api/providers error:", err);
    return NextResponse.json(
      { error: "Internal server error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}


