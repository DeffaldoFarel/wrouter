import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSession } from "@/lib/auth/session";
import { loginLimiter, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  // Rate limit: 5 login attempts per minute per IP
  const ip = getClientIp(req);
  const limitCheck = loginLimiter.consume(ip);
  if (!limitCheck.allowed) {
    return rateLimitResponse(limitCheck.retryAfter);
  }

  try {
    const body = await req.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const isValid = verifyPassword(password);
    if (!isValid) {
      logger.info({ ip, success: false }, "Login attempt failed");
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    const token = createSession();

    logger.info({ ip, success: true }, "Login attempt succeeded");

    const response = NextResponse.json({ success: true });
    response.cookies.set("session_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (err) {
    logger.error({ err, ip }, "Login error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
