"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { selectClass } from "@/components/ui/dialog";

type Assignment = {
  id: number;
  transaction_number: string;
  assignment_date: string;
  status: string;
  reason: string | null;
  employee: { id: number; code: string; full_name: string; qid_number: string | null } | null;
  property: { id: number; code: string; name: string } | null;
  room: { id: number; room_number: string } | null;
  bed: { id: number; bed_code: string; status: string } | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  cancelled: "bg-muted text-muted-foreground",
  transferred: "bg-amber-500/10 text-amber-600",
};

export default function AssignmentsListPage() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (status) params.status = status;
      const resp = await api.get("/assignments", { params });
      setRows(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to transactions
        </Link>
        <div className="mt-2 flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Room / Bed Assignments</h1>
            <p className="text-sm text-muted-foreground">Every active and historical assignment across all properties.</p>
          </div>
          <Can perm="assignment.create">
            <Link href="/transactions/assignments/new"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New assignment
            </Link>
          </Can>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select className={selectClass + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="transferred">Transferred</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">Filter</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Txn #</th>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Property</th>
                <th className="py-2 pr-4">Room</th>
                <th className="py-2 pr-4">Bed</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No assignments yet</td></tr>
              : rows.map((a) => (
                <tr key={a.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 pr-4 font-mono text-xs">{a.transaction_number}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{a.assignment_date}</td>
                  <td className="py-2 pr-4 font-medium">
                    {a.employee && (
                      <Link href={`/employees/${a.employee.id}`} className="hover:text-primary">{a.employee.full_name}</Link>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {a.property && (
                      <Link href={`/properties/${a.property.id}`} className="hover:text-primary">{a.property.name}</Link>
                    )}
                  </td>
                  <td className="py-2 pr-4">{a.room?.room_number ?? "—"}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{a.bed?.bed_code ?? "—"}</td>
                  <td className="py-2 pr-4">{a.reason ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (STATUS_TONE[a.status] ?? "bg-muted text-muted-foreground")}>
                      {a.status}
                    </span>
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
