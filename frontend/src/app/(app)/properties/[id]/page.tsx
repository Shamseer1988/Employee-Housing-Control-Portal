"use client";

import { useEffect, useState } from "react";
import { useRouteParams } from "@/lib/use-route-params";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Building2, Paperclip, FileText, Layers, BedDouble,
  Calendar, AlertTriangle, Plus, Pencil, Wrench, Lock, Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { Modal, Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";
import { toast, errorMessage } from "@/components/ui/toast";
import { AttachmentsTab } from "@/components/attachments-tab";

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
  floors_count: number;
  rooms_count: number;
  beds_count: number;
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

type TabKey = "overview" | "agreement" | "floors" | "rooms" | "attachments";

const VALID_TABS: TabKey[] = ["overview", "agreement", "floors", "rooms", "attachments"];

export default function PropertyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = useRouteParams(params);
  const searchParams = useSearchParams();
  const initialTab = (() => {
    const q = searchParams.get("tab") as TabKey | null;
    return q && VALID_TABS.includes(q) ? q : "overview";
  })();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);

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
    { key: "floors", label: "Floors", icon: Layers },
    { key: "rooms", label: "Rooms & Beds", icon: BedDouble },
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
          <div className="flex items-center gap-2">
            <span className={"rounded-full px-3 py-1 text-xs capitalize " + statusBadgeClass(property.status)}>
              {property.status.replace("_", " ")}
            </span>
            <Link
              href={`/properties/${property.id}/floor-plan`}
              className="h-8 inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 text-xs hover:bg-accent"
            >
              Floor plan →
            </Link>
            <Can perm="property.deactivate">
              <button
                type="button"
                onClick={() => setShowStatusModal(true)}
                className="h-8 inline-flex items-center gap-1 rounded-md border border-border bg-card/60 px-2 text-xs hover:bg-accent"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" /> Change status
              </button>
            </Can>
          </div>
        </div>
      </div>

      <PropertyStatusModal
        open={showStatusModal}
        property={property}
        onClose={() => setShowStatusModal(false)}
        onChanged={async () => { setShowStatusModal(false); await load(); }}
      />

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
      {tab === "floors" && <FloorsTab propertyId={property.id} />}
      {tab === "rooms" && <RoomsTab propertyId={property.id} />}
      {tab === "attachments" && <AttachmentsTab entityType="property" entityId={property.id} />}
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
        <Cell k="Floors" v={property.floors_count} />
        <Cell k="Rooms" v={property.rooms_count} />
        <Cell k="Beds" v={property.beds_count} />
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

  useEffect(() => {
    if (open) { setForm({ reminder_days_before_expiry: 90 }); }
  }, [open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/properties/${propertyId}/agreements`, form);
      toast.success("Agreement saved");
      onSaved();
    } catch (err: unknown) {
      toast.error("Save failed", errorMessage(err));
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

type Floor = {
  id: number;
  property_id: number;
  floor_number: string;
  floor_name: string | null;
  floor_type: string | null;
  status: string;
  room_count: number;
  remarks: string | null;
};

type Room = {
  id: number;
  property_id: number;
  floor_id: number;
  room_number: string;
  room_name: string | null;
  room_type: string;
  capacity: number;
  allowed_gender: string;
  has_bathroom: boolean;
  has_ac: boolean;
  occupancy_status: string;
  monthly_rent: number | null;
  remarks: string | null;
  bed_counts: { total: number; occupied: number; empty: number; reserved: number; maintenance: number; blocked: number };
};

type Bed = {
  id: number;
  bed_number: string;
  bed_code: string;
  bed_type: string;
  status: string;
  remarks: string | null;
};

const ROOM_TYPES = ["shared", "single", "executive", "supervisor", "family", "temporary"];
const GENDERS = ["any", "male", "female"];
const BED_TYPES = ["single", "bunk_upper", "bunk_lower"];

const BED_STATUS_TONE: Record<string, string> = {
  empty: "bg-muted text-muted-foreground",
  occupied: "bg-emerald-500/10 text-emerald-600",
  reserved: "bg-sky-500/10 text-sky-600",
  maintenance: "bg-amber-500/10 text-amber-600",
  blocked: "bg-rose-500/10 text-rose-600",
};

const ROOM_STATUS_TONE: Record<string, string> = {
  empty: "bg-muted text-muted-foreground",
  partially_occupied: "bg-sky-500/10 text-sky-600",
  full: "bg-emerald-500/10 text-emerald-600",
  maintenance: "bg-amber-500/10 text-amber-600",
  blocked: "bg-rose-500/10 text-rose-600",
};

function FloorsTab({ propertyId }: { propertyId: number }) {
  const [rows, setRows] = useState<Floor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Floor | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/properties/${propertyId}/floors`);
      setRows(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [propertyId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (f: Floor) => {
    if (!confirm(`Delete floor ${f.floor_number}?`)) return;
    try {
      await api.delete(`/floors/${f.id}`);
      toast.success(`Floor ${f.floor_number} deleted`);
      await load();
    } catch (err: unknown) {
      toast.error("Delete failed", errorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Floors registered under this property.</div>
        <Can perm="floor.manage">
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New floor
          </button>
        </Can>
      </div>

      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 px-3">Number</th>
              <th className="py-2 px-3">Name</th>
              <th className="py-2 px-3">Type</th>
              <th className="py-2 px-3">Rooms</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            : rows.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No floors yet</td></tr>
            : rows.map((f) => (
              <tr key={f.id} className="border-b border-border/60 hover:bg-accent/30">
                <td className="py-2 px-3 font-mono">{f.floor_number}</td>
                <td className="py-2 px-3">{f.floor_name ?? "—"}</td>
                <td className="py-2 px-3 capitalize">{f.floor_type ?? "—"}</td>
                <td className="py-2 px-3">{f.room_count}</td>
                <td className="py-2 px-3">
                  <span className={"rounded-full px-2 py-0.5 text-xs " + (f.status === "active" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>
                    {f.status}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  <Can perm="floor.manage">
                    <button onClick={() => { setEditing(f); setShowForm(true); }}
                      className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent inline-block">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => remove(f)}
                      className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive inline-block">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </Can>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FloorDialog open={showForm} propertyId={propertyId} editing={editing}
        onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); }}
      />
    </div>
  );
}

function FloorDialog({ open, propertyId, editing, onClose, onSaved }: {
  open: boolean; propertyId: number; editing: Floor | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Partial<Floor>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(editing ?? { status: "active" }); }, [editing, open]);

  const set = <K extends keyof Floor>(k: K, v: Floor[K] | null | undefined) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/floors/${editing.id}`, form);
        toast.success(`Floor ${editing.floor_number} updated`);
      } else {
        const resp = await api.post(`/properties/${propertyId}/floors`, form);
        toast.success(`Floor ${resp.data?.data?.floor_number ?? ""} created`);
      }
      onSaved();
    } catch (err: unknown) {
      toast.error("Save failed", errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit floor" : "New floor"}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number"><input required className={inputClass} value={form.floor_number ?? ""} onChange={(e) => set("floor_number", e.target.value)} /></Field>
          <Field label="Name"><input className={inputClass} value={form.floor_name ?? ""} onChange={(e) => set("floor_name", e.target.value)} /></Field>
          <Field label="Type"><input className={inputClass} value={form.floor_type ?? ""} onChange={(e) => set("floor_type", e.target.value)} placeholder="residential, mezzanine…" /></Field>
          <Field label="Status">
            <select className={selectClass} value={form.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} value={form.remarks ?? ""} onChange={(e) => set("remarks", e.target.value)} /></Field>
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

function RoomsTab({ propertyId }: { propertyId: number }) {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFloor, setActiveFloor] = useState<number | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Room | null>(null);
  const [createInFloorId, setCreateInFloorId] = useState<number | null>(null);
  const [openRoomId, setOpenRoomId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        api.get(`/properties/${propertyId}/floors`),
        api.get(`/properties/${propertyId}/rooms`),
      ]);
      setFloors(f.data.data);
      setRooms(r.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [propertyId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = activeFloor === "all" ? rooms : rooms.filter((r) => r.floor_id === activeFloor);
  const byFloor = (id: number) => floors.find((f) => f.id === id);

  if (loading) return <div className="glass rounded-xl p-10 text-center text-muted-foreground">Loading…</div>;
  if (floors.length === 0) {
    return (
      <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
        Add floors first, then create rooms under each floor.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setActiveFloor("all")}
          className={"h-8 px-3 rounded-md border text-sm " + (activeFloor === "all" ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card/60 hover:bg-accent")}>
          All floors
        </button>
        {floors.map((f) => (
          <button key={f.id} onClick={() => setActiveFloor(f.id)}
            className={"h-8 px-3 rounded-md border text-sm " + (activeFloor === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card/60 hover:bg-accent")}>
            Floor {f.floor_number}{f.floor_name ? ` · ${f.floor_name}` : ""} <span className="text-xs opacity-70">({f.room_count})</span>
          </button>
        ))}
        <div className="ml-auto" />
        <Can perm="room.manage">
          <button onClick={() => {
              setEditing(null);
              setCreateInFloorId(activeFloor === "all" ? floors[0].id : activeFloor);
              setShowForm(true);
            }}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New room
          </button>
        </Can>
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">No rooms on this floor yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((r) => {
            const f = byFloor(r.floor_id);
            const open = openRoomId === r.id;
            return (
              <div key={r.id} className="glass rounded-xl overflow-hidden">
                <button onClick={() => setOpenRoomId(open ? null : r.id)} className="w-full text-left p-4 hover:bg-accent/30">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">Room {r.room_number}{r.room_name ? ` · ${r.room_name}` : ""}</div>
                      <div className="text-xs text-muted-foreground">
                        Floor {f?.floor_number} · {r.room_type} · capacity {r.capacity}
                      </div>
                    </div>
                    <span className={"rounded-full px-2 py-0.5 text-xs " + ROOM_STATUS_TONE[r.occupancy_status]}>
                      {r.occupancy_status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    <MiniStat label="Total" value={r.bed_counts.total} />
                    <MiniStat label="Occ" value={r.bed_counts.occupied} />
                    <MiniStat label="Empty" value={r.bed_counts.empty} />
                    <MiniStat label="Maint" value={r.bed_counts.maintenance} />
                  </div>
                  <div className="mt-2 flex gap-2 text-xs text-muted-foreground">
                    {r.has_bathroom && <span>· Bathroom</span>}
                    {r.has_ac && <span>· AC</span>}
                    {r.allowed_gender !== "any" && <span>· {r.allowed_gender}</span>}
                  </div>
                </button>
                {open && (
                  <BedsPanel
                    room={r}
                    onChanged={load}
                    onEditRoom={() => { setEditing(r); setCreateInFloorId(r.floor_id); setShowForm(true); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <RoomDialog
        open={showForm}
        floorId={createInFloorId}
        floors={floors}
        editing={editing}
        onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); }}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-card/60 border border-border py-1">
      <div className="text-sm font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

// Phase 3: rooms are described by physical bed UNITS, not sleeping slots.
// A "single" unit = 1 sleeping slot (one bed). A "bunk" unit = 2 sleeping
// slots (bunk_lower + bunk_upper). Sleeping capacity = units * slots/unit.
type UnitType = "single" | "bunk";
const MAX_BED_UNITS = 12;
const MAX_EDIT_CAPACITY = 24;

function RoomDialog({ open, floorId, floors, editing, onClose, onSaved }: {
  open: boolean; floorId: number | null; floors: Floor[]; editing: Room | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [autoCreateBeds, setAutoCreateBeds] = useState(true);
  const [units, setUnits] = useState<number>(2);
  const [unitType, setUnitType] = useState<UnitType>("single");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm(editing as unknown as Record<string, unknown>);
      setAutoCreateBeds(false);
    } else {
      setForm({ room_type: "shared", allowed_gender: "any", has_bathroom: false, has_ac: true });
      setAutoCreateBeds(true);
      setUnits(2);
      setUnitType("single");
    }
  }, [editing, open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  // New-mode derived capacity. Clamp here so the preview matches what we POST.
  const safeUnits = Math.max(1, Math.min(MAX_BED_UNITS, Math.floor(units || 1)));
  const slotsPerUnit = unitType === "bunk" ? 2 : 1;
  const derivedCapacity = safeUnits * slotsPerUnit;
  const minEditCapacity = Math.max(1, editing?.bed_counts.total ?? 1);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/rooms/${editing.id}`, form);
        toast.success(`Room ${editing.room_number} updated`);
      } else {
        if (!floorId) throw new Error("No floor selected");
        const roomPayload = { ...form, capacity: derivedCapacity };
        const resp = await api.post(`/floors/${floorId}/rooms`, roomPayload);
        const newRoom = resp.data?.data;
        let bedsCreated = 0;
        if (autoCreateBeds && newRoom?.id) {
          const unitsArr = Array.from({ length: safeUnits }, () => ({ type: unitType }));
          const bulkResp = await api.post(`/rooms/${newRoom.id}/beds/bulk`, { units: unitsArr });
          bedsCreated = bulkResp.data?.data?.count ?? 0;
        }
        const roomLabel = newRoom?.room_number ?? "";
        toast.success(
          `Room ${roomLabel} created`,
          bedsCreated > 0
            ? `${bedsCreated} bed${bedsCreated === 1 ? "" : "s"} added (${safeUnits} ${unitType}${safeUnits === 1 ? "" : "s"}).`
            : undefined,
        );
      }
      onSaved();
    } catch (err: unknown) {
      toast.error("Save failed", errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit room ${editing.room_number}` : "New room"}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {!editing && (
            <Field label="Floor" span={2}>
              <select className={selectClass} value={floorId ?? ""} disabled>
                {floors.map((f) => <option key={f.id} value={f.id}>Floor {f.floor_number}</option>)}
              </select>
            </Field>
          )}
          <Field label="Room number"><input required className={inputClass} value={String(form.room_number ?? "")} onChange={(e) => set("room_number", e.target.value)} /></Field>
          <Field label="Name"><input className={inputClass} value={String(form.room_name ?? "")} onChange={(e) => set("room_name", e.target.value)} placeholder="Optional" /></Field>
          <Field label="Type">
            <select className={selectClass} value={String(form.room_type ?? "shared")} onChange={(e) => set("room_type", e.target.value)}>
              {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Allowed gender">
            <select className={selectClass} value={String(form.allowed_gender ?? "any")} onChange={(e) => set("allowed_gender", e.target.value)}>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Monthly rent"><input type="number" step="0.01" className={inputClass} value={form.monthly_rent != null ? String(form.monthly_rent) : ""} onChange={(e) => set("monthly_rent", e.target.value ? Number(e.target.value) : null)} placeholder="Optional" /></Field>
          <Field label="Amenities">
            <div className="flex items-center gap-3 h-9">
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={Boolean(form.has_bathroom)} onChange={(e) => set("has_bathroom", e.target.checked)} />
                Bathroom
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={Boolean(form.has_ac)} onChange={(e) => set("has_ac", e.target.checked)} />
                AC
              </label>
            </div>
          </Field>
        </div>

        {editing ? (
          // Edit mode: bed structure already exists; just allow tweaking the
          // total sleeping capacity within the no-shrink-below-bed-count guard.
          <Field label="Sleeping capacity (people)">
            <input
              type="number"
              min={minEditCapacity}
              max={MAX_EDIT_CAPACITY}
              className={inputClass}
              value={Number(form.capacity ?? editing.capacity)}
              onChange={(e) => set("capacity", Math.max(minEditCapacity, Number(e.target.value) || minEditCapacity))}
            />
            <div className="text-[11px] text-muted-foreground mt-1">
              Can&apos;t be lower than the current bed count ({editing.bed_counts.total}). Use the room&apos;s bed list to add/remove beds.
            </div>
          </Field>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Field label="Bed frames (units)">
              <input
                type="number"
                min={1}
                max={MAX_BED_UNITS}
                className={inputClass}
                value={units}
                onChange={(e) => setUnits(Math.max(1, Math.min(MAX_BED_UNITS, Math.floor(Number(e.target.value) || 1))))}
              />
            </Field>
            <Field label="Bed type">
              <div className="flex items-center gap-3 h-9">
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input type="radio" name="unitType" checked={unitType === "single"} onChange={() => setUnitType("single")} />
                  Single
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input type="radio" name="unitType" checked={unitType === "bunk"} onChange={() => setUnitType("bunk")} />
                  Bunk
                </label>
              </div>
            </Field>
            <Field label="Sleeping capacity">
              <div className="h-9 flex items-center text-sm">
                <span className="font-semibold">{derivedCapacity}</span>&nbsp;
                <span className="text-muted-foreground">person{derivedCapacity === 1 ? "" : "s"}</span>
              </div>
            </Field>
          </div>
        )}

        {!editing && (
          <div className="rounded-lg border border-border bg-card/40 p-3 space-y-2">
            <label className="inline-flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoCreateBeds}
                onChange={(e) => setAutoCreateBeds(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Automatically add {derivedCapacity} bed{derivedCapacity === 1 ? "" : "s"}</span>
                <span className="block text-xs text-muted-foreground">
                  {unitType === "bunk"
                    ? <>Creates {safeUnits} bunk frame{safeUnits === 1 ? "" : "s"} = {derivedCapacity} sleeping slots, numbered <span className="font-mono">1L, 1U, 2L, 2U…</span></>
                    : <>Creates {derivedCapacity} single bed{derivedCapacity === 1 ? "" : "s"} numbered <span className="font-mono">1…{derivedCapacity}</span></>}
                  . Skip if your room is mixed; you can add beds manually afterwards.
                </span>
              </span>
            </label>
          </div>
        )}

        <Field label="Remarks">
          <textarea className={textareaClass} value={String(form.remarks ?? "")} onChange={(e) => set("remarks", e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : (editing ? "Save changes" : autoCreateBeds ? `Create room + ${derivedCapacity} bed${derivedCapacity === 1 ? "" : "s"}` : "Create room")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BedsPanel({ room, onChanged, onEditRoom }: {
  room: Room; onChanged: () => void; onEditRoom: () => void;
}) {
  const [beds, setBeds] = useState<Bed[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [newType, setNewType] = useState("single");

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get(`/rooms/${room.id}/beds`);
      setBeds(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [room.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!newNumber.trim()) return;
    setAdding(true);
    try {
      const resp = await api.post(`/rooms/${room.id}/beds`, { bed_number: newNumber.trim(), bed_type: newType });
      toast.success(`Bed ${resp.data?.data?.bed_code ?? newNumber.trim()} added`);
      setNewNumber("");
      await load();
      onChanged();
    } catch (err: unknown) {
      toast.error("Add bed failed", errorMessage(err));
    } finally { setAdding(false); }
  };

  const setStatus = async (bed: Bed, status: string) => {
    try {
      await api.post(`/beds/${bed.id}/status`, { status });
      toast.success(`Bed ${bed.bed_code ?? bed.bed_number} set to ${status}`);
      await load();
      onChanged();
    } catch (err: unknown) {
      toast.error("Status update failed", errorMessage(err));
    }
  };

  const remove = async (bed: Bed) => {
    if (!confirm(`Delete bed ${bed.bed_code}?`)) return;
    try {
      await api.delete(`/beds/${bed.id}`);
      toast.success(`Bed ${bed.bed_code} deleted`);
      await load();
      onChanged();
    } catch (err: unknown) {
      toast.error("Delete failed", errorMessage(err));
    }
  };

  return (
    <div className="border-t border-border p-4 space-y-3 bg-card/30">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Beds</div>
        <Can perm="room.manage">
          <button onClick={onEditRoom} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            <Pencil className="h-3 w-3" /> Edit room
          </button>
        </Can>
      </div>

      {loading ? <div className="text-sm text-muted-foreground">Loading beds…</div> : (
        beds.length === 0 ? <div className="text-sm text-muted-foreground">No beds yet.</div> : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {beds.map((b) => (
              <div key={b.id} className="rounded-md border border-border bg-card/60 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-xs">{b.bed_code}</div>
                  <span className={"rounded-full px-2 py-0.5 text-[10px] " + BED_STATUS_TONE[b.status]}>
                    {b.status}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-1">
                  {b.bed_type.replace("_", " ")}
                </div>
                <Can perm="bed.manage">
                  <div className="mt-2 flex flex-wrap gap-1">
                    {b.status === "empty" && (
                      <>
                        <button onClick={() => setStatus(b, "maintenance")} className="text-[10px] inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-accent">
                          <Wrench className="h-2.5 w-2.5" /> Maintain
                        </button>
                        <button onClick={() => setStatus(b, "blocked")} className="text-[10px] inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:bg-accent">
                          <Lock className="h-2.5 w-2.5" /> Block
                        </button>
                      </>
                    )}
                    {(b.status === "maintenance" || b.status === "blocked") && (
                      <button onClick={() => setStatus(b, "empty")} className="text-[10px] rounded border border-border px-2 py-0.5 hover:bg-accent">
                        Mark empty
                      </button>
                    )}
                    {b.status !== "occupied" && (
                      <button onClick={() => remove(b)} className="text-[10px] inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-2.5 w-2.5" /> Delete
                      </button>
                    )}
                  </div>
                </Can>
              </div>
            ))}
          </div>
        )
      )}

      <Can perm="bed.manage">
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <input
            placeholder={`Bed # (capacity ${beds.length}/${room.capacity})`}
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            className="h-8 flex-1 rounded-md border border-input bg-card/60 px-2 text-sm"
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            className="h-8 rounded-md border border-input bg-card/60 px-2 text-sm">
            {BED_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
          <button onClick={create} disabled={adding || !newNumber.trim() || beds.length >= room.capacity}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {adding ? "…" : "Add bed"}
          </button>
        </div>
      </Can>
    </div>
  );
}

const STATUS_OPTIONS: { value: string; label: string; tone: string; help: string }[] = [
  { value: "active",      label: "Active",       tone: "border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400", help: "Property is operational. New assignments are allowed." },
  { value: "on_hold",     label: "On hold",      tone: "border-amber-500 bg-amber-500/5 text-amber-700 dark:text-amber-400",          help: "Temporarily paused. New assignments blocked. Existing residents stay until you transfer them." },
  { value: "maintenance", label: "Maintenance",  tone: "border-sky-500 bg-sky-500/5 text-sky-700 dark:text-sky-400",                  help: "Property is under repair. New assignments blocked." },
  { value: "inactive",    label: "Inactive",     tone: "border-rose-500 bg-rose-500/5 text-rose-700 dark:text-rose-400",              help: "Permanently retired (lease ended, sold, demolished). New assignments blocked." },
];

const REASON_OPTIONS = [
  { value: "agreement_expired",  label: "Agreement expired / not renewed" },
  { value: "renovation",         label: "Renovation / major repair" },
  { value: "ownership_dispute",  label: "Ownership dispute" },
  { value: "end_of_lease",       label: "End of lease — handed back to landlord" },
  { value: "regulatory_hold",    label: "Regulatory / municipality hold" },
  { value: "other",              label: "Other (explain in remarks)" },
];

type BlockedDetails = {
  blocked: true;
  occupied: number;
  reserved: number;
  sample_employees: { employee_id: number; employee_code: string; employee_name: string; bed_id: number; bed_code: string }[];
};

function PropertyStatusModal({ open, property, onClose, onChanged }: {
  open: boolean; property: Property; onClose: () => void; onChanged: () => void;
}) {
  const [target, setTarget] = useState<string>(property.status);
  const [reason, setReason] = useState<string>("agreement_expired");
  const [remarks, setRemarks] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [snapshot, setSnapshot] = useState<{ occupied: number; reserved: number } | null>(null);
  const [blocked, setBlocked] = useState<BlockedDetails | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(property.status);
    setReason("agreement_expired");
    setRemarks("");
    setBlocked(null);
    api.get(`/properties/${property.id}/occupancy-snapshot`)
      .then((r) => setSnapshot(r.data.data))
      .catch(() => setSnapshot(null));
  }, [open, property.id, property.status]);

  const movingAway = target !== "active" && target !== property.status;
  const needsReason = movingAway;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (target === property.status) return;
    setBusy(true);
    setBlocked(null);
    try {
      const resp = await api.post(`/properties/${property.id}/status`, {
        status: target,
        reason: needsReason ? reason : "",
        remarks: remarks || null,
      });
      toast.success(resp.data?.message ?? `Property set to ${target}`);
      onChanged();
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string; details?: BlockedDetails } } };
      if (e.response?.status === 409 && e.response.data?.details?.blocked) {
        setBlocked(e.response.data.details);
      } else {
        toast.error("Status change failed", errorMessage(err));
      }
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Change status — ${property.name}`} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg border border-border bg-card/40 p-3 text-xs text-muted-foreground">
          Currently <span className="font-medium capitalize text-foreground">{property.status.replace("_", " ")}</span>
          {snapshot && (
            <>
              {" · "}
              <span className="font-medium text-foreground">{snapshot.occupied}</span> occupied bed{snapshot.occupied === 1 ? "" : "s"}
              {" · "}
              <span className="font-medium text-foreground">{snapshot.reserved}</span> reserved
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((s) => {
            const selected = target === s.value;
            const isCurrent = s.value === property.status;
            return (
              <button
                key={s.value}
                type="button"
                disabled={isCurrent}
                onClick={() => setTarget(s.value)}
                className={
                  "text-left rounded-lg border-2 px-3 py-2 transition-colors " +
                  (selected ? s.tone : "border-border bg-card/30 hover:bg-accent/30") +
                  (isCurrent ? " opacity-50 cursor-not-allowed" : "")
                }
              >
                <div className="text-sm font-medium flex items-center gap-2">
                  {s.label}
                  {isCurrent && <span className="text-[10px] uppercase tracking-wide opacity-70">(current)</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.help}</div>
              </button>
            );
          })}
        </div>

        {needsReason && (
          <>
            <Field label="Reason">
              <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASON_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Remarks (optional)">
              <textarea className={textareaClass} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </Field>
          </>
        )}

        {blocked && (
          <div className="rounded-lg border-2 border-rose-500/60 bg-rose-500/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-rose-600 text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              Cannot change status — {blocked.occupied} bed{blocked.occupied === 1 ? "" : "s"} occupied, {blocked.reserved} reserved
            </div>
            <div className="text-xs text-muted-foreground">
              Transfer or cancel these assignments first, then try again.
            </div>
            {blocked.sample_employees.length > 0 && (
              <ul className="text-xs space-y-1">
                {blocked.sample_employees.map((s) => (
                  <li key={s.employee_id} className="flex items-center justify-between gap-2 rounded-md bg-card/60 px-2 py-1">
                    <span>
                      <Link href={`/employees/${s.employee_id}`} className="font-medium hover:text-primary">{s.employee_name}</Link>
                      {" "}<span className="font-mono text-muted-foreground">({s.employee_code})</span>
                      {" "}— bed <span className="font-mono">{s.bed_code}</span>
                    </span>
                    <Link href={`/transactions/transfers/new`} className="text-primary hover:underline">Transfer →</Link>
                  </li>
                ))}
                {blocked.occupied > blocked.sample_employees.length && (
                  <li className="text-muted-foreground">…and {blocked.occupied - blocked.sample_employees.length} more.</li>
                )}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Close</button>
          <button
            type="submit"
            disabled={busy || target === property.status || (needsReason && !reason)}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Saving…" : "Apply status"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function statusBadgeClass(s: string): string {
  if (s === "active") return "bg-emerald-500/10 text-emerald-600";
  if (s === "on_hold") return "bg-amber-500/10 text-amber-600";
  if (s === "maintenance") return "bg-sky-500/10 text-sky-600";
  return "bg-muted text-muted-foreground";
}

