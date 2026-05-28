"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Building2, MapPin, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { Modal, Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";
import { toast, errorMessage } from "@/components/ui/toast";
import { Skeleton, EmptyState } from "@/components/ui/states";

type Property = {
  id: number;
  code: string;
  name: string;
  property_type: string;
  city: string | null;
  area: string | null;
  status: string;
  ownership_type: string;
  floors_count: number;
  rooms_count: number;
  beds_count: number;
  default_division: { id: number; code: string; name: string } | null;
  landlord: {
    id: number;
    code: string;
    name: string;
  } | null;
  active_agreement: {
    id: number;
    expiry_date: string;
    landlord: { id: number; name: string };
  } | null;
};

const PROPERTY_TYPES = [
  "full_building", "partial_building", "one_floor_only", "villa",
  "apartment", "labour_camp", "staff_flat", "shared_accommodation",
  "temporary_accommodation",
];
const OWNERSHIP = ["rented", "company_owned", "temporary"];
const STATUSES = ["active", "inactive", "maintenance", "vacated"];

export default function PropertiesPage() {
  const [rows, setRows] = useState<Property[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (status) params.status = status;
      if (type) params.type = type;
      const resp = await api.get("/properties", { params });
      const list = Array.isArray(resp?.data?.data) ? resp.data.data : [];
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">Buildings, villas, apartments and labour camps across all locations.</p>
        </div>
        <Can perm="property.create">
          <button onClick={() => setShowForm(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New property
          </button>
        </Can>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search code, name, city, area…"
            className="h-9 w-full max-w-sm rounded-md border border-input bg-card/60 px-3 text-sm"
          />
          <select className={selectClass + " w-auto"} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
          </select>
          <select className={selectClass + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">Filter</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {loading && Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="h-3 w-1/2" />
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
              </div>
            </div>
          ))}
          {!loading && rows.length === 0 && (
            <div className="col-span-full">
              <EmptyState
                icon={Building2}
                title="No properties yet"
                hint="Create your first property to start tracking floors, rooms and beds."
              />
            </div>
          )}
          {rows.map((p) => {
            const expiry = p.active_agreement?.expiry_date ?? null;
            const days = expiry ? Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000) : null;
            const expiringSoon = days !== null && days <= 90;
            const expired = days !== null && days < 0;
            const landlordName = p.landlord?.name ?? p.active_agreement?.landlord?.name ?? null;
            return (
              <Link key={p.id} href={`/properties/${p.id}`}
                className="glass rounded-xl p-4 hover:bg-accent/30 transition-colors block">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 grid place-items-center">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium leading-tight">{p.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.code}</div>
                    </div>
                  </div>
                  <span className={"rounded-full px-2 py-0.5 text-xs " + (p.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-3 text-xs text-muted-foreground capitalize">
                  {(p.property_type ?? "—").replaceAll("_", " ")} · {(p.ownership_type ?? "—").replaceAll("_", " ")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {[p.area, p.city].filter(Boolean).join(", ") || "—"}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <Stat label="Floors" value={p.floors_count} />
                  <Stat label="Rooms" value={p.rooms_count} />
                  <Stat label="Beds" value={p.beds_count} />
                </div>
                {landlordName && (
                  <div className={"mt-3 text-xs flex items-center gap-1 " + (expired ? "text-destructive" : expiringSoon ? "text-amber-600" : "text-muted-foreground")}>
                    {expiringSoon && <AlertTriangle className="h-3 w-3" />}
                    {landlordName}{expiry ? ` · ${expired ? "expired" : `expires ${expiry}${days !== null ? ` (${days}d)` : ""}`}` : ""}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <PropertyDialog open={showForm} onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); }} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md bg-card/60 border border-border p-2 text-center">
      <div className="text-base font-semibold">{value ?? "—"}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

type LandlordOption = { id: number; code: string; name: string };

function PropertyDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, unknown>>({ property_type: "full_building", ownership_type: "rented", status: "active" });
  const [landlords, setLandlords] = useState<LandlordOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ property_type: "full_building", ownership_type: "rented", status: "active" });
      api.get("/landlords").then((r) => setLandlords(r.data.data)).catch(() => setLandlords([]));
    }
  }, [open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const resp = await api.post("/properties", form);
      const code = resp.data?.data?.code ?? "";
      toast.success(`Property ${code} created`);
      onSaved();
    } catch (err: unknown) {
      toast.error("Save failed", errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New property" size="lg">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input required className={inputClass} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Landlord">
            <select className={selectClass} value={String(form.landlord_id ?? "")} onChange={(e) => set("landlord_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">— None —</option>
              {landlords.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type">
            <select className={selectClass} value={String(form.property_type ?? "")} onChange={(e) => set("property_type", e.target.value)}>
              {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Building number"><input className={inputClass} onChange={(e) => set("building_number", e.target.value)} /></Field>
          <Field label="Zone"><input className={inputClass} onChange={(e) => set("zone", e.target.value)} /></Field>
          <Field label="Street"><input className={inputClass} onChange={(e) => set("street", e.target.value)} /></Field>
          <Field label="Area"><input className={inputClass} onChange={(e) => set("area", e.target.value)} /></Field>
          <Field label="City"><input className={inputClass} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Google map link"><input className={inputClass} onChange={(e) => set("map_link", e.target.value)} /></Field>
          <Field label="Ownership">
            <select className={selectClass} value={String(form.ownership_type ?? "rented")} onChange={(e) => set("ownership_type", e.target.value)}>
              {OWNERSHIP.map((o) => <option key={o} value={o}>{o.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectClass} value={String(form.status ?? "active")} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Managed by"><input className={inputClass} onChange={(e) => set("managed_by", e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <div className="text-xs text-muted-foreground">
          Floors, rooms and beds are added from the property detail page after creation. The card counts update live as you add them.
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
