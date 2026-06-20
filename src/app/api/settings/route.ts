import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, checkDashboardAuth } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allSettings = db.select().from(settings).all();
  const result: Record<string, string> = {};
  for (const s of allSettings) {
    // Don't expose password in plain response
    if (s.key === "password") {
      result[s.key] = "********";
    } else {
      result[s.key] = s.value;
    }
  }

  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  if (!checkDashboardAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const allowedKeys = ["password", "rtk_enabled", "caveman_enabled", "log_retention_days", "openrouter_provider_sort"];

    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) continue;
      if (typeof value !== "string") {
        // Silently skip non-string values (allowed keys are all stored as strings)
        // but coerce booleans and numbers that clients might send
        if (typeof value === "boolean" || typeof value === "number") {
          // Auto-coerce: true → "true", 30 → "30"
          const coerced = String(value);
          const storedValue = key === "password" ? hashPassword(coerced) : coerced;
          const existing = db.select().from(settings).where(eq(settings.key, key)).get();
          if (existing) {
            db.update(settings).set({ value: storedValue }).where(eq(settings.key, key)).run();
          } else {
            db.insert(settings).values({ key, value: storedValue }).run();
          }
        }
        continue;
      }

      // Hash password before storing
      const storedValue = key === "password" ? hashPassword(value) : value;

      const existing = db.select().from(settings).where(eq(settings.key, key)).get();
      if (existing) {
        db.update(settings).set({ value: storedValue }).where(eq(settings.key, key)).run();
      } else {
        db.insert(settings).values({ key, value: storedValue }).run();
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
