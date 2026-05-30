"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
const STATUSES = ["active", "inactive", "maintenance", "on_hold"];

function statusBadgeClass(s: string): string {
  if (s === "active") return "bg-emerald-500/10 text-emerald-600";
  if (s === "on_hold") return "bg-amber-500/10 text-amber-600";
  if (s === "maintenance") return "bg-sky-500/10 text-sky-600";
  return "bg-muted text-muted-foreground";
}

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
                  <span className={"rounded-full px-2 py-0.5 text-xs capitalize " + statusBadgeClass(p.status)}>
                    {p.status.replace("_", " ")}
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

const ROOM_TYPE_OPTIONS = ["shared", "single", "executive", "supervisor", "family", "temporary"];
const BED_TYPE_OPTIONS = ["single", "bunk_lower", "bunk_upper"];

const MAX_FLOORS = 50;
const MAX_RPF = 100;
const MAX_BPR = 12;

type LayoutSpec = {
  floors: number;
  rooms_per_floor: number;
  beds_per_room: number;
  floor_prefix: string;
  room_prefix: string;
  ground_floor: boolean;
  default_room_type: string;
  default_bed_type: string;
};

const DEFAULT_LAYOUT: LayoutSpec = {
  floors: 1,
  rooms_per_floor: 4,
  beds_per_room: 2,
  floor_prefix: "",
  room_prefix: "",
  ground_floor: false,
  default_room_type: "shared",
  default_bed_type: "single",
};

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

function PropertyDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown>>({ property_type: "full_building", ownership_type: "rented" });
  const [landlords, setLandlords] = useState<LandlordOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [genLayout, setGenLayout] = useState(true);
  const [layout, setLayout] = useState<LayoutSpec>(DEFAULT_LAYOUT);

  useEffect(() => {
    if (open) {
      setForm({ property_type: "full_building", ownership_type: "rented" });
      setGenLayout(true);
      setLayout(DEFAULT_LAYOUT);
      api.get("/landlords").then((r) => setLandlords(r.data.data)).catch(() => setLandlords([]));
    }
  }, [open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const setL = <K extends keyof LayoutSpec>(k: K, v: LayoutSpec[K]) => setLayout((l) => ({ ...l, [k]: v }));

  const safe = useMemo(() => ({
    floors: clamp(layout.floors, 1, MAX_FLOORS),
    rooms_per_floor: clamp(layout.rooms_per_floor, 1, MAX_RPF),
    beds_per_room: clamp(layout.beds_per_room, 1, MAX_BPR),
  }), [layout.floors, layout.rooms_per_floor, layout.beds_per_room]);

  const totals = useMemo(() => ({
    floors: safe.floors,
    rooms: safe.floors * safe.rooms_per_floor,
    beds: safe.floors * safe.rooms_per_floor * safe.beds_per_room,
  }), [safe]);

  const sample = useMemo(() => {
    const firstFloorStored = layout.ground_floor ? `${layout.floor_prefix}G` : `${layout.floor_prefix}1`;
    const floorSeq = layout.ground_floor ? "G" : "1";
    const pad = Math.max(2, String(safe.rooms_per_floor).length);
    const firstRoom = `${layout.room_prefix}${floorSeq}${String(1).padStart(pad, "0")}`;
    // The bed_code helper on the backend always prefixes with "F" / "R" / "B".
    return `<NEW-CODE>-F${firstFloorStored}-R${firstRoom}-B1`;
  }, [layout.ground_floor, layout.floor_prefix, layout.room_prefix, safe.rooms_per_floor]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      if (genLayout) {
        payload.layout = {
          floors: safe.floors,
          rooms_per_floor: safe.rooms_per_floor,
          beds_per_room: safe.beds_per_room,
          floor_prefix: layout.floor_prefix,
          room_prefix: layout.room_prefix,
          ground_floor: layout.ground_floor,
          default_room_type: layout.default_room_type,
          default_bed_type: layout.default_bed_type,
        };
      }
      const resp = await api.post("/properties", payload);
      const created = resp.data?.data as { id?: number; code?: string; layout_generated?: { floors: number; rooms: number; beds: number } } | undefined;
      const detail = created?.layout_generated
        ? `${created.layout_generated.floors} floor${created.layout_generated.floors === 1 ? "" : "s"} · ${created.layout_generated.rooms} rooms · ${created.layout_generated.beds} beds`
        : undefined;
      toast.success(`Property ${created?.code ?? ""} created`, detail);
      onSaved();
      if (genLayout && created?.id) {
        router.push(`/properties/${created.id}?tab=rooms`);
      }
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
          <Field label="Managed by"><input className={inputClass} onChange={(e) => set("managed_by", e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} onChange={(e) => set("remarks", e.target.value)} /></Field>

        {/* Structure generator — defaults to on; uncheck to skip. */}
        <div className="rounded-lg border border-border bg-card/40 p-3 space-y-3">
          <label className="inline-flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={genLayout}
              onChange={(e) => setGenLayout(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">Generate floors, rooms and beds now</span>
              <span className="block text-xs text-muted-foreground">
                Builds the whole structure in one shot. You can still add, edit or remove floors / rooms / beds afterwards.
              </span>
            </span>
          </label>

          {genLayout && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label={`Number of floors (1-${MAX_FLOORS})`}>
                  <input
                    type="number" min={1} max={MAX_FLOORS}
                    className={inputClass} value={layout.floors}
                    onChange={(e) => setL("floors", Number(e.target.value))}
                  />
                </Field>
                <Field label={`Rooms per floor (1-${MAX_RPF})`}>
                  <input
                    type="number" min={1} max={MAX_RPF}
                    className={inputClass} value={layout.rooms_per_floor}
                    onChange={(e) => setL("rooms_per_floor", Number(e.target.value))}
                  />
                </Field>
                <Field label={`Beds per room (1-${MAX_BPR})`}>
                  <input
                    type="number" min={1} max={MAX_BPR}
                    className={inputClass} value={layout.beds_per_room}
                    onChange={(e) => setL("beds_per_room", Number(e.target.value))}
                  />
                </Field>
                <Field label="Floor number prefix">
                  <input
                    className={inputClass} value={layout.floor_prefix}
                    onChange={(e) => setL("floor_prefix", e.target.value)}
                    placeholder='e.g. "F" or leave empty'
                  />
                </Field>
                <Field label="Room number prefix">
                  <input
                    className={inputClass} value={layout.room_prefix}
                    onChange={(e) => setL("room_prefix", e.target.value)}
                    placeholder="usually empty"
                  />
                </Field>
                <Field label="Include ground floor">
                  <label className="flex items-center gap-2 h-9">
                    <input
                      type="checkbox" checked={layout.ground_floor}
                      onChange={(e) => setL("ground_floor", e.target.checked)}
                    />
                    <span className="text-sm">First floor becomes “G”</span>
                  </label>
                </Field>
                <Field label="Default room type">
                  <select
                    className={selectClass} value={layout.default_room_type}
                    onChange={(e) => setL("default_room_type", e.target.value)}
                  >
                    {ROOM_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Default bed type">
                  <select
                    className={selectClass} value={layout.default_bed_type}
                    onChange={(e) => setL("default_bed_type", e.target.value)}
                  >
                    {BED_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                </Field>
              </div>
              <div className="text-xs rounded-md bg-background/40 border border-border px-3 py-2 font-mono">
                Will create <span className="font-semibold">{totals.floors}</span> floor{totals.floors === 1 ? "" : "s"},
                {" "}<span className="font-semibold">{totals.rooms}</span> rooms,
                {" "}<span className="font-semibold">{totals.beds}</span> beds.
                {" "}First bed code: <span className="text-primary">{sample}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : genLayout ? `Create + ${totals.rooms} rooms` : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
