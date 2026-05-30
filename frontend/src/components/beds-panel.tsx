"use client";

import { useEffect, useState } from "react";
import { Pencil, Wrench, Lock, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { toast, errorMessage } from "@/components/ui/toast";

export type Bed = {
  id: number;
  bed_number: string;
  bed_code: string;
  bed_type: string;
  status: string;
  remarks: string | null;
};

export const BED_TYPES = ["single", "bunk_upper", "bunk_lower"];

export const BED_STATUS_TONE: Record<string, string> = {
  empty: "bg-muted text-muted-foreground",
  occupied: "bg-emerald-500/10 text-emerald-600",
  reserved: "bg-sky-500/10 text-sky-600",
  maintenance: "bg-amber-500/10 text-amber-600",
  blocked: "bg-rose-500/10 text-rose-600",
};

export type BedsPanelRoom = {
  id: number;
  capacity: number;
};

export function BedsPanel({ room, onChanged, onEditRoom }: {
  room: BedsPanelRoom;
  onChanged: () => void;
  onEditRoom: () => void;
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

  // Phase 5: drive the Add-bed gate off our own fetched list. The
  // parent's room.bed_counts.total used to lag by one render, leaving
  // the Add button disabled even when capacity wasn't yet full.
  const atCapacity = beds.length >= room.capacity;

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
            aria-label="New bed number"
            className="h-8 flex-1 rounded-md border border-input bg-card/60 px-2 text-sm"
          />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            aria-label="Bed type for new bed"
            className="h-8 rounded-md border border-input bg-card/60 px-2 text-sm">
            {BED_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
          </select>
          <button onClick={create} disabled={adding || !newNumber.trim() || atCapacity}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {adding ? "…" : "Add bed"}
          </button>
        </div>
        {atCapacity && (
          <div className="text-[11px] text-muted-foreground pt-1">
            Room at capacity ({beds.length}/{room.capacity}). Increase capacity or remove a bed to add another.
          </div>
        )}
      </Can>
    </div>
  );
}
