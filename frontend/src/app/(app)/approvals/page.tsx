"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, X, Clock, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { selectClass, textareaClass } from "@/components/ui/dialog";

type ApprovalRequest = {
  id: number;
  transaction_number: string;
  module: string;
  entity_type: string;
  entity_id: number;
  entity_reference: string | null;
  requested_at: string;
  status: string;
  decided_by: number | null;
  decided_at: string | null;
  decision_remarks: string | null;
  summary: string | null;
};

const MODULE_TONE: Record<string, string> = {
  assignment: "bg-emerald-500/10 text-emerald-600",
  transfer: "bg-amber-500/10 text-amber-600",
  cancellation: "bg-rose-500/10 text-rose-600",
  renewal: "bg-sky-500/10 text-sky-600",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600",
  approved: "bg-emerald-500/10 text-emerald-600",
  rejected: "bg-muted text-muted-foreground",
};

export default function ApprovalsPage() {
  const [rows, setRows] = useState<ApprovalRequest[]>([]);
  const [status, setStatus] = useState("pending");
  const [module, setModule] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [remarksFor, setRemarksFor] = useState<{ id: number; action: "approve" | "reject" } | null>(null);
  const [remarks, setRemarks] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { status };
      if (module) params.module = module;
      const r = await api.get("/approvals", { params });
      setRows(r.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [status, module]);  // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id: number, action: "approve" | "reject", note?: string) => {
    setBusyId(id);
    try {
      await api.post(`/approvals/${id}/${action}`, { remarks: note || null });
      await load();
      setRemarksFor(null);
      setRemarks("");
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || `${action} failed`);
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Pending transactions waiting for approval. Side effects (bed status, employee allocation, agreement
          archive) only execute after approval.
        </p>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <select className={selectClass + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
          <select className={selectClass + " w-auto"} value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">All modules</option>
            <option value="assignment">Assignment</option>
            <option value="transfer">Transfer</option>
            <option value="cancellation">Cancellation</option>
            <option value="renewal">Renewal</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 px-3">Approval #</th>
                <th className="py-2 px-3">Module</th>
                <th className="py-2 px-3">Transaction</th>
                <th className="py-2 px-3">Summary</th>
                <th className="py-2 px-3">Requested</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Nothing waiting.</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 px-3 font-mono text-xs">{r.transaction_number}</td>
                  <td className="py-2 px-3">
                    <span className={"rounded-full px-2 py-0.5 text-xs capitalize " + (MODULE_TONE[r.module] ?? "bg-muted text-muted-foreground")}>
                      {r.module}
                    </span>
                  </td>
                  <td className="py-2 px-3 font-mono text-xs">{r.entity_reference ?? `${r.entity_type}#${r.entity_id}`}</td>
                  <td className="py-2 px-3">{r.summary ?? "—"}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground font-mono">{r.requested_at.slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2 px-3">
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (STATUS_TONE[r.status] ?? "bg-muted text-muted-foreground")}>
                      {r.status}
                    </span>
                    {r.decision_remarks && <div className="text-[10px] text-muted-foreground mt-0.5 max-w-xs truncate">{r.decision_remarks}</div>}
                  </td>
                  <td className="py-2 px-3 text-right space-x-1">
                    {r.status === "pending" && (
                      <>
                        <Can perm="approval.approve">
                          <button disabled={busyId === r.id}
                            onClick={() => setRemarksFor({ id: r.id, action: "approve" })}
                            className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-emerald-500/10 text-emerald-600 disabled:opacity-60">
                            <CheckCircle2 className="h-3 w-3" /> Approve
                          </button>
                        </Can>
                        <Can perm="approval.reject">
                          <button disabled={busyId === r.id}
                            onClick={() => setRemarksFor({ id: r.id, action: "reject" })}
                            className="inline-flex items-center gap-1 text-xs rounded-md border border-border px-2 py-1 hover:bg-destructive/10 text-destructive disabled:opacity-60">
                            <X className="h-3 w-3" /> Reject
                          </button>
                        </Can>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {remarksFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="glass-strong w-full max-w-md rounded-2xl p-6 space-y-3">
            <div className="text-sm font-semibold capitalize">{remarksFor.action} request</div>
            <textarea className={textareaClass} placeholder="Optional remarks…"
              value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRemarksFor(null); setRemarks(""); }}
                className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
              <button onClick={() => act(remarksFor.id, remarksFor.action, remarks)}
                className={"h-9 rounded-md px-4 text-sm font-medium " +
                  (remarksFor.action === "approve"
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90")}>
                Confirm {remarksFor.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
