"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Building2, BedDouble } from "lucide-react";
import { api } from "@/lib/api";
import { Skeleton, EmptyState } from "@/components/ui/states";

type Property = {
  id: number;
  code: string;
  name: string;
  city: string | null;
  area: string | null;
  status: string;
  property_type: string;
  total_floors: number | null;
  total_rooms: number | null;
};

type BedSummary = {
  total?: number;
  empty?: number;
  occupied?: number;
  reserved?: number;
  maintenance?: number;
  blocked?: number;
  occupancy_percent?: number;
};

type RoomSummary = {
  total?: number;
  empty?: number;
  partially_occupied?: number;
  full?: number;
  maintenance?: number;
  blocked?: number;
};

type Summary = Record<number, { beds?: BedSummary; rooms?: RoomSummary } | null>;

const n = (x: unknown): number => (typeof x === "number" && !Number.isNaN(x) ? x : 0);

export default function RoomsOverviewPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const props = (await api.get("/properties")).data?.data as Property[] | undefined;
        const list = Array.isArray(props) ? props : [];
        setProperties(list);
        const entries = await Promise.all(
          list.map(async (p) => {
            try {
              const r = await api.get(`/properties/${p.id}/occupancy`);
              return [p.id, r.data?.data ?? null] as const;
            } catch {
              return [p.id, null] as const;
            }
          }),
        );
        const s: Summary = {};
        for (const [id, data] of entries) s[id] = data;
        setSummary(s);
      } catch {
        setProperties([]);
        setSummary({});
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totals = useMemo(() => {
    return Object.values(summary).reduce(
      (acc, s) => {
        if (!s) return acc;
        const b = s.beds ?? {};
        const r = s.rooms ?? {};
        acc.beds += n(b.total);
        acc.occupied += n(b.occupied);
        acc.empty += n(b.empty);
        acc.maintenance += n(b.maintenance);
        acc.rooms += n(r.total);
        return acc;
      },
      { beds: 0, occupied: 0, empty: 0, maintenance: 0, rooms: 0 },
    );
  }, [summary]);

  const overallPct = totals.beds ? Math.round((totals.occupied * 1000) / totals.beds) / 10 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Rooms &amp; Beds</h1>
        <p className="text-sm text-muted-foreground">Occupancy overview across all properties. Tap into a property to manage rooms and beds.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Total beds" value={loading ? "…" : totals.beds} />
        <Tile label="Occupied" value={loading ? "…" : totals.occupied} tone="emerald" />
        <Tile label="Empty" value={loading ? "…" : totals.empty} />
        <Tile label="Maintenance" value={loading ? "…" : totals.maintenance} tone="amber" />
        <Tile label="Occupancy" value={loading ? "…" : `${overallPct}%`} tone="primary" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 space-y-3">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-2 w-full" />
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, j) => <Skeleton key={j} className="h-10" />)}
            </div>
          </div>
        ))}
        {!loading && properties.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={Building2}
              title="No properties yet"
              hint="Create your first property to start tracking rooms and beds."
            />
          </div>
        )}
        {!loading && properties.map((p) => {
          const s = summary[p.id];
          const pct = n(s?.beds?.occupancy_percent);
          const total = n(s?.beds?.total);
          return (
            <Link key={p.id} href={`/properties/${p.id}`} className="glass rounded-xl p-4 hover:bg-accent/30 transition-colors block">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{p.code}</div>
                  </div>
                </div>
                <BedDouble className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>

              {total > 0 ? (
                <>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Occupancy</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-emerald-500" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    <Mini label="Beds" value={total} />
                    <Mini label="Occ" value={n(s?.beds?.occupied)} />
                    <Mini label="Empty" value={n(s?.beds?.empty)} />
                    <Mini label="Maint" value={n(s?.beds?.maintenance)} />
                  </div>
                </>
              ) : (
                <div className="mt-3 text-xs text-muted-foreground">No rooms or beds yet. Open the property to add some.</div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: "emerald" | "amber" | "primary" }) {
  const toneCls = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "primary" ? "text-primary" : "";
  return (
    <div className="glass rounded-xl p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={"text-2xl font-semibold " + toneCls}>{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-card/60 border border-border py-1">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
