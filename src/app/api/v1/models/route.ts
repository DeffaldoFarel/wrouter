import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { providers, combos } from "@/lib/db/schema";
import { verifyApiKey } from "@/lib/auth/session";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function corsResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return NextResponse.json(body, { ...init, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return corsResponse({ error: "Missing API key" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  const apiKeyRecord = verifyApiKey(apiKey);
  if (!apiKeyRecord) {
    return corsResponse({ error: "Invalid API key" }, { status: 401 });
  }

  // Collect all models from all enabled providers
  const allProviders = db.select().from(providers).all();
  const allCombos = db.select().from(combos).all();

  const models: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }> = [];

  // Add direct models from providers (with prefix format: prefix/model)
  for (const provider of allProviders) {
    if (!provider.enabled) continue;
    let providerModels: string[];
    try {
      providerModels = JSON.parse(provider.models);
    } catch {
      providerModels = [];
    }
    for (const model of providerModels) {
      models.push({
        id: `${provider.prefix}/${model}`,
        object: "model",
        created: Math.floor(new Date(provider.createdAt).getTime() / 1000),
        owned_by: provider.name,
      });
    }
  }

  // Add combos as single virtual models (slug only — user requests "com1", fallback is transparent)
  for (const combo of allCombos) {
    if (!combo.enabled) continue;
    models.push({
      id: combo.slug,
      object: "model",
      created: Math.floor(new Date(combo.createdAt).getTime() / 1000),
      owned_by: `combo:${combo.name}`,
    });
  }

  // Filter by allowedModels if specified (empty = all allowed)
  let filteredModels = models;
  if (apiKeyRecord.allowedModels.length > 0) {
    const allowed = new Set(apiKeyRecord.allowedModels);

    filteredModels = models.filter((m) => {
      // Direct match
      if (allowed.has(m.id)) return true;

      // Combo: allow if any underlying model (prefix/model format) is in allowedModels
      if (m.owned_by.startsWith("combo:")) {
        const combo = allCombos.find((c) => c.slug === m.id);
        if (combo) {
          let comboModels: Array<{ model: string; providerId: string }>;
          try {
            comboModels = JSON.parse(combo.models);
          } catch {
            comboModels = [];
          }
          for (const entry of comboModels) {
            const prov = allProviders.find((p) => p.id === entry.providerId);
            if (prov && allowed.has(`${prov.prefix}/${entry.model}`)) return true;
          }
        }
      }

      return false;
    });
  }

  return corsResponse({
    object: "list",
    data: filteredModels,
  });
}
