"use client";

import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

type State = { error: Error | null };

/**
 * Minimal client error boundary. Renders a clear message instead of the
 * generic Next.js "Application error: a client-side exception has
 * occurred" so we can actually see what broke.
 */
export class ErrorBoundary extends React.Component<
  { fallbackTitle?: string; children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="glass rounded-xl border border-destructive/30 bg-destructive/5 p-6 space-y-2">
        <div className="flex items-center gap-2 text-destructive font-medium">
          <AlertCircle className="h-4 w-4" />
          {this.props.fallbackTitle ?? "Something went wrong rendering this view."}
        </div>
        <pre className="text-xs whitespace-pre-wrap break-words font-mono text-muted-foreground border border-border bg-card/60 rounded-md p-3 max-h-64 overflow-auto">
          {String(error?.stack || error?.message || error)}
        </pre>
        <button
          onClick={this.reset}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      </div>
    );
  }
}
