"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BedDouble, Building2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";
import { toast, errorMessage } from "@/components/ui/toast";

type Employee = {
  id: number;
  code: string;
  full_name: string;
  qid_number: string | null;
  gender: string | null;
  accommodation_required: boolean;
  accommodation_type: string | null;
  status: string;
  current_bed: { id: number; bed_code: string } | null;
  division: { id: number; name: string } | null;
};

type Property = { id: number; code: string; name: string; status: string };

type AvailableBed = {
  id: number;
  bed_code: string;
  bed_type: string;
  bed_number: string;
  room: { id: number; room_number: string; room_type: string; allowed_gender: string; capacity: number; has_bathroom: boolean; has_ac: boolean };
  floor: { id: number; floor_number: string };
  property: { id: number; code: string; name: string };
};

export default function NewAssignmentPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: employee
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empQ, setEmpQ] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);

  // Step 2: bed
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [beds, setBeds] = useState<AvailableBed[]>([]);
  const [bedsLoading, setBedsLoading] = useState(false);
  const [bed, setBed] = useState<AvailableBed | null>(null);

  // Step 3: details
  const [assignmentDate, setAssignmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("new_joiner");
  const [stayPeriod, setStayPeriod] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [e, p] = await Promise.all([
        api.get("/employees", { params: { accommodation: "yes" } }),
        api.get("/properties", { params: { status: "active" } }),
      ]);
      setEmployees(e.data.data);
      setProperties(p.data.data);
    })();
  }, []);

  const filteredEmployees = useMemo(() => {
    const q = empQ.trim().toLowerCase();
    return employees.filter((e) => {
      if (e.current_bed) return false;
      if (e.status === "terminated" || e.status === "resigned" || e.status === "visa_cancelled") return false;
      if (!q) return true;
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.qid_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, empQ]);

  useEffect(() => {
    if (step !== 2 || !employee) return;
    setBedsLoading(true);
    const params: Record<string, string> = { employee_id: String(employee.id) };
    if (propertyId) params.property_id = propertyId;
    api.get("/beds/available", { params })
      .then((r) => setBeds(r.data.data))
      .finally(() => setBedsLoading(false));
  }, [step, employee, propertyId]);

  const submit = async () => {
    if (!employee || !bed) return;
    setSubmitting(true);
    setError(null);
    try {
      const resp = await api.post("/assignments", {
        employee_id: employee.id,
        bed_id: bed.id,
        assignment_date: assignmentDate,
        reason,
        expected_stay_period: stayPeriod || null,
        remarks: remarks || null,
      });
      const txn = resp.data.data.transaction_number;
      toast.success(`Assignment ${txn} posted`);
      router.replace(`/transactions/assignments`);
    } catch (err: unknown) {
      toast.error("Post failed", errorMessage(err));
      setError(errorMessage(err, "Post failed"));
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions/assignments" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to assignments
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">New assignment</h1>
        <p className="text-sm text-muted-foreground">Allocate an empty bed to an unassigned employee.</p>
      </div>

      <Stepper step={step} />

      {step === 1 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <input
              value={empQ}
              onChange={(e) => setEmpQ(e.target.value)}
              placeholder="Search by name, code, QID…"
              className="h-9 w-full max-w-sm rounded-md border border-input bg-card/60 px-3 text-sm"
            />
            <div className="text-xs text-muted-foreground">{filteredEmployees.length} unassigned employees</div>
          </div>

          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border sticky top-0 bg-card/60 backdrop-blur">
                <tr>
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Division</th>
                  <th className="py-2 pr-4">Gender</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => {
                  const selected = employee?.id === e.id;
                  return (
                    <tr key={e.id} className={"border-b border-border/60 cursor-pointer " + (selected ? "bg-primary/10" : "hover:bg-accent/30")}
                        onClick={() => setEmployee(e)}>
                      <td className="py-2 pr-4 font-mono text-xs">{e.code}</td>
                      <td className="py-2 pr-4 font-medium">{e.full_name}</td>
                      <td className="py-2 pr-4">{e.division?.name ?? "—"}</td>
                      <td className="py-2 pr-4 capitalize">{e.gender ?? "—"}</td>
                      <td className="py-2 pr-4">{e.accommodation_type?.replaceAll("_", " ") ?? "—"}</td>
                      <td className="py-2 pr-4 text-right">
                        {selected && <CheckCircle2 className="h-4 w-4 text-primary inline" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

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
              Choosing bed for <span className="font-medium">{employee.full_name}</span>
              {employee.gender && <span className="text-muted-foreground"> · gender {employee.gender}</span>}
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
                      {b.room.allowed_gender !== "any" && <span className="rounded-full bg-muted px-2 py-0.5">{b.room.allowed_gender}</span>}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Employee</div>
              <div className="font-medium">{employee.full_name}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{employee.code}</span>
                {employee.qid_number && <> · QID {employee.qid_number}</>}
                {employee.division && <> · {employee.division.name}</>}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Bed</div>
              <div className="font-mono text-sm">{bed.bed_code}</div>
              <div className="text-xs text-muted-foreground">
                {bed.property.name} · Floor {bed.floor.floor_number} · Room {bed.room.room_number}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Assignment date">
              <input type="date" className={inputClass} value={assignmentDate} onChange={(e) => setAssignmentDate(e.target.value)} />
            </Field>
            <Field label="Reason">
              <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="new_joiner">New joiner</option>
                <option value="returning_from_vacation">Returning from vacation</option>
                <option value="transfer_in">Transfer in</option>
                <option value="re_accommodation">Re-accommodation</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Expected stay period" span={2}>
              <input className={inputClass} value={stayPeriod} onChange={(e) => setStayPeriod(e.target.value)} placeholder="e.g. 12 months" />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Back</button>
            <button disabled={submitting} onClick={submit}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {submitting ? "Posting…" : "Post assignment"}
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
    { i: 2 as const, label: "Bed" },
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
