"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Building2, BedDouble, Users, AlertTriangle, CheckCircle2,
  Wrench, Plane, Clock, FileText, ArrowRightLeft, FileX, RefreshCcw,
} from "lucide-react";
import { Skeleton } from "@/components/ui/states";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { useEvents } from "@/lib/use-events";

type Summary = {
  properties: { total: number; active: number; maintenance: number; agreements_active: number; floors: number };
  beds: { total: number; empty: number; occupied: number; reserved: number; maintenance: number; blocked: number; occupancy_percent: number };
  rooms: { total: number; empty: number; partially_occupied: number; full: number; maintenance: number };
  employees: { total: number; assigned: number; not_assigned_needing: number; on_vacation: number; by_status: Record<string, number> };
  agreements: { expiry_buckets: Record<string, number> };
  maintenance: { in_progress: number; completed: number; cancelled: number };
};

type OccupancyByProperty = {
  property_id: number; code: string; name: string;
  total: number; occupied: number; empty: number; reserved: number; maintenance: number;
  occupancy_percent: number;
};

type MonthlyRow = { month: string; assignments: number; transfers: number; cancellations: number; vacations: number };

type ActivityRow = {
  type: "assignment" | "transfer" | "cancellation" | "vacation" | "renewal" | "maintenance";
  transaction_number: string | null;
  created_at: string;
  employee?: { id: number; full_name: string };
  property?: { id: number; name: string };
  bed_code?: string;
  from_bed_code?: string;
  to_bed_code?: string;
  reason?: string;
  status?: string;
  entity_type?: string;
};

const BED_STATUS_COLORS: Record<string, string> = {
  occupied: "#10b981",
  empty: "#94a3b8",
  reserved: "#0ea5e9",
  maintenance: "#f59e0b",
  blocked: "#f43f5e",
};

const ACTIVITY_ICON: Record<ActivityRow["type"], typeof BedDouble> = {
  assignment: BedDouble,
  transfer: ArrowRightLeft,
  cancellation: FileX,
  vacation: Plane,
  renewal: RefreshCcw,
  maintenance: Wrench,
};

