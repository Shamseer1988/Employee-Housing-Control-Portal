"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, AlertTriangle, FileText, Upload, Download, Trash2 } from "lucide-react";
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
  address: string | null;
  agreement_start_date: string | null;
  agreement_expiry_date: string | null;
  monthly_rent: number | null;
  reminder_days_before_expiry: number;
  status: string;
  remarks: string | null;
};

type Attachment = {
  id: number;
  category: string | null;
  original_name: string;
  size_bytes: number;
  created_at: string;
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

function expiryTone(dateStr: string | null): string {
  const d = daysUntil(dateStr);
  if (d === null) return "text-muted-foreground";
  if (d < 0) return "text-rose-600";
  if (d <= 30) return "text-amber-600";
  if (d <= 90) return "text-sky-600";
  return "text-emerald-600";
}

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
          <p className="text-sm text-muted-foreground">Property owners with their current agreement, expiry tracking and attached PDFs.</p>
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
            placeholder="Search code, name, QID/CR, mobile…"
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
                <th className="py-2 pr-4">Agreement expiry</th>
                <th className="py-2 pr-4">Monthly rent</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No landlords yet</td></tr>
              : rows.map((r) => {
                  const dleft = daysUntil(r.agreement_expiry_date);
                  return (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-accent/30">
                      <td className="py-2 pr-4 font-mono text-xs">{r.code}</td>
                      <td className="py-2 pr-4 font-medium">{r.name}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{r.qid_cr_number ?? "—"}</td>
                      <td className="py-2 pr-4">{r.mobile ?? "—"}</td>
                      <td className={"py-2 pr-4 " + expiryTone(r.agreement_expiry_date)}>
                        {r.agreement_expiry_date ? (
                          <span className="inline-flex items-center gap-1">
                            {dleft !== null && dleft <= 30 && <AlertTriangle className="h-3 w-3" />}
                            <span className="font-mono text-xs">{r.agreement_expiry_date}</span>
                            {dleft !== null && (
                              <span className="text-xs">({dleft < 0 ? `expired ${Math.abs(dleft)}d ago` : `in ${dleft}d`})</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2 pr-4">{r.monthly_rent != null ? r.monthly_rent.toLocaleString() : "—"}</td>
                      <td className="py-2 pr-4 text-right">
                        <Can perm="landlord.edit">
                          <button
                            onClick={() => { setEditing(r); setShowForm(true); }}
                            aria-label={`Edit ${r.name}`}
                            className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </Can>
                      </td>
                    </tr>
                  );
                })}
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
  const [form, setForm] = useState<Partial<Landlord>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editing ?? {
        status: "active",
        reminder_days_before_expiry: 90,
      } as Partial<Landlord>);
      setError(null);
      setSavedId(editing?.id ?? null);
    }
  }, [editing, open]);

  const set = <K extends keyof Landlord>(k: K, v: Landlord[K] | null | undefined) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const payload = { ...form };
      if (payload.monthly_rent === undefined || payload.monthly_rent === null || (payload.monthly_rent as unknown) === "") {
        payload.monthly_rent = null;
      }
      let id: number;
      if (editing) {
        await api.put(`/landlords/${editing.id}`, payload);
        id = editing.id;
      } else {
        const resp = await api.post("/landlords", payload);
        id = resp.data.data.id;
      }
      setSavedId(id);
      // For brand-new landlord: keep dialog open so the user can upload a PDF
      // For existing edit: close
      if (editing) onSaved();
      else {
        // re-fetch but keep open
        await onSavedKeepOpen();
      }
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Save failed");
    } finally { setBusy(false); }
  };

  // Hack: a way to let parent refresh list without closing this dialog. Just
  // call onSaved here would close. We provide a second action below.
  const onSavedKeepOpen = async () => { /* no-op; refresh happens on close */ };

  return (
    <Modal open={open} onClose={() => { onSaved(); }} title={editing ? "Edit landlord" : "New landlord"} size="lg">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" span={2}>
            <input required className={inputClass} value={String(form.name ?? "")} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="QID / CR">
            <input className={inputClass} value={String(form.qid_cr_number ?? "")} onChange={(e) => set("qid_cr_number", e.target.value)} />
          </Field>
          <Field label="Status">
            <select className={selectClass} value={String(form.status ?? "active")} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <Field label="Mobile">
            <input className={inputClass} value={String(form.mobile ?? "")} onChange={(e) => set("mobile", e.target.value)} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputClass} value={String(form.email ?? "")} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Contact person" span={2}>
            <input className={inputClass} value={String(form.contact_person ?? "")} onChange={(e) => set("contact_person", e.target.value)} />
          </Field>
          <Field label="Address" span={2}>
            <textarea className={textareaClass} value={String(form.address ?? "")} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>

        <div className="rounded-lg border border-border bg-card/40 p-3 space-y-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" /> Current agreement
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start date">
              <input
                type="date"
                className={inputClass}
                value={String(form.agreement_start_date ?? "").slice(0, 10)}
                onChange={(e) => set("agreement_start_date", e.target.value || null)}
              />
            </Field>
            <Field label="Expiry date">
              <input
                type="date"
                className={inputClass}
                value={String(form.agreement_expiry_date ?? "").slice(0, 10)}
                onChange={(e) => set("agreement_expiry_date", e.target.value || null)}
              />
            </Field>
            <Field label="Monthly rent">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.monthly_rent != null ? String(form.monthly_rent) : ""}
                onChange={(e) => set("monthly_rent", e.target.value === "" ? null : Number(e.target.value))}
              />
            </Field>
            <Field label="Reminder days before expiry">
              <input
                type="number"
                className={inputClass}
                value={form.reminder_days_before_expiry ?? 90}
                onChange={(e) => set("reminder_days_before_expiry", Number(e.target.value) as Landlord["reminder_days_before_expiry"])}
              />
            </Field>
          </div>
        </div>

        <Field label="Remarks">
          <textarea className={textareaClass} value={String(form.remarks ?? "")} onChange={(e) => set("remarks", e.target.value)} />
        </Field>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onSaved} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : editing ? "Save changes" : "Save and attach PDF"}
          </button>
        </div>
      </form>

      {savedId !== null && (
        <div className="mt-4 pt-4 border-t border-border">
          <LandlordAttachments landlordId={savedId} />
        </div>
      )}
    </Modal>
  );
}

