"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Building2, BedDouble } from "lucide-react";
import { api } from "@/lib/api";

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

type Summary = Record<number, {
  beds: { total: number; empty: number; occupied: number; reserved: number; maintenance: number; blocked: number; occupancy_percent: number };
  rooms: { total: number; empty: number; partially_occupied: number; full: number; maintenance: number; blocked: number };
}>;

export default function RoomsOverviewPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const props = (await api.get("/properties")).data.data as Property[];
        setProperties(props);
        const entries = await Promise.all(
          props.map(async (p) => {
            try {
              const r = await api.get(`/properties/${p.id}/occupancy`);
              return [p.id, r.data.data] as const;
            } catch {
              return [p.id, null] as const;
            }
          }),
        );
        const s: Summary = {};
        for (const [id, data] of entries) if (data) s[id] = data;
        setSummary(s);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totals = useMemo(() => {
    return Object.values(summary).reduce(
      (acc, s) => {
        acc.beds += s.beds.total;
        acc.occupied += s.beds.occupied;
        acc.empty += s.beds.empty;
        acc.maintenance += s.beds.maintenance;
        acc.rooms += s.rooms.total;
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
        <p className="text-sm text-muted-foreground">Occupancy overview across all properties. Manage rooms and beds inside each property.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Total beds" value={totals.beds} />
        <Tile label="Occupied" value={totals.occupied} tone="emerald" />
        <Tile label="Empty" value={totals.empty} />
        <Tile label="Maintenance" value={totals.maintenance} tone="amber" />
        <Tile label="Occupancy" value={`${overallPct}%`} tone="primary" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {loading && <div className="col-span-full text-sm text-muted-foreground text-center py-10">Loading…</div>}
        {!loading && properties.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground text-center py-10">No properties yet. <Link href="/properties" className="text-primary underline">Add one</Link>.</div>
        )}
        {properties.map((p) => {
          const s = summary[p.id];
          const pct = s?.beds.occupancy_percent ?? 0;
          return (
            <Link key={p.id} href={`/properties/${p.id}`} className="glass rounded-xl p-4 hover:bg-accent/30 transition-colors block">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                  </div>
                </div>
                <BedDouble className="h-4 w-4 text-muted-foreground" />
              </div>

              {s ? (
                <>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Occupancy</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary to-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    <Mini label="Beds" value={s.beds.total} />
                    <Mini label="Occ" value={s.beds.occupied} />
                    <Mini label="Empty" value={s.beds.empty} />
                    <Mini label="Maint" value={s.beds.maintenance} />
                  </div>
                </>
              ) : (
                <div className="mt-3 text-xs text-muted-foreground">No rooms/beds yet.</div>
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
