"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Top-level Next.js error boundary. Shows the actual error message
 * instead of the production-build "Application error" stub so users
 * can report something useful and developers can debug from a screenshot.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <div className="min-h-screen p-6 grid place-items-center">
      <div className="max-w-2xl w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-3">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <AlertCircle className="h-5 w-5" /> Something went wrong on this page
        </div>
        <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground border border-border bg-card/60 rounded-md p-3 max-h-72 overflow-auto">
          {error?.message || String(error)}
          {error?.stack && "\n\n" + error.stack}
          {error?.digest && "\n\ndigest: " + error.digest}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:bg-primary/90"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-3 py-1.5 text-sm hover:bg-accent"
          >
            Back to dashboard
          </a>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-3 py-1.5 text-sm hover:bg-accent"
          >
            Hard reload
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          Copy the box above when reporting this — it contains the exact stack we need to fix it.
        </div>
      </div>
    </div>
  );
}
