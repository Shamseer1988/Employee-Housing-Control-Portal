"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { Modal, Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";

type Division = {
  id: number;
  code: string;
  name: string;
  company_name: string | null;
  division_type: string | null;
  location: string | null;
  manager: string | null;
  staff_count: number | null;
  status: string;
};

const DIV_TYPES = ["retail", "distribution", "services", "head_office", "project", "other"];

export default function DivisionsPage() {
  const [rows, setRows] = useState<Division[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Division | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get("/divisions", { params: q ? { q } : {} });
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
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Divisions</h1>
          <p className="text-sm text-muted-foreground">
            Companies and branches across the group.
          </p>
        </div>
        <Can perm="division.manage">
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New division
          </button>
        </Can>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search by code, name, company…"
            className="h-9 w-full max-w-sm rounded-md border border-input bg-card/60 px-3 text-sm"
          />
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
            Search
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Company</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Manager</th>
                <th className="py-2 pr-4">Staff</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-muted-foreground">No divisions yet</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 pr-4 font-mono text-xs">{r.code}</td>
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4">{r.company_name ?? "—"}</td>
                  <td className="py-2 pr-4 capitalize">{r.division_type?.replace("_", " ") ?? "—"}</td>
                  <td className="py-2 pr-4">{r.manager ?? "—"}</td>
                  <td className="py-2 pr-4">{r.staff_count ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (r.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Can perm="division.manage">
                      <button
                        onClick={() => { setEditing(r); setShowForm(true); }}
                        className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DivisionDialog
        open={showForm}
        editing={editing}
        onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); }}
      />
    </div>
  );
}

function DivisionDialog({ open, editing, onClose, onSaved }: {
  open: boolean; editing: Division | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Division & { cr_number?: string; cost_center_code?: string; contact_number?: string; email?: string; hr_responsible?: string; branch_count?: number; remarks?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(editing ?? { status: "active" });
    setError(null);
  }, [editing, open]);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (editing) await api.put(`/divisions/${editing.id}`, form);
      else await api.post("/divisions", form);
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Save failed");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit division" : "New division"} size="lg">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input required className={inputClass} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Company"><input className={inputClass} value={form.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></Field>
          <Field label="CR Number"><input className={inputClass} value={form.cr_number ?? ""} onChange={(e) => set("cr_number", e.target.value)} /></Field>
          <Field label="Type">
            <select className={selectClass} value={form.division_type ?? ""} onChange={(e) => set("division_type", e.target.value)}>
              <option value="">—</option>
              {DIV_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Location"><input className={inputClass} value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} /></Field>
          <Field label="Branch count"><input type="number" className={inputClass} value={form.branch_count ?? ""} onChange={(e) => set("branch_count", e.target.value ? Number(e.target.value) : undefined)} /></Field>
          <Field label="Staff count"><input type="number" className={inputClass} value={form.staff_count ?? ""} onChange={(e) => set("staff_count", e.target.value ? Number(e.target.value) : undefined)} /></Field>
          <Field label="Manager"><input className={inputClass} value={form.manager ?? ""} onChange={(e) => set("manager", e.target.value)} /></Field>
          <Field label="HR responsible"><input className={inputClass} value={form.hr_responsible ?? ""} onChange={(e) => set("hr_responsible", e.target.value)} /></Field>
          <Field label="Cost center"><input className={inputClass} value={form.cost_center_code ?? ""} onChange={(e) => set("cost_center_code", e.target.value)} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.contact_number ?? ""} onChange={(e) => set("contact_number", e.target.value)} /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Status">
            <select className={selectClass} value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} value={form.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} /></Field>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