export default function DashboardPage() {
  const qc = useQueryClient();

  // Phase 8a: any occupancy change anywhere in the app (an assignment
  // posted in another tab, another operator transferring a bed)
  // invalidates the dashboard panels so they refetch on the next render.
  useEvents("occupancy", () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["properties"] });
  });

  // One useQuery per panel so a failure on one chart doesn't blank the
  // others. Query keys live in lib/query-keys.ts so mutations elsewhere
  // can invalidate them precisely.
  const summaryQuery = useQuery({
    queryKey: keys.dashboard.summary(),
    queryFn: async () => (await api.get("/dashboard/summary")).data.data as Summary,
  });
  const byPropertyQuery = useQuery({
    queryKey: keys.dashboard.byProperty(),
    queryFn: async () =>
      (await api.get("/dashboard/charts/occupancy-by-property")).data.data as OccupancyByProperty[],
  });
  const monthlyQuery = useQuery({
    queryKey: keys.dashboard.monthly(),
    queryFn: async () =>
      (await api.get("/dashboard/charts/monthly-movement", { params: { months: 6 } }))
        .data.data as MonthlyRow[],
  });
  const activityQuery = useQuery({
    queryKey: keys.dashboard.activity(),
    queryFn: async () =>
      (await api.get("/dashboard/activity", { params: { limit: 12 } })).data.data as ActivityRow[],
  });

  const summary = summaryQuery.data ?? null;
  const byProperty = byPropertyQuery.data ?? [];
  const monthly = monthlyQuery.data ?? [];
  const activity = activityQuery.data ?? [];
  // "loading" gates the initial skeleton: only the summary panel
  // really blocks the layout. The other panels fall through with
  // empty arrays + per-panel spinners.
  const loading = summaryQuery.isLoading;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-7 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="glass rounded-xl p-4 lg:col-span-2 h-72"><Skeleton className="h-full w-full" /></div>
          <div className="glass rounded-xl p-4 h-72"><Skeleton className="h-full w-full" /></div>
        </div>
      </div>
    );
  }

  // Fall-through after loading: render with whatever loaded; show a
  // banner if summary itself failed so the user knows there's a problem
  // instead of staring at empty cards.
  if (!summary) {
    return (
      <div className="glass rounded-xl p-10 text-center border border-destructive/30 bg-destructive/5 space-y-2">
        <div className="font-medium text-destructive">Dashboard data couldn&apos;t be loaded.</div>
        <div className="text-xs text-muted-foreground">The summary API didn&apos;t respond. Check the browser DevTools network tab for details, then refresh.</div>
        <button onClick={() => window.location.reload()} className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs hover:bg-accent">
          Refresh
        </button>
      </div>
    );
  }

  const expiryTotal = Object.entries(summary.agreements.expiry_buckets)
    .filter(([k]) => k !== "safe")
    .reduce((acc, [, v]) => acc + (v ?? 0), 0);

  const bedPie = [
    { name: "Occupied", value: summary.beds.occupied, key: "occupied" },
    { name: "Empty", value: summary.beds.empty, key: "empty" },
    { name: "Reserved", value: summary.beds.reserved, key: "reserved" },
    { name: "Maintenance", value: summary.beds.maintenance, key: "maintenance" },
    { name: "Blocked", value: summary.beds.blocked, key: "blocked" },
  ].filter((s) => s.value > 0);

  const propertyBars = byProperty.slice(0, 10).map((p) => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + "…" : p.name,
    occupied: p.occupied,
    empty: p.empty,
    maintenance: p.maintenance,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live view of accommodation across the group.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Generated {new Date().toLocaleTimeString()}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3">
        <Card label="Properties" value={summary.properties.total} sub={`${summary.properties.active} active`} icon={Building2} accent="from-blue-500 to-indigo-500" href="/properties" />
        <Card label="Total beds" value={summary.beds.total} sub={`${summary.beds.occupancy_percent}% occupancy`} icon={BedDouble} accent="from-emerald-500 to-teal-500" href="/rooms" />
        <Card label="Occupied" value={summary.beds.occupied} sub={`${summary.beds.empty} empty`} icon={CheckCircle2} accent="from-green-500 to-emerald-600" tone="emerald" />
        <Card label="Employees assigned" value={summary.employees.assigned} sub={`${summary.employees.not_assigned_needing} pending`} icon={Users} accent="from-violet-500 to-purple-600" href="/employees" />
        <Card label="On vacation" value={summary.employees.on_vacation} sub="employees away" icon={Plane} accent="from-sky-500 to-cyan-600" tone="sky" href="/transactions/vacations" />
        <Card label="Maintenance" value={summary.maintenance.in_progress} sub="in progress" icon={Wrench} accent="from-amber-500 to-orange-500" tone="amber" href="/transactions/maintenance" />
        <Card label="Agreements" value={summary.properties.agreements_active} sub={`${expiryTotal} expiring/expired`} icon={FileText} accent="from-rose-500 to-pink-600" tone={expiryTotal > 0 ? "rose" : undefined} href="/transactions/renewals" />
        <Card label="Pending" value={summary.employees.not_assigned_needing} sub="need accommodation" icon={AlertTriangle} accent="from-red-500 to-rose-600" tone={summary.employees.not_assigned_needing > 0 ? "amber" : undefined} href="/employees?accommodation=yes" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4 lg:col-span-2 min-h-[280px]">
          <h2 className="text-sm font-semibold mb-2">Occupancy by property</h2>
          {propertyBars.length === 0 ? (
            <div className="h-56 grid place-items-center text-sm text-muted-foreground">No data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={propertyBars} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="occupied" stackId="a" fill={BED_STATUS_COLORS.occupied} />
                <Bar dataKey="empty" stackId="a" fill={BED_STATUS_COLORS.empty} />
                <Bar dataKey="maintenance" stackId="a" fill={BED_STATUS_COLORS.maintenance} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-xl p-4 min-h-[280px]">
          <h2 className="text-sm font-semibold mb-2">Bed status</h2>
          {bedPie.length === 0 ? (
            <div className="h-56 grid place-items-center text-sm text-muted-foreground">No beds yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={bedPie} dataKey="value" innerRadius={50} outerRadius={84} paddingAngle={2}>
                  {bedPie.map((s) => <Cell key={s.key} fill={BED_STATUS_COLORS[s.key]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4 lg:col-span-2 min-h-[260px]">
          <h2 className="text-sm font-semibold mb-2">Monthly movement</h2>
          {monthly.length === 0 ? (
            <div className="h-56 grid place-items-center text-sm text-muted-foreground">No movement yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthly} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="assignments" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="transfers" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="cancellations" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="vacations" stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass rounded-xl p-4 min-h-[260px]">
          <h2 className="text-sm font-semibold mb-3">Recent activity</h2>
          {activity.length === 0 ? (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          ) : (
            <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {activity.map((row, i) => {
                const Icon = ACTIVITY_ICON[row.type];
                return (
                  <li key={`${row.type}-${i}`} className="flex items-start gap-2 text-sm">
                    <div className="h-7 w-7 rounded-md bg-card/60 border border-border grid place-items-center shrink-0">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground flex items-baseline gap-2">
                        <span className="uppercase tracking-wide">{row.type}</span>
                        <span className="font-mono">{row.transaction_number}</span>
                      </div>
                      <div className="truncate">
                        {row.employee && <Link href={`/employees/${row.employee.id}`} className="font-medium hover:text-primary">{row.employee.full_name}</Link>}
                        {row.bed_code && <> → <span className="font-mono text-xs">{row.bed_code}</span></>}
                        {row.from_bed_code && row.to_bed_code && <> <span className="font-mono text-xs">{row.from_bed_code}</span> → <span className="font-mono text-xs">{row.to_bed_code}</span></>}
                        {row.reason && <span className="text-muted-foreground"> · {row.reason.replaceAll("_", " ")}</span>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  label, value, sub, icon: Icon, accent, tone, href,
}: {
  label: string; value: number | string; sub?: string;
  icon: typeof BedDouble; accent: string;
  tone?: "emerald" | "amber" | "rose" | "sky";
  href?: string;
}) {
  const toneCls =
    tone === "emerald" ? "text-emerald-600" :
    tone === "amber" ? "text-amber-600" :
    tone === "rose" ? "text-rose-600" :
    tone === "sky" ? "text-sky-600" : "";
  const className = "glass rounded-xl p-4 relative overflow-hidden block transition-colors " + (href ? "hover:bg-accent/30 hover:-translate-y-0.5 cursor-pointer" : "");
  const inner = (
    <>
      <div className={`absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br ${accent} opacity-20 blur-2xl pointer-events-none`} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={"mt-2 text-2xl font-semibold " + toneCls}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </>
  );
  if (href) return <Link href={href} className={className}>{inner}</Link>;
  return <div className={className}>{inner}</div>;
}

