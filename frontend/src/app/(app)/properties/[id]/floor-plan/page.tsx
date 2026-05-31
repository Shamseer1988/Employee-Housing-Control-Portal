"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Printer, Layers, DoorClosed, BedDouble, ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { api } from "@/lib/api";
import { useRouteParams } from "@/lib/use-route-params";
import { useEvents } from "@/lib/use-events";
import { Skeleton, ErrorState, EmptyState } from "@/components/ui/states";
import { BedActionModal, type FloorPlanBed, type FloorPlanRoom } from "@/components/floor-plan-bed-modal";
import { BedTile, TONES } from "./bed-tile";

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

const ROOM_BADGE: Record<string, { cls: string; label: string }> = {
  empty: { cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/20", label: "empty" },
  partially_occupied: { cls: "bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-sky-500/30", label: "partial" },
  full: { cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-500/30", label: "full" },
  maintenance: { cls: "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/30", label: "maintenance" },
  blocked: { cls: "bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/30", label: "blocked" },
};

const GENDER_BADGE: Record<string, string> = {
  male: "bg-blue-500/10 text-blue-600 dark:text-blue-300 ring-blue-500/20",
  female: "bg-pink-500/10 text-pink-600 dark:text-pink-300 ring-pink-500/20",
  any: "bg-violet-500/10 text-violet-600 dark:text-violet-300 ring-violet-500/20",
};

function RoomCard({ room, onSelectBed }: { room: Room; onSelectBed: (b: FloorPlanBed, r: Room) => void }) {
  const badge = ROOM_BADGE[room.occupancy_status] ?? ROOM_BADGE.empty;
  const counts = room.bed_counts;
  const total = room.capacity || room.beds.length || 1;
  const occupied = counts?.occupied ?? 0;
  const occupancyPct = Math.round((occupied / total) * 100);
  const gender = (room.allowed_gender || "any").toLowerCase();
  const genderCls = GENDER_BADGE[gender] ?? GENDER_BADGE.any;

  return (
    <div
      className={
        "group relative rounded-xl border border-border/60 bg-card/70 backdrop-blur " +
        "shadow-sm hover:shadow-md transition-shadow overflow-hidden print:break-inside-avoid print:shadow-none"
      }
    >
      {/* Status accent bar */}
      <div
        className={
          "absolute inset-x-0 top-0 h-0.5 " +
          (room.occupancy_status === "full"
            ? "bg-emerald-500/70"
            : room.occupancy_status === "partially_occupied"
            ? "bg-sky-500/70"
            : room.occupancy_status === "maintenance"
            ? "bg-amber-500/70"
            : room.occupancy_status === "blocked"
            ? "bg-rose-500/70"
            : "bg-slate-400/40")
        }
      />
      <div className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid place-items-center h-7 w-7 rounded-lg bg-primary/10 text-primary shrink-0">
              <DoorClosed className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">Room {room.room_number}</div>
              <div className="text-[10px] text-muted-foreground">
                {room.beds.length}/{room.capacity ?? "?"} beds
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={"rounded-full px-2 py-0.5 text-[10px] capitalize ring-1 " + genderCls}>
              {gender}
            </span>
            <span className={"rounded-full px-2 py-0.5 text-[10px] capitalize ring-1 " + badge.cls}>
              {badge.label}
            </span>
          </div>
        </div>

        {/* Tiny occupancy progress bar */}
        <div className="h-1 w-full rounded-full bg-muted/50 overflow-hidden">
          <div
            className={
              "h-full transition-all " +
              (occupancyPct >= 100
                ? "bg-emerald-500/70"
                : occupancyPct > 0
                ? "bg-sky-500/70"
                : "bg-slate-400/40")
            }
            style={{ width: `${Math.max(occupancyPct, 4)}%` }}
          />
        </div>

        {counts && (
          <div className="text-[10px] text-muted-foreground flex gap-2.5 flex-wrap">
            {counts.occupied > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{counts.occupied} occ</span>}
            {counts.empty > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-slate-400" />{counts.empty} empty</span>}
            {counts.reserved > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-500" />{counts.reserved} reserved</span>}
            {counts.maintenance > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{counts.maintenance} maint</span>}
            {counts.blocked > 0 && <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />{counts.blocked} blocked</span>}
          </div>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2 pt-1">
          {room.beds.length === 0 ? (
            <div className="col-span-full text-[10px] text-muted-foreground italic">No beds defined</div>
          ) : (
            room.beds.map((b) => <BedTile key={b.id} bed={b} onSelect={(bed) => onSelectBed(bed, room)} />)
          )}
        </div>
      </div>
    </div>
  );
}

type Totals = {
  beds: number;
  occupied: number;
  empty: number;
  reserved: number;
  maintenance: number;
  blocked: number;
  rooms: number;
  floors: number;
};

function StatCard({
  label, value, sub, tone,
}: { label: string; value: number | string; sub?: string; tone: "primary" | "emerald" | "sky" | "amber" | "rose" | "slate" }) {
  const toneCls = {
    primary: "from-primary/15 to-primary/0 text-primary",
    emerald: "from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400",
    sky: "from-sky-500/15 to-sky-500/0 text-sky-600 dark:text-sky-400",
    amber: "from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400",
    rose: "from-rose-500/15 to-rose-500/0 text-rose-600 dark:text-rose-400",
    slate: "from-slate-500/15 to-slate-500/0 text-slate-600 dark:text-slate-400",
  }[tone];
  return (
    <div className={"rounded-xl border border-border/60 bg-gradient-to-br p-3 " + toneCls}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-semibold leading-tight mt-0.5">{value}</div>
      {sub && <div className="text-[10px] opacity-70 mt-0.5">{sub}</div>}
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

  const totals: Totals | null = useMemo(() => {
    if (!structureQ.data) return null;
    const t: Totals = { beds: 0, occupied: 0, empty: 0, reserved: 0, maintenance: 0, blocked: 0, rooms: 0, floors: 0 };
    t.floors = structureQ.data.length;
    for (const f of structureQ.data) {
      t.rooms += f.rooms.length;
      for (const r of f.rooms) {
        for (const b of r.beds) {
          t.beds += 1;
          if (b.status === "occupied") t.occupied += 1;
          else if (b.status === "empty") t.empty += 1;
          else if (b.status === "reserved") t.reserved += 1;
          else if (b.status === "maintenance") t.maintenance += 1;
          else if (b.status === "blocked") t.blocked += 1;
        }
      }
    }
    return t;
  }, [structureQ.data]);

  // Per-floor collapse state, persisted so refreshing the page doesn't
  // re-expand a long list the operator just tidied up. Keyed by property
  // so two properties don't share state.
  const collapseKey = `pug.floorplan.collapsed.${id}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapseLoaded, setCollapseLoaded] = useState(false);

  useEffect(() => {
    if (!id) return;
    try {
      const raw = window.localStorage.getItem(collapseKey);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
    setCollapseLoaded(true);
  }, [collapseKey, id]);

  useEffect(() => {
    if (!collapseLoaded) return;
    try {
      window.localStorage.setItem(collapseKey, JSON.stringify([...collapsed]));
    } catch { /* ignore */ }
  }, [collapsed, collapseKey, collapseLoaded]);

  const toggleFloor = (floorId: number | string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      const key = String(floorId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const collapseAll = () => {
    if (!structureQ.data) return;
    setCollapsed(new Set(structureQ.data.map((f) => String(f.id))));
  };
  const expandAll = () => setCollapsed(new Set());

  const onSelectBed = (bed: FloorPlanBed, room: Room) => {
    setActive({ bed, room });
  };

  const onChanged = () => {
    qc.invalidateQueries({ queryKey: ["properties", "structure", id] });
  };

  const printedOn = new Date().toLocaleString();
  const occupancyPct = totals && totals.beds > 0 ? Math.round((totals.occupied / totals.beds) * 100) : 0;

  return (
    <div className="floorplan-print-root space-y-5 animate-fade-in print:space-y-3">
      <div className="print:hidden">
        <Link
          href={`/properties/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to property
        </Link>
      </div>

      {/* Hero header card */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card/60 to-card/30 p-5 sm:p-6 backdrop-blur">
        <div className="absolute -top-16 -right-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">
              Floor plan
              {propQ.data && <span className="text-muted-foreground"> · {propQ.data.name}</span>}
            </h1>
            <p className="text-sm text-muted-foreground print:hidden mt-1">
              Hover a bed for occupant details; click to assign, transfer, vacate, or take it out of service.
            </p>
            <p className="hidden print:block text-xs text-black/70 mt-1">Generated {printedOn}</p>
          </div>
          <div className="print:hidden inline-flex items-center gap-1.5">
            {structureQ.data && structureQ.data.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={collapsed.size === structureQ.data.length ? expandAll : collapseAll}
                  aria-label={collapsed.size === structureQ.data.length ? "Expand all floors" : "Collapse all floors"}
                  title={collapsed.size === structureQ.data.length ? "Expand all floors" : "Collapse all floors"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-xs font-medium hover:bg-accent shadow-sm"
                >
                  {collapsed.size === structureQ.data.length ? (
                    <><ChevronsUpDown className="h-3.5 w-3.5" /> Expand all</>
                  ) : (
                    <><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all</>
                  )}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print floor plan"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card/70 px-3 py-1.5 text-xs font-medium hover:bg-accent shadow-sm"
            >
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
          </div>
        </div>

        {/* Stat strip */}
        {totals && (
          <div className="relative grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-5">
            <StatCard label="Occupancy" value={`${occupancyPct}%`} sub={`${totals.occupied}/${totals.beds} beds`} tone="primary" />
            <StatCard label="Floors" value={totals.floors} sub={`${totals.rooms} rooms`} tone="slate" />
            <StatCard label="Occupied" value={totals.occupied} tone="emerald" />
            <StatCard label="Empty" value={totals.empty} tone="slate" />
            <StatCard label="Reserved" value={totals.reserved} tone="sky" />
            <StatCard label="Maintenance" value={totals.maintenance} tone="amber" />
            <StatCard label="Blocked" value={totals.blocked} tone="rose" />
          </div>
        )}

        {/* Legend */}
        <div className="relative flex flex-wrap items-center gap-1.5 mt-5 print:mt-3">
          {Object.entries(TONES).map(([k, t]) => (
            <div
              key={k}
              className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[10px] font-medium"
            >
              <span className={"h-2 w-2 rounded-full " + t.dot} />
              {t.label}
            </div>
          ))}
        </div>
      </div>

      {structureQ.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
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

      {structureQ.data && structureQ.data.map((f) => {
        const floorBeds = f.rooms.reduce((s, r) => s + r.beds.length, 0);
        const floorOcc = f.rooms.reduce(
          (s, r) => s + r.beds.filter((b) => b.status === "occupied").length,
          0,
        );
        // In print mode we always force-expand so PDFs aren't blank.
        const isCollapsed = collapsed.has(String(f.id));
        return (
          <section key={f.id} className="floorplan-page space-y-3 print:break-inside-avoid">
            <button
              type="button"
              onClick={() => toggleFloor(f.id)}
              aria-expanded={!isCollapsed}
              aria-controls={`floor-${f.id}-rooms`}
              className="group w-full flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-accent/40 transition-colors print:hover:bg-transparent print:pointer-events-none"
            >
              <div className="inline-flex items-center gap-2.5 min-w-0">
                <ChevronDown
                  className={
                    "h-4 w-4 text-muted-foreground transition-transform shrink-0 print:hidden " +
                    (isCollapsed ? "-rotate-90" : "rotate-0")
                  }
                  aria-hidden="true"
                />
                <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
                  <Layers className="h-4 w-4" />
                </div>
                <div className="min-w-0 text-left">
                  <h2 className="text-base font-semibold leading-tight truncate">Floor {f.floor_number}</h2>
                  <div className="text-[11px] text-muted-foreground inline-flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <DoorClosed className="h-3 w-3" /> {f.rooms.length} room{f.rooms.length === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BedDouble className="h-3 w-3" /> {floorBeds} beds
                    </span>
                    {floorBeds > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {Math.round((floorOcc / floorBeds) * 100)}% occ
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {isCollapsed && (
                <span className="text-[10px] text-muted-foreground print:hidden shrink-0">
                  click to expand
                </span>
              )}
            </button>

            {(!isCollapsed || true) && (
              // `print:!block` + `hidden` toggle keeps printouts complete
              // even when sections are collapsed on screen.
              <div
                id={`floor-${f.id}-rooms`}
                className={isCollapsed ? "hidden print:block" : "block"}
              >
                {f.rooms.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">No rooms on this floor.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 print:grid-cols-2">
                    {f.rooms.map((r) => (
                      <RoomCard key={r.id} room={r} onSelectBed={onSelectBed} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

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
