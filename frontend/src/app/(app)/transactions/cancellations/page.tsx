"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";

type Cancellation = {
  id: number;
  transaction_number: string;
  cancellation_date: string;
  reason: string;
  new_employee_status: string | null;
  remarks: string | null;
  employee: { id: number; code: string; full_name: string } | null;
  bed: { id: number; bed_code: string } | null;
};

const REASON_TONE: Record<string, string> = {
  resigned: "bg-muted text-muted-foreground",
  terminated: "bg-rose-500/10 text-rose-600",
  visa_cancelled: "bg-amber-500/10 text-amber-600",
  shifted_outside: "bg-sky-500/10 text-sky-600",
  vacation: "bg-sky-500/10 text-sky-600",
  other: "bg-muted text-muted-foreground",
};

export default function CancellationsListPage() {
  const [rows, setRows] = useState<Cancellation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/cancellations");
        setRows(r.data.data);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to transactions
        </Link>
        <div className="mt-2 flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Cancellations</h1>
            <p className="text-sm text-muted-foreground">Releases the active assignment and empties the bed. Employee status auto-updates for closed reasons.</p>
          </div>
          <Can perm="cancellation.create">
            <Link href="/transactions/cancellations/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New cancellation
            </Link>
          </Can>
        </div>
      </div>
      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 px-3">Txn #</th>
              <th className="py-2 px-3">Date</th>
              <th className="py-2 px-3">Employee</th>
              <th className="py-2 px-3">Bed</th>
              <th className="py-2 px-3">Reason</th>
              <th className="py-2 px-3">New status</th>
              <th className="py-2 px-3">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No cancellations yet</td></tr>
            : rows.map((c) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-accent/30">
                <td className="py-2 px-3 font-mono text-xs">{c.transaction_number}</td>
                <td className="py-2 px-3 font-mono text-xs">{c.cancellation_date}</td>
                <td className="py-2 px-3 font-medium">{c.employee && <Link href={`/employees/${c.employee.id}`} className="hover:text-primary">{c.employee.full_name}</Link>}</td>
                <td className="py-2 px-3 font-mono text-xs">{c.bed?.bed_code ?? "—"}</td>
                <td className="py-2 px-3"><span className={"rounded-full px-2 py-0.5 text-xs " + (REASON_TONE[c.reason] ?? "bg-muted text-muted-foreground")}>{c.reason.replaceAll("_", " ")}</span></td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{c.new_employee_status ?? "—"}</td>
                <td className="py-2 px-3 text-xs text-muted-foreground">{c.remarks ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
