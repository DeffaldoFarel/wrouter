import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestLogs, providers, apiKeys, combos, settings } from "@/lib/db/schema";
import { verifySession } from "@/lib/auth/session";
import { ne } from "drizzle-orm";
import { resetLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

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
    db.delete(settings).where(ne(settings.key, "password_hash")).run();
    return NextResponse.json({ ok: true, message: "All data reset" });
  }

  return NextResponse.json(
    { error: "Invalid reset type. Use 'logs' or 'full'" },
    { status: 400 }
  );
}