function LandlordAttachments({ landlordId }: { landlordId: number }) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get("/attachments", {
        params: { entity_type: "landlord", entity_id: landlordId },
      });
      setRows(resp.data.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [landlordId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity_type", "landlord");
      fd.append("entity_id", String(landlordId));
      fd.append("category", "agreement");
      await api.post("/attachments", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } finally { setUploading(false); }
  };

  const download = async (att: Attachment) => {
    const resp = await api.get(`/attachments/${att.id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.original_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (att: Attachment) => {
    if (!confirm(`Delete ${att.original_name}?`)) return;
    await api.delete(`/attachments/${att.id}`);
    await load();
  };

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
        <FileText className="h-3.5 w-3.5" /> Agreement & related documents
      </div>
      <Can perm="attachment.upload">
        <label className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
          <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload agreement PDF"}
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.currentTarget.value = "";
            }}
          />
        </label>
      </Can>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No attachments yet.</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="flex-1 truncate text-sm">{a.original_name}</span>
              <span className="text-xs text-muted-foreground">{(a.size_bytes / 1024).toFixed(1)} KB</span>
              <button onClick={() => download(a)} aria-label="Download" className="h-7 w-7 grid place-items-center rounded-md hover:bg-accent">
                <Download className="h-3.5 w-3.5" />
              </button>
              <Can perm="attachment.upload">
                <button onClick={() => remove(a)} aria-label="Delete" className="h-7 w-7 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </Can>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
