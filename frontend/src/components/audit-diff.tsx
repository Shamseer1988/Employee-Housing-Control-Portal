"use client";

import { ChevronRight } from "lucide-react";

export type AuditDiffEntry = {
  field: string;
  before: unknown;
  after: unknown;
};

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * Compact before/after renderer for an audit-log update row.
 *
 * Server precomputes the diff (routes/audit.py::_compute_diff) so this
 * is purely presentational — no JSON-diffing in the browser.
 */
export function AuditDiff({ diff }: { diff: AuditDiffEntry[] | null | undefined }) {
  if (!diff || diff.length === 0) {
    return <div className="text-xs text-muted-foreground">No tracked field changes.</div>;
  }
  return (
    <div className="rounded-md border border-border bg-card/40 divide-y divide-border/60">
      {diff.map((d) => (
        <div key={d.field} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
          <div className="col-span-3 font-mono text-xs text-muted-foreground self-center truncate">
            {d.field}
          </div>
          <div className="col-span-4 text-rose-700 dark:text-rose-400 break-words font-mono text-xs self-center">
            {fmt(d.before)}
          </div>
          <div className="col-span-1 grid place-items-center text-muted-foreground">
            <ChevronRight className="h-3 w-3" />
          </div>
          <div className="col-span-4 text-emerald-700 dark:text-emerald-400 break-words font-mono text-xs self-center">
            {fmt(d.after)}
          </div>
        </div>
      ))}
    </div>
  );
}
