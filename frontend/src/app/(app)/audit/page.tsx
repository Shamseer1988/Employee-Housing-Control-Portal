"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Row = {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  ip_address: string | null;
  remarks: string | null;
  created_at: string;
};

export default function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: "200" };
      if (module) params.module = module;
      if (action) params.action = action;
      const resp = await api.get("/audit", { params });
      setRows(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Trail of all critical actions across the portal.</p>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <input
            value={module}
            onChange={(e) => setModule(e.target.value)}
            placeholder="module (e.g. user)"
            className="h-9 rounded-md border border-input bg-card/60 px-3 text-sm w-44"
          />
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="action (e.g. login)"
            className="h-9 rounded-md border border-input bg-card/60 px-3 text-sm w-44"
          />
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
            Filter
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Time (UTC)</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Module</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    No log entries
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                    <td className="py-2 pr-4 font-mono text-xs">{r.created_at?.slice(0, 19).replace("T", " ")}</td>
                    <td className="py-2 pr-4">{r.username ?? "—"}</td>
                    <td className="py-2 pr-4">{r.module}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {r.action}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {r.entity_type ? `${r.entity_type}#${r.entity_id ?? "?"}` : "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.ip_address ?? "—"}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.remarks ?? ""}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
