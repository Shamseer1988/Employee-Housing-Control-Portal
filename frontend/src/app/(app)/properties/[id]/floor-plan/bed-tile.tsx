"use client";

import { BedDouble } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import type { FloorPlanBed } from "@/components/floor-plan-bed-modal";

// Color tone per bed.status. Drives both the swatch and the bed tile so
// the legend can never drift from the tiles.
export const TONES: Record<
  string,
  { cls: string; dot: string; label: string }
> = {
  occupied: {
    cls:
      "bg-gradient-to-br from-emerald-500/25 to-emerald-500/5 " +
      "border-emerald-500/60 text-emerald-700 dark:text-emerald-200 " +
      "shadow-emerald-500/20",
    dot: "bg-emerald-500",
    label: "Occupied",
  },
  empty: {
    cls:
      "bg-gradient-to-br from-slate-400/10 to-slate-400/0 " +
      "border-slate-400/40 text-slate-600 dark:text-slate-300 " +
      "shadow-slate-500/10",
    dot: "bg-slate-400",
    label: "Empty",
  },
  reserved: {
    cls:
      "bg-gradient-to-br from-sky-500/25 to-sky-500/5 " +
      "border-sky-500/60 text-sky-700 dark:text-sky-200 " +
      "shadow-sky-500/20",
    dot: "bg-sky-500",
    label: "Reserved",
  },
  maintenance: {
    cls:
      "bg-gradient-to-br from-amber-500/25 to-amber-500/5 " +
      "border-amber-500/60 text-amber-700 dark:text-amber-200 " +
      "shadow-amber-500/20",
    dot: "bg-amber-500",
    label: "Maintenance",
  },
  blocked: {
    cls:
      "bg-gradient-to-br from-rose-500/25 to-rose-500/5 " +
      "border-rose-500/60 text-rose-700 dark:text-rose-200 " +
      "shadow-rose-500/20",
    dot: "bg-rose-500",
    label: "Blocked",
  },
};
export const DEFAULT_TONE = TONES.empty;

// NOTE: this lives in its own module (not page.tsx) because Next.js App
// Router forbids non-default named exports from a page file.
export function BedTile({
  bed,
  onSelect,
}: {
  bed: FloorPlanBed;
  onSelect: (b: FloorPlanBed) => void;
}) {
  const tone = TONES[bed.status] ?? DEFAULT_TONE;
  const empCode = bed.current_employee?.code;
  const label = empCode ?? (bed.bed_number ?? bed.bed_code.slice(-3));
  return (
    <Tooltip
      content={
        <div className="max-w-[18rem] space-y-1">
          <div className="font-medium">
            <span className="font-mono">{bed.bed_code}</span>
            <span className="ml-2 text-[10px] uppercase tracking-wide opacity-80">
              {bed.status}
            </span>
          </div>
          <div className="text-[10px] opacity-80 capitalize">
            {bed.bed_type.replace("_", " ")}
          </div>
          {bed.current_employee ? (
            <div className="border-t border-border/60 pt-1 text-[11px] space-y-0.5">
              <div className="font-medium">{bed.current_employee.full_name}</div>
              <div className="font-mono opacity-70">{bed.current_employee.code}</div>
              {bed.current_employee.designation && (
                <div className="opacity-80">{bed.current_employee.designation}</div>
              )}
              {bed.current_employee.division_name && (
                <div className="opacity-80">{bed.current_employee.division_name}</div>
              )}
            </div>
          ) : (
            <div className="text-[11px] opacity-70 italic">
              No occupant — click to assign
            </div>
          )}
        </div>
      }
    >
      <button
        type="button"
        onClick={() => onSelect(bed)}
        aria-label={`Bed ${bed.bed_code} — ${bed.status}${
          bed.current_employee
            ? `, occupied by ${bed.current_employee.full_name}`
            : ""
        }`}
        className={
          "group relative aspect-square min-w-[3.5rem] grid place-items-center " +
          "rounded-lg border font-mono text-[10px] shadow-sm " +
          "cursor-pointer transition-all duration-150 " +
          "hover:scale-[1.06] hover:-translate-y-0.5 hover:shadow-md " +
          "focus:outline-none focus:ring-2 focus:ring-primary/60 " +
          tone.cls
        }
      >
        <span
          className={
            "absolute top-1 right-1 h-1.5 w-1.5 rounded-full ring-2 ring-background/80 " +
            tone.dot
          }
          aria-hidden="true"
        />
        <BedDouble className="h-3.5 w-3.5 opacity-70" />
        <div className="truncate max-w-[3rem] mt-0.5 font-semibold">{label}</div>
      </button>
    </Tooltip>
  );
}
