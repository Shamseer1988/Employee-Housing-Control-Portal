"use client";

import { BedDouble } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { FloorPlanBed } from "@/components/floor-plan-bed-modal";

// Color tone per bed.status. The Tailwind class drives both the swatch
// and the bed tile so the legend can never drift from the tiles.
// Exported so the floor-plan page can render the matching legend.
export const TONES: Record<string, { cls: string; label: string }> = {
  occupied: { cls: "bg-emerald-500/20 border-emerald-500/60 text-emerald-700 dark:text-emerald-300", label: "Occupied" },
  empty: { cls: "bg-slate-400/10 border-slate-400/40 text-slate-600 dark:text-slate-300", label: "Empty" },
  reserved: { cls: "bg-sky-500/20 border-sky-500/60 text-sky-700 dark:text-sky-300", label: "Reserved" },
  maintenance: { cls: "bg-amber-500/20 border-amber-500/60 text-amber-700 dark:text-amber-300", label: "Maintenance" },
  blocked: { cls: "bg-rose-500/20 border-rose-500/60 text-rose-700 dark:text-rose-300", label: "Blocked" },
};
export const DEFAULT_TONE = TONES.empty;

// NOTE: this lives in its own module (not page.tsx) because Next.js App
// Router forbids non-default named exports from a page file, and the
// vitest suite needs to import BedTile directly.
export function BedTile({
  bed, onSelect,
}: { bed: FloorPlanBed; onSelect: (b: FloorPlanBed) => void }) {
  const tone = TONES[bed.status] ?? DEFAULT_TONE;
  const empCode = bed.current_employee?.code;
  const label = empCode ?? (bed.bed_number ?? bed.bed_code.slice(-3));
  return (
    <Tooltip
      content={
        <div className="max-w-[18rem] space-y-1">
          <div className="font-medium">
            <span className="font-mono">{bed.bed_code}</span>
            <span className="ml-2 text-[10px] uppercase tracking-wide opacity-80">{bed.status}</span>
          </div>
          <div className="text-[10px] opacity-80 capitalize">{bed.bed_type.replace("_", " ")}</div>
          {bed.current_employee ? (
            <div className="border-t border-border/60 pt-1 text-[11px] space-y-0.5">
              <div className="font-medium">{bed.current_employee.full_name}</div>
              <div className="font-mono opacity-70">{bed.current_employee.code}</div>
              {bed.current_employee.designation && <div className="opacity-80">{bed.current_employee.designation}</div>}
              {bed.current_employee.division_name && <div className="opacity-80">{bed.current_employee.division_name}</div>}
            </div>
          ) : (
            <div className="text-[11px] opacity-70 italic">No occupant — click to assign</div>
          )}
        </div>
      }
    >
      <button
        type="button"
        onClick={() => onSelect(bed)}
        aria-label={`Bed ${bed.bed_code} — ${bed.status}${bed.current_employee ? `, occupied by ${bed.current_employee.full_name}` : ""}`}
        className={
          "aspect-square min-w-[3.25rem] grid place-items-center rounded-md border font-mono text-[10px] " +
          "cursor-pointer transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/60 " +
          tone.cls
        }
      >
        <BedDouble className="h-3.5 w-3.5 opacity-70" />
        <div className="truncate max-w-[3rem]">{label}</div>
      </button>
    </Tooltip>
  );
}
