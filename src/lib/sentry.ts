import * as Sentry from "@sentry/nextjs";

let initialized = false;

/**
 * Initialize Sentry — only if NEXT_PUBLIC_SENTRY_DSN is set.
 * Safe to call multiple times; only the first call takes effect.
 */
export function initSentry() {
  if (initialized) return;

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? "development",
    // Disable default integrations that may not apply to self-hosted setups
    sendDefaultPii: false,
  });

  initialized = true;
}

/** Whether Sentry is active (DSN was provided and init ran). */
export function isSentryEnabled(): boolean {
  return initialized;
}

// ---------------------------------------------------------------------------
// Wrapper functions — all are no-ops when Sentry is not initialized
// ---------------------------------------------------------------------------

interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: "fatal" | "error" | "warning" | "info" | "debug";
}

/**
 * Report an exception to Sentry. No-op when DSN is not configured.
 */
export function captureException(
  error: unknown,
  context?: CaptureContext,
): void {
  if (!initialized) return;

  if (context) {
    Sentry.withScope((scope) => {
      if (context.tags) scope.setTags(context.tags);
      if (context.extra) scope.setExtras(context.extra);
      if (context.level) scope.setLevel(context.level);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Report a message to Sentry. No-op when DSN is not configured.
 */
export function captureMessage(
  message: string,
  level?: "fatal" | "error" | "warning" | "info" | "debug",
): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}

/**
 * Set the current user context for Sentry events. No-op when DSN is not configured.
 */
export function setUser(user: {
  id?: string;
  email?: string;
  username?: string;
} | null): void {
  if (!initialized) return;
  Sentry.setUser(user);
}
