"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, BedDouble } from "lucide-react";
import { api } from "@/lib/api";
import { useRouteParams } from "@/lib/use-route-params";
import { useEvents } from "@/lib/use-events";
import { Skeleton, ErrorState, EmptyState } from "@/components/ui/states";

type Bed = {
  id: number;
  bed_code: string;
  bed_number: string | null;
  status: string;          // empty | occupied | reserved | maintenance | blocked
  current_employee?: { id: number; full_name: string } | null;
};

type Room = {
  id: number;
  room_number: string;
  capacity: number | null;
  occupancy_status: string;
  beds: Bed[];
};

type Floor = {
  id: number;
  floor_number: string;
  rooms: Room[];
};

type Property = { id: number; code: string; name: string };

// Color tone per bed.status. Map both to a Tailwind background+border
// class and to a legend label so the swatch and bed share one source.
const TONES: Record<string, { cls: string; label: string }> = {
  occupied: { cls: "bg-emerald-500/20 border-emerald-500/60 text-emerald-700 dark:text-emerald-300", label: "Occupied" },
  empty: { cls: "bg-slate-400/10 border-slate-400/40 text-slate-600 dark:text-slate-300", label: "Empty" },
  reserved: { cls: "bg-sky-500/20 border-sky-500/60 text-sky-700 dark:text-sky-300", label: "Reserved" },
  maintenance: { cls: "bg-amber-500/20 border-amber-500/60 text-amber-700 dark:text-amber-300", label: "Maintenance" },
  blocked: { cls: "bg-rose-500/20 border-rose-500/60 text-rose-700 dark:text-rose-300", label: "Blocked" },
};
const DEFAULT_TONE = TONES.empty;

function BedCell({ bed }: { bed: Bed }) {
  const tone = TONES[bed.status] ?? DEFAULT_TONE;
  return (
    <div
      title={`${bed.bed_code} · ${bed.status}${bed.current_employee ? ` · ${bed.current_employee.full_name}` : ""}`}
      className={
        "aspect-square min-w-12 grid place-items-center rounded-md border font-mono text-[10px] " +
        tone.cls
      }
    >
      <BedDouble className="h-3.5 w-3.5 opacity-70" />
      <div>{bed.bed_number ?? bed.bed_code.slice(-3)}</div>
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  return (
    <div className="glass rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <div className="font-medium">Room {room.room_number}</div>
        <div className="text-muted-foreground">
          {room.beds.length}/{room.capacity ?? "?"} beds
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
        {room.beds.length === 0 ? (
          <div className="col-span-full text-[10px] text-muted-foreground italic">No beds defined</div>
        ) : (
          room.beds.map((b) => <BedCell key={b.id} bed={b} />)
        )}
      </div>
    </div>
  );
}

export default function FloorPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = useRouteParams(params);
  const qc = useQueryClient();

  // 8a realtime: any occupancy event triggers a re-fetch of this
  // property's structure. The server filters by property when
  // publishing eventually; for now we invalidate broadly.
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href={`/properties/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to property
        </Link>
        <div className="mt-2 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
              Floor plan
              {propQ.data && <span className="text-muted-foreground"> · {propQ.data.name}</span>}
            </h1>
            <p className="text-sm text-muted-foreground">
              Color-coded occupancy across every bed. Hover for the employee or status detail.
            </p>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            {Object.entries(TONES).map(([k, t]) => (
              <div key={k} className={"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 " + t.cls}>
                <span className="h-2 w-2 rounded-sm bg-current opacity-70" />
                {t.label}
              </div>
            ))}
          </div>
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
        <section key={f.id} className="space-y-3">
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {f.rooms.map((r) => <RoomCard key={r.id} room={r} />)}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
