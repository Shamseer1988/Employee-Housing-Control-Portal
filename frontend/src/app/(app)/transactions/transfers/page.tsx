"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";

type Transfer = {
  id: number;
  transaction_number: string;
  transfer_date: string;
  reason: string | null;
  employee: { id: number; code: string; full_name: string } | null;
  from_bed: { id: number; bed_code: string } | null;
  to_bed: { id: number; bed_code: string } | null;
};

export default function TransfersListPage() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/transfers");
        setRows(r.data.data);
      } finally {
        setLoading(false);
      }
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
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Transfers</h1>
            <p className="text-sm text-muted-foreground">Bed / room / property changes. Old bed empties, new bed occupies.</p>
          </div>
          <Can perm="transfer.create">
            <Link href="/transactions/transfers/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New transfer
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
              <th className="py-2 px-3">From bed</th>
              <th className="py-2 px-3"></th>
              <th className="py-2 px-3">To bed</th>
              <th className="py-2 px-3">Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No transfers yet</td></tr>
            : rows.map((t) => (
              <tr key={t.id} className="border-b border-border/60 hover:bg-accent/30">
                <td className="py-2 px-3 font-mono text-xs">{t.transaction_number}</td>
                <td className="py-2 px-3 font-mono text-xs">{t.transfer_date}</td>
                <td className="py-2 px-3 font-medium">
                  {t.employee && <Link href={`/employees/${t.employee.id}`} className="hover:text-primary">{t.employee.full_name}</Link>}
                </td>
                <td className="py-2 px-3 font-mono text-xs">{t.from_bed?.bed_code ?? "—"}</td>
                <td className="py-2 px-3"><ArrowRight className="h-3 w-3 text-muted-foreground" /></td>
                <td className="py-2 px-3 font-mono text-xs">{t.to_bed?.bed_code ?? "—"}</td>
                <td className="py-2 px-3 text-muted-foreground">{t.reason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
