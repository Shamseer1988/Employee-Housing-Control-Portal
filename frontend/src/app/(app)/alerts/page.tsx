"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, AlertOctagon, Info, Wrench, BedDouble, Building2, Users, FileText } from "lucide-react";
import { api } from "@/lib/api";

type ExpiringAgreement = {
  agreement_id: number; property_id: number; property_name: string | null;
  landlord_name: string | null; expiry_date: string; days_left: number; bucket: string;
};
type OverCapacity = { room_id: number; property_id: number; room_number: string; bed_count: number; capacity: number };
type UnassignedEmployee = { id: number; code: string; full_name: string; division: string | null };
type MaintenanceItem = {
  id: number; transaction_number: string; entity_type: string; entity_id: number;
  start_date: string | null; expected_end_date: string | null; reason: string | null;
};

type Alerts = {
  critical: {
    expired_agreements: ExpiringAgreement[];
    expiring_within_7_days: ExpiringAgreement[];
    over_capacity_rooms: OverCapacity[];
  };
  warning: {
    expiring_within_30_days: ExpiringAgreement[];
    unassigned_employees: UnassignedEmployee[];
  };
  info: {
    expiring_within_90_days: ExpiringAgreement[];
    maintenance_in_progress: MaintenanceItem[];
  };
  counts: { critical: number; warning: number; info: number };
  generated_at: string;
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/dashboard/alerts");
        setAlerts(r.data.data);
      } finally { setLoading(false); }
    })();
  }, []);

  if (loading || !alerts) return <div className="text-sm text-muted-foreground animate-pulse">Loading alerts…</div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Alerts</h1>
        <p className="text-sm text-muted-foreground">Expiry, capacity, unassigned employees and active maintenance. Auto-refreshed on page load.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Counter label="Critical" value={alerts.counts.critical} icon={AlertOctagon} tone="rose" />
        <Counter label="Warning" value={alerts.counts.warning} icon={AlertTriangle} tone="amber" />
        <Counter label="Info" value={alerts.counts.info} icon={Info} tone="sky" />
      </div>

      <Section title="Expired agreements" tone="rose" icon={FileText} hidden={alerts.critical.expired_agreements.length === 0}>
        <AgreementList items={alerts.critical.expired_agreements} />
      </Section>
      <Section title="Agreements expiring within 7 days" tone="rose" icon={FileText} hidden={alerts.critical.expiring_within_7_days.length === 0}>
        <AgreementList items={alerts.critical.expiring_within_7_days} />
      </Section>
      <Section title="Rooms over capacity" tone="rose" icon={BedDouble} hidden={alerts.critical.over_capacity_rooms.length === 0}>
        <ul className="text-sm space-y-1">
          {alerts.critical.over_capacity_rooms.map((r) => (
            <li key={r.room_id} className="flex items-center gap-2">
              <Link href={`/properties/${r.property_id}`} className="hover:text-primary">Room {r.room_number}</Link>
              <span className="text-xs text-rose-600">{r.bed_count} / {r.capacity} beds</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Agreements expiring within 30 days" tone="amber" icon={FileText} hidden={alerts.warning.expiring_within_30_days.length === 0}>
        <AgreementList items={alerts.warning.expiring_within_30_days} />
      </Section>
      <Section title="Employees needing accommodation" tone="amber" icon={Users} hidden={alerts.warning.unassigned_employees.length === 0}>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          {alerts.warning.unassigned_employees.map((e) => (
            <li key={e.id} className="flex items-center justify-between rounded-md border border-border bg-card/60 px-3 py-2">
              <Link href={`/employees/${e.id}`} className="hover:text-primary">{e.full_name}</Link>
              <span className="text-xs text-muted-foreground font-mono">{e.code}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Agreements expiring within 90 days" tone="sky" icon={FileText} hidden={alerts.info.expiring_within_90_days.length === 0}>
        <AgreementList items={alerts.info.expiring_within_90_days} />
      </Section>
      <Section title="Active maintenance" tone="sky" icon={Wrench} hidden={alerts.info.maintenance_in_progress.length === 0}>
        <ul className="text-sm space-y-1">
          {alerts.info.maintenance_in_progress.map((m) => (
            <li key={m.id} className="flex items-center gap-2 flex-wrap">
              <Link href="/transactions/maintenance" className="font-mono text-xs hover:text-primary">{m.transaction_number}</Link>
              <span className="text-xs text-muted-foreground capitalize">{m.entity_type} #{m.entity_id}</span>
              {m.reason && <span className="text-xs">· {m.reason}</span>}
              {m.expected_end_date && <span className="text-xs text-muted-foreground">· until {m.expected_end_date}</span>}
            </li>
          ))}
        </ul>
      </Section>

      {alerts.counts.critical + alerts.counts.warning + alerts.counts.info === 0 && (
        <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
          Nothing to act on — everything looks healthy.
        </div>
      )}
    </div>
  );
}

function AgreementList({ items }: { items: ExpiringAgreement[] }) {
  return (
    <ul className="text-sm space-y-1">
      {items.map((a) => (
        <li key={a.agreement_id} className="flex items-center gap-2 flex-wrap">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <Link href={`/properties/${a.property_id}`} className="hover:text-primary">{a.property_name}</Link>
          <span className="text-xs text-muted-foreground">· {a.landlord_name}</span>
          <span className={"text-xs " + (a.days_left < 0 ? "text-rose-600" : a.days_left <= 30 ? "text-amber-600" : "text-muted-foreground")}>
            {a.days_left < 0 ? `expired ${Math.abs(a.days_left)}d ago` : `in ${a.days_left}d`}
          </span>
          <span className="font-mono text-xs">{a.expiry_date}</span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, tone, icon: Icon, hidden, children }: {
  title: string; tone: "rose" | "amber" | "sky"; icon: typeof FileText;
  hidden?: boolean; children: React.ReactNode;
}) {
  if (hidden) return null;
  const cls =
    tone === "rose" ? "border-rose-500/30 bg-rose-500/5" :
    tone === "amber" ? "border-amber-500/30 bg-amber-500/5" :
    "border-sky-500/30 bg-sky-500/5";
  const txt =
    tone === "rose" ? "text-rose-600" :
    tone === "amber" ? "text-amber-600" : "text-sky-600";
  return (
    <div className={"glass rounded-xl border " + cls + " p-4 space-y-2"}>
      <div className={"flex items-center gap-2 text-sm font-medium " + txt}>
        <Icon className="h-4 w-4" /> {title}
      </div>
      {children}
    </div>
  );
}

function Counter({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof AlertOctagon; tone: "rose" | "amber" | "sky";
}) {
  const cls =
    tone === "rose" ? "from-rose-500 to-pink-600 text-rose-600" :
    tone === "amber" ? "from-amber-500 to-orange-500 text-amber-600" :
    "from-sky-500 to-cyan-600 text-sky-600";
  return (
    <div className="glass rounded-xl p-4 relative overflow-hidden">
      <div className={`absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br ${cls.split(" text-")[0]} opacity-20 blur-2xl`} />
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={"h-4 w-4 " + cls.split(" ")[2]} />
      </div>
      <div className={"mt-2 text-3xl font-semibold " + cls.split(" ")[2]}>{value}</div>
    </div>
  );
}
