import { NextRequest, NextResponse } from "next/server";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  /** Maximum tokens (requests) allowed in the window */
  maxTokens: number;
  /** How many tokens to refill per window period */
  refillRate: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private maxTokens: number;
  private refillRate: number;
  private windowMs: number;

  constructor(opts: RateLimiterOptions) {
    this.maxTokens = opts.maxTokens;
    this.refillRate = opts.refillRate;
    this.windowMs = opts.windowMs;
  }

  /**
   * Try to consume one token for the given key.
   * Returns { allowed: true } or { allowed: false, retryAfter: <seconds> }.
   */
  consume(key: string): { allowed: boolean; retryAfter: number } {
    this.maybeCleanup();

    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.windowMs) * this.refillRate;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, retryAfter: 0 };
    }

    // Calculate how long until 1 token is available
    const deficit = 1 - bucket.tokens;
    const retryAfter = Math.ceil((deficit / this.refillRate) * this.windowMs / 1000);
    return { allowed: false, retryAfter };
  }

  /**
   * Remove stale entries with 1% probability per call (same pattern as session cleanup).
   */
  private maybeCleanup(): void {
    if (Math.random() >= 0.01) return;

    const now = Date.now();
    const staleThreshold = this.windowMs * 2; // entries idle for 2x the window

    this.buckets.forEach((bucket, key) => {
      if (now - bucket.lastRefill > staleThreshold) {
        this.buckets.delete(key);
      }
    });
  }
}

// --- Pre-configured limiters ---

/** Login: 5 attempts per minute per IP */
export const loginLimiter = new RateLimiter({
  maxTokens: 5,
  refillRate: 5,
  windowMs: 60_000,
});

/** Chat completions: 60 requests per minute per API key */
export const chatLimiter = new RateLimiter({
  maxTokens: 60,
  refillRate: 60,
  windowMs: 60_000,
});

/** Reset: 3 attempts per minute per IP */
export const resetLimiter = new RateLimiter({
  maxTokens: 3,
  refillRate: 3,
  windowMs: 60_000,
});

// --- Helpers ---

/**
 * Extract the client IP from a Next.js request.
 * Checks x-forwarded-for, x-real-ip, and falls back to "unknown".
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

/**
 * Build a 429 rate-limit response with the standard shape.
 */
export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Rate limit exceeded", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
      },
    }
  );
}
