import { NextRequest, NextResponse } from "next/server";
import {
  getConnectionStats,
  createApiKeyConnection,
} from "@/lib/key-picker";
import { db } from "@/lib/db";
import { providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkDashboardAuth } from "@/lib/auth/session";
import { validateProviderConnectionKey } from "@/lib/validation";

/**
 * GET /api/providers/[id]/keys
 * List all API key connections for a provider.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(_req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const stats = getConnectionStats(id);
  return NextResponse.json({ keys: stats });
}

/**
 * POST /api/providers/[id]/keys
 * Create a new API key connection.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Verify provider exists
  const provider = db.select().from(providers).where(eq(providers.id, id)).get();
  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const body = await req.json();

  const validation = validateProviderConnectionKey(body);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Validation failed", errors: validation.errors },
      { status: 400 }
    );
  }

  const { name, apiKey, priority, maxErrors, rateLimit } = body;

  try {
    const connection = createApiKeyConnection({
      providerId: id,
      name: name || `Key ${Date.now()}`,
      apiKey,
      priority: priority ?? 0,
      maxErrors: maxErrors ?? 5,
      rateLimit,
    });

    return NextResponse.json({ connection }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create key" },
      { status: 500 }
    );
  }
}
