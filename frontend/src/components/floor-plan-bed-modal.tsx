"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, LogOut, UserPlus, Wrench, Lock, ExternalLink, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { Modal, Field, inputClass, textareaClass } from "@/components/ui/dialog";
import { toast, errorMessage } from "@/components/ui/toast";
import { Can } from "@/components/can";
import { EmployeePicker, type PickerEmployee } from "@/components/employee-picker";

export type FloorPlanBed = {
  id: number;
  bed_code: string;
  bed_number: string | null;
  bed_type: string;
  status: string;
  current_employee: {
    id: number;
    code: string;
    full_name: string;
    division_name: string | null;
    designation: string | null;
  } | null;
};

export type FloorPlanRoom = {
  id: number;
  room_number: string;
  allowed_gender: string;
};

type Mode = "default" | "maintenance" | "block";

export function BedActionModal({
  open,
  bed,
  room,
  onClose,
  onChanged,
}: {
  open: boolean;
  bed: FloorPlanBed | null;
  room: FloorPlanRoom | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("default");

  // Reset mode whenever the modal opens with a new bed.
  useEffect(() => {
    if (open) setMode("default");
  }, [open, bed?.id]);

  if (!bed || !room) return null;

  const done = () => {
    onChanged();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={`Bed ${bed.bed_code}`} size="lg">
      {bed.status === "empty" && mode === "default" && (
        <AssignSection bed={bed} room={room} onDone={done} onMaintenance={() => setMode("maintenance")} onBlock={() => setMode("block")} />
      )}
      {bed.status === "empty" && mode === "maintenance" && (
        <MaintenanceSection bed={bed} onDone={done} onBack={() => setMode("default")} />
      )}
      {bed.status === "empty" && mode === "block" && (
        <BlockSection bed={bed} onDone={done} onBack={() => setMode("default")} />
      )}
      {bed.status === "occupied" && <OccupiedSection bed={bed} onClose={onClose} />}
      {bed.status === "reserved" && <ReservedSection bed={bed} />}
      {bed.status === "maintenance" && <MaintenanceActiveSection bed={bed} onDone={done} />}
      {bed.status === "blocked" && <BlockedSection bed={bed} onDone={done} />}
    </Modal>
  );
}

function AssignSection({
  bed,
  room,
  onDone,
  onMaintenance,
  onBlock,
}: {
  bed: FloorPlanBed;
  room: FloorPlanRoom;
  onDone: () => void;
  onMaintenance: () => void;
  onBlock: () => void;
}) {
  const [selected, setSelected] = useState<PickerEmployee | null>(null);
  const [assignmentDate, setAssignmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("new_joiner");
  const [stayPeriod, setStayPeriod] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const filter = (e: PickerEmployee) => {
    if (e.current_bed) return false;
    if (!e.accommodation_required) return false;
    if (e.status !== "active") return false;
    if (room.allowed_gender !== "any" && e.gender && e.gender !== room.allowed_gender) return false;
    return true;
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post("/assignments", {
        employee_id: selected.id,
        bed_id: bed.id,
        assignment_date: assignmentDate,
        expected_stay_period: stayPeriod || undefined,
        reason: reason || undefined,
        remarks: remarks || undefined,
      });
      toast.success(`${selected.full_name} → ${bed.bed_code}`);
      onDone();
    } catch (err: unknown) {
      toast.error("Assignment failed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Can
      perm="assignment.create"
      fallback={
        <div className="text-sm text-muted-foreground">
          You don&apos;t have permission to post assignments.
        </div>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Pick an employee to assign to <span className="font-mono">{bed.bed_code}</span>
          {room.allowed_gender !== "any" && (
            <> · room only accepts <span className="capitalize">{room.allowed_gender}</span></>
          )}
        </div>
        <EmployeePicker filter={filter} selected={selected} onSelect={setSelected} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Assignment date">
            <input
              type="date"
              className={inputClass}
              value={assignmentDate}
              onChange={(e) => setAssignmentDate(e.target.value)}
            />
          </Field>
          <Field label="Reason">
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="new_joiner, transfer_in…"
            />
          </Field>
          <Field label="Expected stay (optional)">
            <input
              className={inputClass}
              value={stayPeriod}
              onChange={(e) => setStayPeriod(e.target.value)}
              placeholder="e.g. 6 months"
            />
          </Field>
        </div>
        <Field label="Remarks">
          <textarea
            className={textareaClass}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <button
            disabled={!selected || busy}
            onClick={submit}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? "Posting…" : selected ? `Assign ${selected.full_name}` : "Pick an employee"}
          </button>
        </div>

        {/* Take out of service */}
        <Can perm="bed.manage">
          <div className="border-t border-border/60 pt-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Or take this bed out of service
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onMaintenance}
                className="group inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-amber-500/5 hover:bg-amber-500/10 px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="grid place-items-center h-7 w-7 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Wrench className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="font-medium block leading-tight">Maintenance</span>
                    <span className="text-[10px] text-muted-foreground">Creates a transaction</span>
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
              </button>
              <button
                type="button"
                onClick={onBlock}
                className="group inline-flex items-center justify-between gap-2 rounded-lg border border-border bg-rose-500/5 hover:bg-rose-500/10 px-3 py-2 text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <span className="grid place-items-center h-7 w-7 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400">
                    <Lock className="h-3.5 w-3.5" />
                  </span>
                  <span>
                    <span className="font-medium block leading-tight">Block</span>
                    <span className="text-[10px] text-muted-foreground">Admin status flag</span>
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
              </button>
            </div>
          </div>
        </Can>
      </div>
    </Can>
  );
}

function MaintenanceSection({
  bed, onDone, onBack,
}: { bed: FloorPlanBed; onDone: () => void; onBack: () => void }) {
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedEnd, setExpectedEnd] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!reason.trim()) {
      toast.error("Reason required", "Tell maintenance crew what's wrong.");
      return;
    }
    setBusy(true);
    try {
      const r = await api.post("/maintenance", {
        entity_type: "bed",
        entity_id: bed.id,
        reason: reason.trim(),
        start_date: startDate || undefined,
        expected_end_date: expectedEnd || undefined,
        remarks: remarks || undefined,
      });
      const txn = r.data?.data?.transaction_number ?? "record";
      toast.success(`${bed.bed_code} marked for maintenance`, `Transaction ${txn} created`);
      onDone();
    } catch (err: unknown) {
      toast.error("Could not start maintenance", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Can perm="maintenance.manage" fallback={
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          You don&apos;t have permission to start a maintenance transaction.
        </div>
        <button onClick={onBack} className="text-xs text-primary hover:underline">← Back</button>
      </div>
    }>
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/30 p-3 text-sm flex items-start gap-2">
          <Wrench className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            Starting a maintenance window for <span className="font-mono">{bed.bed_code}</span>.
            This creates a row in <span className="font-medium">Transactions → Maintenance</span>{" "}
            so the work is tracked end-to-end.
          </div>
        </div>
        <Field label="Reason *">
          <input
            className={inputClass}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. broken bed frame, AC repair, deep clean"
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </Field>
          <Field label="Expected end (optional)">
            <input
              type="date"
              className={inputClass}
              value={expectedEnd}
              onChange={(e) => setExpectedEnd(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Remarks (optional)">
          <textarea
            className={textareaClass}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </Field>
        <div className="flex items-center justify-between pt-1">
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </button>
          <button
            onClick={submit}
            disabled={busy || !reason.trim()}
            className="h-9 rounded-md bg-amber-500 px-4 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <Wrench className="h-4 w-4" />
            {busy ? "Submitting…" : "Start maintenance"}
          </button>
        </div>
      </div>
    </Can>
  );
}

function BlockSection({
  bed, onDone, onBack,
}: { bed: FloorPlanBed; onDone: () => void; onBack: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post(`/beds/${bed.id}/status`, { status: "blocked", remarks: remarks || undefined });
      toast.success(`${bed.bed_code} blocked`);
      onDone();
    } catch (err: unknown) {
      toast.error("Could not block bed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Can perm="bed.manage" fallback={
      <div className="space-y-3">
        <div className="text-sm text-muted-foreground">
          You don&apos;t have permission to block this bed.
        </div>
        <button onClick={onBack} className="text-xs text-primary hover:underline">← Back</button>
      </div>
    }>
      <div className="space-y-4">
        <div className="rounded-lg bg-rose-500/5 border border-rose-500/30 p-3 text-sm flex items-start gap-2">
          <Lock className="h-4 w-4 mt-0.5 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            Blocking <span className="font-mono">{bed.bed_code}</span> hides it from the
            assignment flow. Use this for permanent issues that don&apos;t need a maintenance
            transaction (e.g. capacity hold, structural issue, awaiting decommission).
          </div>
        </div>
        <Field label="Remarks (optional)">
          <textarea
            className={textareaClass}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Why is this bed being blocked?"
          />
        </Field>
        <div className="flex items-center justify-between pt-1">
          <button onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="h-9 rounded-md bg-rose-600 px-4 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            <Lock className="h-4 w-4" />
            {busy ? "Submitting…" : "Block bed"}
          </button>
        </div>
      </div>
    </Can>
  );
}

function OccupiedSection({ bed, onClose }: { bed: FloorPlanBed; onClose: () => void }) {
  const emp = bed.current_employee;
  if (!emp) {
    return (
      <div className="text-sm text-muted-foreground">
        Bed shows occupied but no employee is currently linked. Use the audit log or the
        assignments page to investigate.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card/60 p-3 space-y-1">
        <div className="text-base font-semibold">{emp.full_name}</div>
        <div className="text-xs font-mono text-muted-foreground">{emp.code}</div>
        <div className="text-xs text-muted-foreground">
          {emp.designation ?? "—"}
          {emp.division_name ? ` · ${emp.division_name}` : ""}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Link
          href={`/employees/${emp.id}`}
          onClick={onClose}
          className="h-9 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View employee
        </Link>
        <Can perm="assignment.create">
          <Link
            href={`/transactions/transfers/new`}
            onClick={onClose}
            className="h-9 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Initiate transfer
          </Link>
          <Link
            href={`/transactions/vacations/new`}
            onClick={onClose}
            className="h-9 inline-flex items-center justify-center gap-1 rounded-md border border-border bg-card/60 px-3 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-3.5 w-3.5" /> Vacate
          </Link>
        </Can>
      </div>
      <div className="text-xs text-muted-foreground">
        Transfers and vacations are recorded as transactions on the movements pages — they keep
        the audit trail clean.
      </div>
    </div>
  );
}

function ReservedSection({ bed }: { bed: FloorPlanBed }) {
  return (
    <div className="space-y-3">
      <div className="text-sm">
        Bed <span className="font-mono">{bed.bed_code}</span> is reserved.
      </div>
      {bed.current_employee && (
        <div className="rounded-lg border border-border bg-card/60 p-3 text-sm">
          Reserved for <span className="font-medium">{bed.current_employee.full_name}</span>{" "}
          <span className="font-mono text-xs text-muted-foreground">({bed.current_employee.code})</span>
        </div>
      )}
      <div className="text-xs text-muted-foreground">
        Reservations are resolved by completing or cancelling the linked assignment.
      </div>
    </div>
  );
}

type MaintenanceRecord = {
  id: number;
  transaction_number: string;
  start_date: string | null;
  expected_end_date: string | null;
  reason: string | null;
  status: string;
};

function MaintenanceActiveSection({ bed, onDone }: { bed: FloorPlanBed; onDone: () => void }) {
  const [record, setRecord] = useState<MaintenanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actualEnd, setActualEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get("/maintenance", { params: { entity_type: "bed", entity_id: bed.id, status: "in_progress" } })
      .then((r) => {
        if (cancelled) return;
        const list: MaintenanceRecord[] = r.data?.data ?? [];
        setRecord(list[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [bed.id]);

  const complete = async () => {
    if (!record) {
      // Legacy: bed marked maintenance via the old /beds/{id}/status path —
      // no record exists. Fall back to flipping the bed status directly.
      setBusy(true);
      try {
        await api.post(`/beds/${bed.id}/status`, { status: "empty" });
        toast.success(`${bed.bed_code} back in service`);
        onDone();
      } catch (err: unknown) {
        toast.error("Status change failed", errorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await api.post(`/maintenance/${record.id}/complete`, {
        actual_end_date: actualEnd,
        remarks: remarks || undefined,
      });
      toast.success(`Maintenance ${record.transaction_number} completed`);
      onDone();
    } catch (err: unknown) {
      toast.error("Could not complete maintenance", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Can
      perm="maintenance.manage"
      fallback={
        <div className="text-sm text-muted-foreground">
          Ask an operator with <span className="font-mono">maintenance.manage</span> to bring this bed back into service.
        </div>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 text-sm">
          <Wrench className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Bed <span className="font-mono">{bed.bed_code}</span> is currently{" "}
          <span className="font-medium">under maintenance</span>.
        </div>

        {loading ? (
          <div className="text-xs text-muted-foreground">Loading maintenance record…</div>
        ) : record ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-1">
            <div className="font-mono text-xs text-amber-700 dark:text-amber-300">
              {record.transaction_number}
            </div>
            {record.reason && <div className="font-medium">{record.reason}</div>}
            <div className="text-xs text-muted-foreground">
              Started {record.start_date ?? "—"}
              {record.expected_end_date && <> · expected end {record.expected_end_date}</>}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">
            No open maintenance transaction found — falling back to a direct status change.
          </div>
        )}

        {record && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Actual end date">
              <input
                type="date"
                className={inputClass}
                value={actualEnd}
                onChange={(e) => setActualEnd(e.target.value)}
              />
            </Field>
            <Field label="Remarks (optional)">
              <input
                className={inputClass}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </Field>
          </div>
        )}

        <div className="flex justify-end">
          <button
            disabled={busy || loading}
            onClick={complete}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1.5"
          >
            {busy ? "Updating…" : record ? "Complete maintenance" : "Mark empty (back in service)"}
          </button>
        </div>
      </div>
    </Can>
  );
}

function BlockedSection({ bed, onDone }: { bed: FloorPlanBed; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const markEmpty = async () => {
    setBusy(true);
    try {
      await api.post(`/beds/${bed.id}/status`, { status: "empty" });
      toast.success(`${bed.bed_code} marked empty`);
      onDone();
    } catch (err: unknown) {
      toast.error("Status change failed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 text-sm">
        <Lock className="h-4 w-4 text-rose-600 dark:text-rose-400" />
        Bed <span className="font-mono">{bed.bed_code}</span> is currently{" "}
        <span className="font-medium">blocked</span>.
      </div>
      <Can
        perm="bed.manage"
        fallback={
          <div className="text-xs text-muted-foreground">
            Ask an operator with <span className="font-mono">bed.manage</span> to take this bed back into service.
          </div>
        }
      >
        <button
          disabled={busy}
          onClick={markEmpty}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "Updating…" : "Mark empty (back in service)"}
        </button>
      </Can>
    </div>
  );
}
