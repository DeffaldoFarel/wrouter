import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, providers, apiKeys, combos, settings } from "@/lib/db/schema";
import { verifySession } from "@/lib/auth/session";
import { ne, eq } from "drizzle-orm";
import { resetLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

const DEFAULT_PASSWORD = "qwertyui";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function POST(req: NextRequest) {
  // Rate limit: 3 reset attempts per minute per IP
  const ip = getClientIp(req);
  const limitCheck = resetLimiter.consume(ip);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type } = await req.json();

  if (type === "logs") {
    // Delete all request logs only
    db.delete(requestLogs).run();
    return NextResponse.json({ ok: true, message: "Request logs cleared" });
  }

  if (type === "full") {
    // Delete everything except the admin password setting
    db.delete(requestLogs).run();
    db.delete(providers).run();
    db.delete(apiKeys).run();
    db.delete(combos).run();
    db.delete(settings).where(ne(settings.key, "password")).run();

    // Defensive: ensure password row exists and is set to default.
    // This protects against previously-corrupted DB state (e.g. old bug
    // that deleted the password row due to a key mismatch).
    const existingPassword = db
      .select()
      .from(settings)
      .where(eq(settings.key, "password"))
      .get();
    const defaultHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
    if (!existingPassword) {
      db.insert(settings).values({ key: "password", value: defaultHash }).run();
    } else {
      // Re-hash the existing value back to default so factory reset truly
      // restores the default credentials.
      db.update(settings)
        .set({ value: defaultHash })
        .where(eq(settings.key, "password"))
        .run();
    }

    return NextResponse.json({ ok: true, message: "All data reset" });
  }

  return NextResponse.json(
    { error: "Invalid reset type. Use 'logs' or 'full'" },
    { status: 400 }
  );
}
