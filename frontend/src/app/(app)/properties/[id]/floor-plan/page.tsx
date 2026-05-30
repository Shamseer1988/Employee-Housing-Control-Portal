"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BedDouble, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useRouteParams } from "@/lib/use-route-params";
import { useEvents } from "@/lib/use-events";
import { Skeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { Tooltip } from "@/components/ui/tooltip";
import { BedActionModal, type FloorPlanBed, type FloorPlanRoom } from "@/components/floor-plan-bed-modal";

type Room = FloorPlanRoom & {
  capacity: number | null;
  occupancy_status: string;
  bed_counts?: { total: number; occupied: number; empty: number; reserved: number; maintenance: number; blocked: number };
  beds: FloorPlanBed[];
};

type Floor = {
  id: number;
  floor_number: string;
  rooms: Room[];
};

type Property = { id: number; code: string; name: string };

// Color tone per bed.status. The Tailwind class drives both the swatch
// and the bed tile so the legend can never drift from the tiles.
const TONES: Record<string, { cls: string; label: string }> = {
  occupied: { cls: "bg-emerald-500/20 border-emerald-500/60 text-emerald-700 dark:text-emerald-300", label: "Occupied" },
  empty: { cls: "bg-slate-400/10 border-slate-400/40 text-slate-600 dark:text-slate-300", label: "Empty" },
  reserved: { cls: "bg-sky-500/20 border-sky-500/60 text-sky-700 dark:text-sky-300", label: "Reserved" },
  maintenance: { cls: "bg-amber-500/20 border-amber-500/60 text-amber-700 dark:text-amber-300", label: "Maintenance" },
  blocked: { cls: "bg-rose-500/20 border-rose-500/60 text-rose-700 dark:text-rose-300", label: "Blocked" },
};
const DEFAULT_TONE = TONES.empty;

const ROOM_BADGE: Record<string, { cls: string; label: string }> = {
  empty: { cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300", label: "empty" },
  partially_occupied: { cls: "bg-sky-500/10 text-sky-600 dark:text-sky-300", label: "partial" },
  full: { cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300", label: "full" },
  maintenance: { cls: "bg-amber-500/10 text-amber-600 dark:text-amber-300", label: "maintenance" },
  blocked: { cls: "bg-rose-500/10 text-rose-600 dark:text-rose-300", label: "blocked" },
};

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

function RoomCard({ room, onSelectBed }: { room: Room; onSelectBed: (b: FloorPlanBed, r: Room) => void }) {
  const badge = ROOM_BADGE[room.occupancy_status] ?? ROOM_BADGE.empty;
  const counts = room.bed_counts;
  return (
    <div className="glass rounded-lg p-3 space-y-2 print:break-inside-avoid">
      <div className="flex items-center justify-between text-xs">
        <div className="font-medium">Room {room.room_number}</div>
        <div className="flex items-center gap-2">
          <span className={"rounded-full px-2 py-0.5 text-[10px] " + badge.cls}>{badge.label}</span>
          <span className="text-muted-foreground">
            {room.beds.length}/{room.capacity ?? "?"}
          </span>
        </div>
      </div>
      {counts && (
        <div className="text-[10px] text-muted-foreground flex gap-2 flex-wrap">
          {counts.occupied > 0 && <span>{counts.occupied} occ</span>}
          {counts.empty > 0 && <span>{counts.empty} empty</span>}
          {counts.reserved > 0 && <span>{counts.reserved} reserved</span>}
          {counts.maintenance > 0 && <span>{counts.maintenance} maint</span>}
          {counts.blocked > 0 && <span>{counts.blocked} blocked</span>}
        </div>
      )}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {room.beds.length === 0 ? (
          <div className="col-span-full text-[10px] text-muted-foreground italic">No beds defined</div>
        ) : (
          room.beds.map((b) => <BedTile key={b.id} bed={b} onSelect={(bed) => onSelectBed(bed, room)} />)
        )}
      </div>
    </div>
  );
}

export default function FloorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = useRouteParams(params);
  const qc = useQueryClient();
  const [active, setActive] = useState<{ bed: FloorPlanBed; room: FloorPlanRoom } | null>(null);

  useEvents("occupancy", () => {
    qc.invalidateQueries({ queryKey: ["properties", "structure", id] });
  });

  const propQ = useQuery({
    queryKey: ["properties", "detail", id],
    queryFn: async () => (await api.get(`/properties/${id}`)).data.data as Property,
    enabled: Boolean(id),
  });

  const structureQ = useQuery({
    queryKey: ["properties", "structure", id],
    queryFn: async () => (await api.get(`/properties/${id}/structure`)).data.data as Floor[],
    enabled: Boolean(id),
  });

  const onSelectBed = (bed: FloorPlanBed, room: Room) => {
    setActive({ bed, room });
  };

  const onChanged = () => {
    qc.invalidateQueries({ queryKey: ["properties", "structure", id] });
  };

  const printedOn = new Date().toLocaleString();

  return (
    <div className="floorplan-print-root space-y-6 animate-fade-in print:space-y-3">
      <div className="print:hidden">
        <Link href={`/properties/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to property
        </Link>
      </div>
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
            Floor plan
            {propQ.data && <span className="text-muted-foreground"> · {propQ.data.name}</span>}
          </h1>
          <p className="text-sm text-muted-foreground print:hidden">
            Hover a bed for occupant details; click to assign, view or take it out of service.
          </p>
          <p className="hidden print:block text-xs text-black/70 mt-1">
            Generated {printedOn}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          {Object.entries(TONES).map(([k, t]) => (
            <div key={k} className={"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 " + t.cls}>
              <span className="h-2 w-2 rounded-sm bg-current opacity-70" />
              {t.label}
            </div>
          ))}
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print floor plan"
            className="print:hidden inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 py-1 text-xs hover:bg-accent"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
        </div>
      </div>

      {structureQ.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      )}
      {structureQ.isError && (
        <ErrorState
          title="Couldn't load the floor plan"
          message="The structure request failed. Check your connection and try again."
          onRetry={() => structureQ.refetch()}
        />
      )}
      {structureQ.data && structureQ.data.length === 0 && (
        <EmptyState
          title="No floors defined yet"
          hint="Add floors and rooms to this property to see them here."
        />
      )}
      {structureQ.data && structureQ.data.map((f) => (
        <section
          key={f.id}
          className="floorplan-page space-y-3 print:break-inside-avoid"
        >
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-medium">Floor {f.floor_number}</h2>
            <div className="text-xs text-muted-foreground">
              {f.rooms.length} room{f.rooms.length === 1 ? "" : "s"}
              {" · "}
              {f.rooms.reduce((s, r) => s + r.beds.length, 0)} beds
            </div>
          </div>
          {f.rooms.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No rooms on this floor.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 print:grid-cols-2">
              {f.rooms.map((r) => <RoomCard key={r.id} room={r} onSelectBed={onSelectBed} />)}
            </div>
          )}
        </section>
      ))}

      <BedActionModal
        open={Boolean(active)}
        bed={active?.bed ?? null}
        room={active?.room ?? null}
        onClose={() => setActive(null)}
        onChanged={onChanged}
      />
    </div>
  );
}

// Print styles for this page live in src/app/globals.css under
// `@media print`. They key off the `.floorplan-page` class added to each
// floor section and the `.floorplan-print-root` class on the outer
// wrapper, so nothing leaks into the rest of the app.
