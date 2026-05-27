"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, CheckCircle2, X } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { selectClass } from "@/components/ui/dialog";

type MaintenanceRow = {
  id: number;
  transaction_number: string;
  entity_type: string;
  entity_id: number;
  start_date: string;
  expected_end_date: string | null;
  actual_end_date: string | null;
  reason: string | null;
  status: string;
  prior_status: string;
  remarks: string | null;
  property: { id: number; code: string; name: string } | null;
};

const STATUS_TONE: Record<string, string> = {
  in_progress: "bg-amber-500/10 text-amber-600",
  completed: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground",
};

export default function MaintenanceListPage() {
  const [rows, setRows] = useState<MaintenanceRow[]>([]);
  const [entityType, setEntityType] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (entityType) params.entity_type = entityType;
      if (status) params.status = status;
      const r = await api.get("/maintenance", { params });
      setRows(r.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const complete = async (rec: MaintenanceRow) => {
    if (!confirm(`Complete maintenance ${rec.transaction_number}?`)) return;
    try {
      await api.post(`/maintenance/${rec.id}/complete`, { actual_end_date: new Date().toISOString().slice(0, 10) });
      await load();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed");
    }
  };

  const cancel = async (rec: MaintenanceRow) => {
    if (!confirm(`Cancel maintenance ${rec.transaction_number}? The entity status will NOT be restored — only use this for mistaken records.`)) return;
    try {
      await api.post(`/maintenance/${rec.id}/cancel`, {});
      await load();
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to transactions
        </Link>
        <div className="mt-2 flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Maintenance</h1>
            <p className="text-sm text-muted-foreground">Property / room / bed maintenance with prior-status restore on completion.</p>
          </div>
          <Can perm="maintenance.manage">
            <Link href="/transactions/maintenance/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New maintenance
            </Link>
          </Can>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select className={selectClass + " w-auto"} value={entityType} onChange={(e) => setEntityType(e.target.value)}>
            <option value="">All targets</option>
            <option value="property">Property</option>
            <option value="room">Room</option>
            <option value="bed">Bed</option>
          </select>
          <select className={selectClass + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">Filter</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 px-3">Txn #</th>
                <th className="py-2 px-3">Target</th>
                <th className="py-2 px-3">Property</th>
                <th className="py-2 px-3">Reason</th>
                <th className="py-2 px-3">Start</th>
                <th className="py-2 px-3">Expected end</th>
                <th className="py-2 px-3">Actual end</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No maintenance records yet</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 px-3 font-mono text-xs">{r.transaction_number}</td>
                  <td className="py-2 px-3 capitalize">{r.entity_type} #{r.entity_id}</td>
                  <td className="py-2 px-3">{r.property ? <Link href={`/properties/${r.property.id}`} className="hover:text-primary">{r.property.name}</Link> : "—"}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{r.start_date}</td>
                  <td className="py-2 px-3 font-mono text-xs">{r.expected_end_date ?? "—"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{r.actual_end_date ?? "—"}</td>
                  <td className="py-2 px-3"><span className={"rounded-full px-2 py-0.5 text-xs " + (STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground")}>{r.status.replaceAll("_", " ")}</span></td>
                  <td className="py-2 px-3 text-right">
                    {r.status === "in_progress" && (
                      <Can perm="maintenance.manage">
                        <button onClick={() => complete(r)} className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-emerald-500/10 text-emerald-600 mr-1">
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </button>
                        <button onClick={() => cancel(r)} className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-destructive/10 text-destructive">
                          <X className="h-3 w-3" /> Cancel
                        </button>
                      </Can>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
