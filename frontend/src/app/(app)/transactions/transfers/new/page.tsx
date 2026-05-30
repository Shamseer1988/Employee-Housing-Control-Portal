"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BedDouble, Building2, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";
import { toast, errorMessage } from "@/components/ui/toast";
import { EmployeePicker, type PickerEmployee } from "@/components/employee-picker";

type Property = { id: number; code: string; name: string; status: string };

type AvailableBed = {
  id: number;
  bed_code: string;
  bed_type: string;
  room: { id: number; room_number: string; room_type: string; allowed_gender: string; has_bathroom: boolean; has_ac: boolean };
  floor: { id: number; floor_number: string };
  property: { id: number; code: string; name: string };
};

export default function NewTransferPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [employee, setEmployee] = useState<PickerEmployee | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [beds, setBeds] = useState<AvailableBed[]>([]);
  const [bed, setBed] = useState<AvailableBed | null>(null);
  const [bedsLoading, setBedsLoading] = useState(false);

  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("bed_change");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get("/properties", { params: { status: "active" } }).then((r) => setProperties(r.data.data));
  }, []);

  useEffect(() => {
    if (step !== 2 || !employee) return;
    setBedsLoading(true);
    const params: Record<string, string> = { employee_id: String(employee.id) };
    if (propertyId) params.property_id = propertyId;
    api.get("/beds/available", { params })
      .then((r) => {
        // Hide the employee's current bed
        const cur = employee.current_bed?.id;
        setBeds(r.data.data.filter((b: AvailableBed) => b.id !== cur));
      })
      .finally(() => setBedsLoading(false));
  }, [step, employee, propertyId]);

  const submit = async () => {
    if (!employee || !bed) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await api.post("/transfers", {
        employee_id: employee.id,
        to_bed_id: bed.id,
        transfer_date: transferDate,
        reason,
        remarks: remarks || null,
      });
      const txn = resp.data.data.transaction_number;
      toast.success(`Transfer ${txn} posted`);
      router.replace(`/transactions/transfers`);
    } catch (err: unknown) {
      toast.error("Post failed", errorMessage(err));
      setError(errorMessage(err, "Post failed"));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions/transfers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to transfers
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">New transfer</h1>
        <p className="text-sm text-muted-foreground">Move an already-assigned employee to a different bed.</p>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <EmployeePicker
            filter={(e) =>
              !!e.current_bed && e.status !== "terminated" && e.status !== "visa_cancelled" && e.status !== "resigned"
            }
            selected={employee}
            onSelect={setEmployee}
          />
          <div className="flex justify-end">
            <button disabled={!employee} onClick={() => setStep(2)}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && employee && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm">
              Transferring <span className="font-medium">{employee.full_name}</span>
              {" "}from <span className="font-mono text-xs">{employee.current_bed?.bed_code}</span>
            </div>
            <select className={selectClass + " w-64"} value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setBed(null); }}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
            </select>
          </div>
          {bedsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Loading available beds…</div>
          ) : beds.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No available beds match this filter.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {beds.map((b) => {
                const selected = bed?.id === b.id;
                return (
                  <button key={b.id} onClick={() => setBed(b)} type="button"
                    className={"text-left rounded-lg border p-3 transition-colors " +
                      (selected ? "border-primary bg-primary/10" : "border-border bg-card/60 hover:bg-accent/30")}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-xs">{b.bed_code}</div>
                        <div className="mt-1 text-sm font-medium flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> {b.property.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Floor {b.floor.floor_number} · Room {b.room.room_number} · {b.room.room_type}
                        </div>
                      </div>
                      <BedDouble className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                      <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{b.bed_type.replace("_", " ")}</span>
                      {b.room.has_bathroom && <span className="rounded-full bg-muted px-2 py-0.5">bathroom</span>}
                      {b.room.has_ac && <span className="rounded-full bg-muted px-2 py-0.5">AC</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Back</button>
            <button disabled={!bed} onClick={() => setStep(3)}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 3 && employee && bed && (
        <div className="glass rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm items-center">
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Employee</div>
              <div className="font-medium">{employee.full_name}</div>
              <div className="text-xs text-muted-foreground"><span className="font-mono">{employee.code}</span></div>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                From <ArrowRight className="h-3 w-3" /> To
              </div>
              <div className="font-mono text-xs">{employee.current_bed?.bed_code} → {bed.bed_code}</div>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Destination</div>
              <div className="text-sm">{bed.property.name}</div>
              <div className="text-xs text-muted-foreground">Floor {bed.floor.floor_number} · Room {bed.room.room_number}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Transfer date">
              <input type="date" className={inputClass} value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </Field>
            <Field label="Reason">
              <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="bed_change">Bed change</option>
                <option value="room_change">Room change</option>
                <option value="property_change">Property change</option>
                <option value="request">Employee request</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Remarks"><textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Back</button>
            <button disabled={submitting} onClick={submit}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {submitting ? "Posting…" : "Post transfer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items = [
    { i: 1 as const, label: "Employee" },
    { i: 2 as const, label: "New bed" },
    { i: 3 as const, label: "Confirm" },
  ];
  return (
    <div className="flex items-center gap-2">
      {items.map(({ i, label }, idx) => {
        const active = step === i;
        const done = step > i;
        return (
          <div key={i} className="flex items-center gap-2">
            <div className={
              "h-7 w-7 grid place-items-center rounded-full text-xs font-medium " +
              (active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500/20 text-emerald-600" : "bg-muted text-muted-foreground")
            }>{done ? "✓" : i}</div>
            <span className={"text-sm " + (active ? "font-medium" : "text-muted-foreground")}>{label}</span>
            {idx < items.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
          </div>
        );
      })}
    </div>
  );
}
