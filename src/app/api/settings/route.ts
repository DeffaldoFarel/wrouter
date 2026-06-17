import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { verifySession, hashPassword } from "@/lib/auth/session";

function checkAuth(req: NextRequest): boolean {
  const token = req.cookies.get("session_token")?.value;
  return !!token && verifySession(token);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
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
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const allowedKeys = ["password", "rtk_enabled", "caveman_enabled"];

    for (const [key, value] of Object.entries(body)) {
      if (!allowedKeys.includes(key)) continue;
      if (typeof value !== "string") continue;

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
