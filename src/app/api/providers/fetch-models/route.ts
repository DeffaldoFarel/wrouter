import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySession } from "@/lib/auth/session";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { baseUrl, apiKey, providerId } = await req.json();

    if (!baseUrl) {
      return NextResponse.json(
        { error: "baseUrl is required" },
        { status: 400 }
      );
    }

    // If providerId is given, use the stored API key and detect type
    let resolvedApiKey = apiKey;
    let providerType = "custom";
    if (providerId) {
      const provider = db.select().from(providers).where(eq(providers.id, providerId)).get();
      if (provider) {
        if (!resolvedApiKey) resolvedApiKey = provider.apiKey;
        providerType = provider.type ?? "custom";
      }
    }

    if (!resolvedApiKey) {
      return NextResponse.json(
        { error: "apiKey is required" },
        { status: 400 }
      );
    }

    const url = `${baseUrl.replace(/\/$/, "")}/models`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        ...(providerType === "apikey" ? { "HTTP-Referer": "https://wrouter.app", "X-Title": "WRouter" } : {}),
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `Provider returned ${response.status}: ${text}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    // OpenAI-compatible format: { data: [{ id: "model-name", name?, context_length?, pricing? }, ...] }
    // OpenRouter returns richer objects — extract id, name, context_length
    let models: string[] = [];

    if (data.data && Array.isArray(data.data)) {
      models = data.data
        .map((m: { id?: string; name?: string }) => m.id)
        .filter((id: string | undefined): id is string => !!id)
        .sort();
    } else if (Array.isArray(data)) {
      models = data
        .map((m: { id?: string; name?: string }) => m.id || m.name)
        .filter((id: string | undefined): id is string => !!id)
        .sort();
    }

    return NextResponse.json({ models, count: models.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
