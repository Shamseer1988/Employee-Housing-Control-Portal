"use client";

import { AlertCircle, RefreshCw, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Pulsing placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} aria-hidden="true" />;
}

/** A row of skeleton cells with the given column widths (CSS lengths). */
export function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="border-b border-border/60">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="py-2 px-3">
          <Skeleton className="h-4 w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </tbody>
  );
}

/** Empty-state placeholder for lists / grids. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: typeof Inbox;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-10 text-center space-y-2 animate-fade-in">
      <Icon className="h-8 w-8 text-muted-foreground mx-auto" />
      <div className="text-sm font-medium">{title}</div>
      {hint && <div className="text-xs text-muted-foreground max-w-md mx-auto">{hint}</div>}
      {action && <div className="pt-2 inline-flex justify-center">{action}</div>}
    </div>
  );
}

/** Error-state with retry, matched to the empty-state look. */
export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="glass rounded-xl p-10 text-center space-y-2 border border-destructive/30 bg-destructive/5">
      <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
      <div className="text-sm font-medium">{title}</div>
      {message && <div className="text-xs text-muted-foreground max-w-md mx-auto">{message}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs hover:bg-accent"
        >
          <RefreshCw className="h-3 w-3" /> Try again
        </button>
      )}
    </div>
  );
}
