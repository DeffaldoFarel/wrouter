import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { verifySession } from "@/lib/auth/session";
import { validateUrl } from "@/lib/ssrf-guard";
import { encrypt, safeDecryptApiKey } from "@/lib/crypto";
import { validateProvider } from "@/lib/validation";
import { invalidateProviderCache } from "@/lib/router/engine";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allProviders = db.select().from(providers).all();
  const result = allProviders.map((p) => ({
    ...p,
    models: JSON.parse(p.models),
    apiKey: maskApiKey(safeDecryptApiKey(p.apiKey)),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
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
      apiKey: encrypt(apiKey),
      models: JSON.stringify([]),
      enabled: true,
      type,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(providers).values(provider).run();
    invalidateProviderCache();

    return NextResponse.json({
      ...provider,
      models: [],
      apiKey: maskApiKey(apiKey),
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return key.slice(0, 4) + "****" + key.slice(-4);
}
