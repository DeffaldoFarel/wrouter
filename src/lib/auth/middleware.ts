import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/session";

export function withAuth(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const token = req.cookies.get("session_token")?.value;
    if (!token || !verifySession(token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(req);
  };
}

export function withApiKey(
  handler: (req: NextRequest) => Promise<NextResponse | Response>
) {
  return async (req: NextRequest) => {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const apiKey = authHeader.slice(7);
    const { verifyApiKey } = await import("@/lib/auth/session");
    if (!verifyApiKey(apiKey)) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    return handler(req);
  };
}
