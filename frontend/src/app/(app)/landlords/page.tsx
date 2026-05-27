"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { Modal, Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";

type Landlord = {
  id: number;
  code: string;
  name: string;
  qid_cr_number: string | null;
  mobile: string | null;
  email: string | null;
  contact_person: string | null;
  bank_name: string | null;
  iban: string | null;
  address: string | null;
  status: string;
};

export default function LandlordsPage() {
  const [rows, setRows] = useState<Landlord[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Landlord | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get("/landlords", { params: q ? { q } : {} });
      setRows(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Landlords</h1>
          <p className="text-sm text-muted-foreground">Property owners and their banking / contact details.</p>
        </div>
        <Can perm="landlord.create">
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New landlord
          </button>
        </Can>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search by code, name, QID/CR, mobile…"
            className="h-9 w-full max-w-sm rounded-md border border-input bg-card/60 px-3 text-sm"
          />
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">Search</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">QID/CR</th>
                <th className="py-2 pr-4">Mobile</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Bank</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No landlords yet</td></tr>
              : rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 pr-4 font-mono text-xs">{r.code}</td>
                  <td className="py-2 pr-4 font-medium">{r.name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{r.qid_cr_number ?? "—"}</td>
                  <td className="py-2 pr-4">{r.mobile ?? "—"}</td>
                  <td className="py-2 pr-4">{r.email ?? "—"}</td>
                  <td className="py-2 pr-4">{r.bank_name ?? "—"}</td>
                  <td className="py-2 pr-4 text-right">
                    <Can perm="landlord.edit">
                      <button onClick={() => { setEditing(r); setShowForm(true); }} className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent">
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

      <LandlordDialog open={showForm} editing={editing}
        onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); }}
      />
    </div>
  );
}

function LandlordDialog({ open, editing, onClose, onSaved }: {
  open: boolean; editing: Landlord | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Landlord & { remarks?: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setForm(editing ?? { status: "active" }); setError(null); }, [editing, open]);

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (editing) await api.put(`/landlords/${editing.id}`, form);
      else await api.post("/landlords", form);
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Save failed");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit landlord" : "New landlord"} size="lg">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input required className={inputClass} value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="QID / CR"><input className={inputClass} value={form.qid_cr_number ?? ""} onChange={(e) => set("qid_cr_number", e.target.value)} /></Field>
          <Field label="Mobile"><input className={inputClass} value={form.mobile ?? ""} onChange={(e) => set("mobile", e.target.value)} /></Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Contact person"><input className={inputClass} value={form.contact_person ?? ""} onChange={(e) => set("contact_person", e.target.value)} /></Field>
          <Field label="Bank"><input className={inputClass} value={form.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} /></Field>
          <Field label="IBAN" span={2}><input className={inputClass} value={form.iban ?? ""} onChange={(e) => set("iban", e.target.value)} /></Field>
          <Field label="Address" span={2}><textarea className={textareaClass} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
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
