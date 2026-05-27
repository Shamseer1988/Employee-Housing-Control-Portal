"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";

type Property = { id: number; code: string; name: string; status: string };
type Floor = { id: number; floor_number: string; rooms: Room[] };
type Room = { id: number; room_number: string; occupancy_status: string; beds: Bed[] };
type Bed = { id: number; bed_code: string; status: string };

const ENTITY_TYPES = [
  { value: "property", label: "Property" },
  { value: "room", label: "Room" },
  { value: "bed", label: "Bed" },
] as const;

export default function NewMaintenancePage() {
  const router = useRouter();

  const [entityType, setEntityType] = useState<"property" | "room" | "bed">("bed");
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [structure, setStructure] = useState<Floor[]>([]);
  const [roomId, setRoomId] = useState("");
  const [bedId, setBedId] = useState("");

  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedEnd, setExpectedEnd] = useState("");
  const [remarks, setRemarks] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/properties").then((r) => setProperties(r.data.data));
  }, []);

  useEffect(() => {
    if (!propertyId) { setStructure([]); return; }
    api.get(`/properties/${propertyId}/structure`).then((r) => setStructure(r.data.data));
    setRoomId(""); setBedId("");
  }, [propertyId]);

  const rooms = useMemo(() => structure.flatMap((f) => f.rooms.map((r) => ({ floor: f.floor_number, ...r }))), [structure]);
  const selectedRoom = useMemo(() => rooms.find((r) => String(r.id) === roomId) ?? null, [rooms, roomId]);

  const targetId: number | null = (() => {
    if (entityType === "property") return propertyId ? Number(propertyId) : null;
    if (entityType === "room") return roomId ? Number(roomId) : null;
    return bedId ? Number(bedId) : null;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    setBusy(true); setError(null);
    try {
      const resp = await api.post("/maintenance", {
        entity_type: entityType,
        entity_id: targetId,
        reason: reason || null,
        start_date: startDate,
        expected_end_date: expectedEnd || null,
        remarks: remarks || null,
      });
      const txn = resp.data.data.transaction_number;
      router.replace(`/transactions/maintenance?posted=${encodeURIComponent(txn)}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Post failed");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions/maintenance" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to maintenance
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">New maintenance</h1>
        <p className="text-sm text-muted-foreground">
          Block a property, room, or bed for maintenance. Completing the record restores the previous status.
        </p>
      </div>

      <form onSubmit={submit} className="glass rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Target type">
            <select className={selectClass} value={entityType} onChange={(e) => setEntityType(e.target.value as "property" | "room" | "bed")}>
              {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Property" span={2}>
            <select className={selectClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Select property…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </Field>
        </div>

        {entityType !== "property" && propertyId && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Room">
              <select className={selectClass} value={roomId} onChange={(e) => { setRoomId(e.target.value); setBedId(""); }}>
                <option value="">Select room…</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    Floor {r.floor} · Room {r.room_number} ({r.occupancy_status})
                  </option>
                ))}
              </select>
            </Field>
            {entityType === "bed" && (
              <Field label="Bed">
                <select className={selectClass} value={bedId} onChange={(e) => setBedId(e.target.value)} disabled={!selectedRoom}>
                  <option value="">Select bed…</option>
                  {(selectedRoom?.beds ?? []).map((b) => (
                    <option key={b.id} value={b.id} disabled={b.status === "occupied" || b.status === "reserved"}>
                      {b.bed_code} ({b.status})
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Reason">
            <input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. broken AC, deep clean" />
          </Field>
          <Field label="Start date">
            <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="Expected end date">
            <input type="date" className={inputClass} value={expectedEnd} onChange={(e) => setExpectedEnd(e.target.value)} />
          </Field>
        </div>

        <Field label="Remarks"><textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex justify-end pt-2">
          <button type="submit" disabled={busy || !targetId}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Starting…" : "Start maintenance"}
          </button>
        </div>
      </form>
    </div>
  );
}
