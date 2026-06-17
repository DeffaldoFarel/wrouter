import { initSentry } from "@/lib/sentry";

/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Initializes Sentry only on the Node.js runtime (not Edge).
 */
export async function register() {
  // Only initialize in the Node.js runtime, skip edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    initSentry();
  }
}
