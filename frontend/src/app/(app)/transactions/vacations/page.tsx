"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Plane, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { selectClass } from "@/components/ui/dialog";

type Vacation = {
  id: number;
  transaction_number: string;
  vacation_start_date: string;
  vacation_end_date: string | null;
  return_date: string | null;
  keep_bed_reserved: boolean;
  status: string;
  remarks: string | null;
  employee: { id: number; code: string; full_name: string } | null;
  bed: { id: number; bed_code: string } | null;
};

const STATUS_TONE: Record<string, string> = {
  on_vacation: "bg-sky-500/10 text-sky-600",
  returned: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground",
};

export default function VacationsListPage() {
  const [rows, setRows] = useState<Vacation[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const r = await api.get("/vacations", { params });
      setRows(r.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const markReturned = async (v: Vacation) => {
    const date = prompt("Return date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
    if (!date) return;
    try {
      await api.post(`/vacations/${v.id}/return`, { return_date: date });
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
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Vacations</h1>
            <p className="text-sm text-muted-foreground">Track employees on leave. Optionally hold the bed.</p>
          </div>
          <Can perm="vacation.create">
            <Link href="/transactions/vacations/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Record vacation
            </Link>
          </Can>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select className={selectClass + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="on_vacation">On vacation</option>
            <option value="returned">Returned</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">Filter</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 px-3">Txn #</th>
                <th className="py-2 px-3">Employee</th>
                <th className="py-2 px-3">Start</th>
                <th className="py-2 px-3">End</th>
                <th className="py-2 px-3">Bed</th>
                <th className="py-2 px-3">Held?</th>
                <th className="py-2 px-3">Returned</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No vacations yet</td></tr>
              : rows.map((v) => (
                <tr key={v.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 px-3 font-mono text-xs">{v.transaction_number}</td>
                  <td className="py-2 px-3 font-medium">{v.employee && <Link href={`/employees/${v.employee.id}`} className="hover:text-primary">{v.employee.full_name}</Link>}</td>
                  <td className="py-2 px-3 font-mono text-xs">{v.vacation_start_date}</td>
                  <td className="py-2 px-3 font-mono text-xs">{v.vacation_end_date ?? "—"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{v.bed?.bed_code ?? "—"}</td>
                  <td className="py-2 px-3">{v.keep_bed_reserved ? "Reserved" : "Released"}</td>
                  <td className="py-2 px-3 font-mono text-xs">{v.return_date ?? "—"}</td>
                  <td className="py-2 px-3"><span className={"rounded-full px-2 py-0.5 text-xs " + (STATUS_TONE[v.status] ?? "bg-muted text-muted-foreground")}>{v.status.replaceAll("_", " ")}</span></td>
                  <td className="py-2 px-3 text-right">
                    {v.status === "on_vacation" && (
                      <Can perm="vacation.create">
                        <button onClick={() => markReturned(v)} className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-accent">
                          <Undo2 className="h-3 w-3" /> Mark returned
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
