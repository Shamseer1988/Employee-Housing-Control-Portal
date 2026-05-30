"use client";

/**
 * Lightweight client-side error reporting (Phase 6).
 *
 * No-ops cleanly when NEXT_PUBLIC_SENTRY_DSN is unset, so dev and any
 * deploy that hasn't been wired up yet get no extra network calls and
 * no console noise. Uses the @sentry/nextjs runtime SDK behind a
 * dynamic import so the bundle stays slim when the flag is off.
 */

let initialized = false;
type SentryAPI = {
  init: (opts: { dsn: string; environment?: string; tracesSampleRate?: number }) => void;
  captureException: (err: unknown, ctx?: { extra?: Record<string, unknown> }) => void;
};
let sentry: SentryAPI | null = null;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  initialized = true;
  try {
    // Dynamic import so the bundle only pulls @sentry/browser on the
    // first paint that has a DSN configured. Webpack splits it into a
    // separate chunk — unconfigured deploys download nothing extra.
    const Sentry = (await import("@sentry/browser")) as unknown as SentryAPI;
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENV || "production",
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES || "0"),
    });
    sentry = Sentry;
  } catch {
    // Sentry package missing or failed to load — silently fall through.
    initialized = false;
  }
}

export function reportError(err: unknown, extra?: Record<string, unknown>): void {
  if (sentry) {
    try {
      sentry.captureException(err, extra ? { extra } : undefined);
    } catch {
      // Never let the reporter itself crash the app.
    }
  }
  // Always echo to console so devs without Sentry still see the trace.
  // eslint-disable-next-line no-console
  console.error("[observability]", err, extra);
}
