import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { verifySession } from "@/lib/auth/session";

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
    apiKey: maskApiKey(p.apiKey),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, prefix, baseUrl, apiKey, type = "custom" } = body;

    if (!name || !prefix || !baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "name, prefix, baseUrl, and apiKey are required" },
        { status: 400 }
      );
    }

    if (type !== "custom" && type !== "apikey") {
      return NextResponse.json(
        { error: "type must be 'custom' or 'apikey'" },
        { status: 400 }
      );
    }

    // Validate prefix format
    if (!/^[a-z0-9-]+$/.test(prefix)) {
      return NextResponse.json(
        { error: "prefix must be lowercase alphanumeric with hyphens only" },
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
      apiKey,
      models: JSON.stringify([]),
      enabled: true,
      type,
      createdAt: now,
      updatedAt: now,
    };

    db.insert(providers).values(provider).run();

    return NextResponse.json({
      ...provider,
      models: [],
      apiKey: maskApiKey(provider.apiKey),
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
