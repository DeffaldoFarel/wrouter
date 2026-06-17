import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("session_token")?.value;
  if (!token || !verifySession(token)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true });
}
