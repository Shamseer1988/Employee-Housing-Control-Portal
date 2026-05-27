"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Building2, Paperclip, FileText, History,
  Upload, Download, Trash2, Calendar, AlertTriangle, Plus,
} from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { Modal, Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";

type Property = {
  id: number;
  code: string;
  name: string;
  property_type: string;
  building_number: string | null;
  zone: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  map_link: string | null;
  ownership_type: string;
  status: string;
  managed_by: string | null;
  total_floors: number | null;
  total_rooms: number | null;
  total_bed_capacity: number | null;
  remarks: string | null;
  default_division: { id: number; code: string; name: string } | null;
  active_agreement: Agreement | null;
};

type Agreement = {
  id: number;
  agreement_number: string | null;
  start_date: string;
  expiry_date: string;
  monthly_rent: number | null;
  security_deposit: number | null;
  payment_terms: string | null;
  notice_period: string | null;
  renewal_status: string;
  reminder_days_before_expiry: number;
  is_active: boolean;
  remarks: string | null;
  landlord: { id: number; code: string; name: string };
};

type Landlord = { id: number; code: string; name: string };

type Attachment = {
  id: number;
  category: string | null;
  original_name: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
};

type TabKey = "overview" | "agreement" | "floors" | "rooms" | "attachments";

export default function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [tab, setTab] = useState<TabKey>("overview");
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/properties/${id}`);
      setProperty(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || !property) {
    return <div className="text-sm text-muted-foreground animate-pulse">Loading property…</div>;
  }

  const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: "overview", label: "Overview", icon: Building2 },
    { key: "agreement", label: "Agreement", icon: FileText },
    { key: "floors", label: "Floors", icon: History },
    { key: "rooms", label: "Rooms", icon: History },
    { key: "attachments", label: "Attachments", icon: Paperclip },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/properties" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to properties
        </Link>
        <div className="mt-2 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">{property.name}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{property.code}</span> · <span className="capitalize">{property.property_type.replaceAll("_", " ")}</span> · {[property.area, property.city].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
          <span className={"rounded-full px-3 py-1 text-xs " + (property.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
            {property.status}
          </span>
        </div>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 " +
              (tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab property={property} />}
      {tab === "agreement" && <AgreementTab property={property} onUpdated={load} />}
      {tab === "floors" && <ComingSoon module="Floors" phase="Phase 4" />}
      {tab === "rooms" && <ComingSoon module="Rooms & Beds" phase="Phase 4" />}
      {tab === "attachments" && <AttachmentsTab entityType="property" entityId={property.id} />}
    </div>
  );
}

function ComingSoon({ module, phase }: { module: string; phase: string }) {
  return (
    <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
      {module} management lands in <strong>{phase}</strong>.
    </div>
  );
}

function OverviewTab({ property }: { property: Property }) {
  const Cell = ({ k, v }: { k: string; v: string | number | null | undefined }) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v ?? "—"}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="glass rounded-xl p-4 lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
        <Cell k="Type" v={property.property_type.replaceAll("_", " ")} />
        <Cell k="Ownership" v={property.ownership_type.replaceAll("_", " ")} />
        <Cell k="Managed by" v={property.managed_by} />
        <Cell k="Building #" v={property.building_number} />
        <Cell k="Zone" v={property.zone} />
        <Cell k="Street" v={property.street} />
        <Cell k="Area" v={property.area} />
        <Cell k="City" v={property.city} />
        <Cell k="Default division" v={property.default_division?.name} />
        <Cell k="Total floors" v={property.total_floors} />
        <Cell k="Total rooms" v={property.total_rooms} />
        <Cell k="Total beds" v={property.total_bed_capacity} />
        {property.remarks && (
          <div className="col-span-full">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Remarks</div>
            <div className="text-sm">{property.remarks}</div>
          </div>
        )}
      </div>
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold">Active agreement</div>
        {property.active_agreement ? (
          <AgreementCard ag={property.active_agreement} />
        ) : (
          <div className="text-sm text-muted-foreground">No active agreement on file.</div>
        )}
        {property.map_link && (
          <a href={property.map_link} target="_blank" rel="noreferrer"
            className="text-xs text-primary underline">Open on Google Maps ↗</a>
        )}
      </div>
    </div>
  );
}

function AgreementCard({ ag }: { ag: Agreement }) {
  const days = Math.ceil((new Date(ag.expiry_date).getTime() - Date.now()) / 86400000);
  const tone = days < 0 ? "text-destructive" : days <= 30 ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="space-y-2 text-sm">
      <div>
        <div className="text-xs text-muted-foreground">Landlord</div>
        <div className="font-medium">{ag.landlord.name}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Start</div>
          <div className="font-mono text-xs">{ag.start_date}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Expiry</div>
          <div className={"font-mono text-xs " + tone}>{ag.expiry_date}</div>
        </div>
      </div>
      <div className={"text-xs flex items-center gap-1 " + tone}>
        {days < 0 ? <><AlertTriangle className="h-3 w-3" /> Expired {Math.abs(days)}d ago</> :
          days <= 30 ? <><AlertTriangle className="h-3 w-3" /> Expires in {days}d</> :
          <><Calendar className="h-3 w-3" /> {days}d remaining</>}
      </div>
      {ag.monthly_rent != null && (
        <div className="text-xs text-muted-foreground">Rent: <span className="text-foreground font-medium">{ag.monthly_rent.toLocaleString()}</span></div>
      )}
    </div>
  );
}

function AgreementTab({ property, onUpdated }: { property: Property; onUpdated: () => void }) {
  const [rows, setRows] = useState<Agreement[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, l] = await Promise.all([
        api.get(`/properties/${property.id}/agreements`),
        api.get("/landlords"),
      ]);
      setRows(a.data.data);
      setLandlords(l.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [property.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Agreements history — newest active first, then renewed.</div>
        <Can perm="property.edit">
          <button onClick={() => setShowForm(true)} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New / renew
          </button>
        </Can>
      </div>

      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 px-3">#</th>
              <th className="py-2 px-3">Landlord</th>
              <th className="py-2 px-3">Start</th>
              <th className="py-2 px-3">Expiry</th>
              <th className="py-2 px-3">Rent</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3">Renewal</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">No agreements yet</td></tr>
            : rows.map((a) => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="py-2 px-3 font-mono text-xs">{a.agreement_number ?? `AG-${a.id}`}</td>
                <td className="py-2 px-3">{a.landlord.name}</td>
                <td className="py-2 px-3 font-mono text-xs">{a.start_date}</td>
                <td className="py-2 px-3 font-mono text-xs">{a.expiry_date}</td>
                <td className="py-2 px-3">{a.monthly_rent?.toLocaleString() ?? "—"}</td>
                <td className="py-2 px-3">
                  <span className={"rounded-full px-2 py-0.5 text-xs " + (a.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                    {a.is_active ? "Active" : "Archived"}
                  </span>
                </td>
                <td className="py-2 px-3 capitalize">{a.renewal_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AgreementDialog
        open={showForm}
        propertyId={property.id}
        landlords={landlords}
        onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); onUpdated(); }}
      />
    </div>
  );
}

function AgreementDialog({ open, propertyId, landlords, onClose, onSaved }: {
  open: boolean; propertyId: number; landlords: Landlord[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({ reminder_days_before_expiry: 90 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setForm({ reminder_days_before_expiry: 90 }); setError(null); }
  }, [open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(`/properties/${propertyId}/agreements`, form);
      onSaved();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Save failed");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New / renew agreement" size="lg">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Landlord" span={2}>
            <select required className={selectClass} value={String(form.landlord_id ?? "")} onChange={(e) => set("landlord_id", e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">Select…</option>
              {landlords.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
          </Field>
          <Field label="Agreement number"><input className={inputClass} onChange={(e) => set("agreement_number", e.target.value)} /></Field>
          <Field label="Reminder days">
            <input type="number" className={inputClass} value={Number(form.reminder_days_before_expiry ?? 90)} onChange={(e) => set("reminder_days_before_expiry", Number(e.target.value))} />
          </Field>
          <Field label="Start date"><input required type="date" className={inputClass} onChange={(e) => set("start_date", e.target.value)} /></Field>
          <Field label="Expiry date"><input required type="date" className={inputClass} onChange={(e) => set("expiry_date", e.target.value)} /></Field>
          <Field label="Monthly rent"><input type="number" step="0.01" className={inputClass} onChange={(e) => set("monthly_rent", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Security deposit"><input type="number" step="0.01" className={inputClass} onChange={(e) => set("security_deposit", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Payment terms"><input className={inputClass} onChange={(e) => set("payment_terms", e.target.value)} /></Field>
          <Field label="Notice period"><input className={inputClass} onChange={(e) => set("notice_period", e.target.value)} /></Field>
          <Field label="Kahramaa account"><input className={inputClass} onChange={(e) => set("kahramaa_account", e.target.value)} /></Field>
          <Field label="Municipality ref"><input className={inputClass} onChange={(e) => set("municipality_ref", e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} onChange={(e) => set("remarks", e.target.value)} /></Field>
        {error && <div className="text-sm text-destructive">{error}</div>}
        <div className="text-xs text-muted-foreground">
          Posting this will archive any existing active agreement on this property.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : "Post"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AttachmentsTab({ entityType, entityId }: { entityType: string; entityId: number | string }) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get("/attachments", { params: { entity_type: entityType, entity_id: entityId } });
      setRows(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityType, entityId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file: File, category: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity_type", entityType);
      fd.append("entity_id", String(entityId));
      if (category) fd.append("category", category);
      await api.post("/attachments", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } finally {
      setUploading(false);
    }
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
    <div className="space-y-4">
      <Can perm="attachment.upload">
        <div className="glass rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <label className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload agreement"}
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f, "agreement");
              e.currentTarget.value = "";
            }} />
          </label>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4" /> Upload other
            <input type="file" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f, "other");
              e.currentTarget.value = "";
            }} />
          </label>
        </div>
      </Can>

      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 px-3">File</th>
              <th className="py-2 px-3">Category</th>
              <th className="py-2 px-3">Size</th>
              <th className="py-2 px-3">Uploaded</th>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">No attachments yet</td></tr>
            : rows.map((a) => (
              <tr key={a.id} className="border-b border-border/60">
                <td className="py-2 px-3">{a.original_name}</td>
                <td className="py-2 px-3 text-muted-foreground">{a.category ?? "—"}</td>
                <td className="py-2 px-3 text-xs">{(a.size_bytes / 1024).toFixed(1)} KB</td>
                <td className="py-2 px-3 font-mono text-xs">{a.created_at.slice(0, 19).replace("T", " ")}</td>
                <td className="py-2 px-3 text-right">
                  <button onClick={() => download(a)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent inline-block" aria-label="Download">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <Can perm="attachment.upload">
                    <button onClick={() => remove(a)} className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive inline-block" aria-label="Delete">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
