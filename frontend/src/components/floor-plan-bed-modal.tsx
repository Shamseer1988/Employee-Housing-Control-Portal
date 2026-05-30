"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, LogOut, UserPlus, Wrench, Lock, ExternalLink } from "lucide-react";
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
  if (!bed || !room) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Bed ${bed.bed_code}`} size="lg">
      {bed.status === "empty" && (
        <AssignSection bed={bed} room={room} onDone={() => { onChanged(); onClose(); }} />
      )}
      {bed.status === "occupied" && (
        <OccupiedSection bed={bed} onClose={onClose} />
      )}
      {bed.status === "reserved" && (
        <ReservedSection bed={bed} />
      )}
      {(bed.status === "maintenance" || bed.status === "blocked") && (
        <BlockedSection bed={bed} onDone={() => { onChanged(); onClose(); }} />
      )}
    </Modal>
  );
}

function AssignSection({
  bed, room, onDone,
}: { bed: FloorPlanBed; room: FloorPlanRoom; onDone: () => void }) {
  const [selected, setSelected] = useState<PickerEmployee | null>(null);
  const [assignmentDate, setAssignmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("new_joiner");
  const [stayPeriod, setStayPeriod] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);

  // Mirror the existing assign-new page's eligibility filter so we don't
  // surface employees the backend would reject.
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
    <Can perm="assignment.create" fallback={
      <div className="text-sm text-muted-foreground">You don&apos;t have permission to post assignments.</div>
    }>
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
            <input type="date" className={inputClass} value={assignmentDate}
              onChange={(e) => setAssignmentDate(e.target.value)} />
          </Field>
          <Field label="Reason">
            <input className={inputClass} value={reason}
              onChange={(e) => setReason(e.target.value)} placeholder="new_joiner, transfer_in…" />
          </Field>
          <Field label="Expected stay (optional)">
            <input className={inputClass} value={stayPeriod}
              onChange={(e) => setStayPeriod(e.target.value)} placeholder="e.g. 6 months" />
          </Field>
        </div>
        <Field label="Remarks">
          <textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
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
  const Icon = bed.status === "maintenance" ? Wrench : Lock;
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4" />
        Bed <span className="font-mono">{bed.bed_code}</span> is currently <span className="font-medium">{bed.status}</span>.
      </div>
      <Can perm="bed.manage" fallback={
        <div className="text-xs text-muted-foreground">
          Ask an operator with <span className="font-mono">bed.manage</span> to take this bed back into service.
        </div>
      }>
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
