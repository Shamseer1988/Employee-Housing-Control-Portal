"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";

type Renewal = {
  id: number;
  transaction_number: string;
  renewal_date: string;
  old_expiry_date: string | null;
  new_start_date: string;
  new_expiry_date: string;
  old_monthly_rent: number | null;
  new_monthly_rent: number | null;
  property: { id: number; code: string; name: string } | null;
  landlord: { id: number; code: string; name: string } | null;
};

export default function RenewalsListPage() {
  const [rows, setRows] = useState<Renewal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/renewals");
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
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Landlord agreement renewals</h1>
            <p className="text-sm text-muted-foreground">Each renewal archives the previous active agreement and starts a new one.</p>
          </div>
          <Can perm="renewal.create">
            <Link href="/transactions/renewals/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New renewal
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
              <th className="py-2 px-3">Property</th>
              <th className="py-2 px-3">Landlord</th>
              <th className="py-2 px-3">Old expiry</th>
              <th className="py-2 px-3">New start</th>
              <th className="py-2 px-3">New expiry</th>
              <th className="py-2 px-3">Old rent</th>
              <th className="py-2 px-3">New rent</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">No renewals yet</td></tr>
            : rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                <td className="py-2 px-3 font-mono text-xs">{r.transaction_number}</td>
                <td className="py-2 px-3 font-mono text-xs">{r.renewal_date}</td>
                <td className="py-2 px-3 font-medium">
                  {r.property && <Link href={`/properties/${r.property.id}`} className="hover:text-primary">{r.property.name}</Link>}
                </td>
                <td className="py-2 px-3">{r.landlord?.name ?? "—"}</td>
                <td className="py-2 px-3 font-mono text-xs">{r.old_expiry_date ?? "—"}</td>
                <td className="py-2 px-3 font-mono text-xs">{r.new_start_date}</td>
                <td className="py-2 px-3 font-mono text-xs">{r.new_expiry_date}</td>
                <td className="py-2 px-3">{r.old_monthly_rent?.toLocaleString() ?? "—"}</td>
                <td className="py-2 px-3 font-medium">{r.new_monthly_rent?.toLocaleString() ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
