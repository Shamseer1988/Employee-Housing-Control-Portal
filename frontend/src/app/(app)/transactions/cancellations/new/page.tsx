"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";
import { EmployeePicker, type PickerEmployee } from "@/components/employee-picker";

const REASONS = [
  { value: "resigned", label: "Resigned" },
  { value: "terminated", label: "Terminated" },
  { value: "visa_cancelled", label: "Visa cancelled / final exit" },
  { value: "shifted_outside", label: "Shifted outside company accommodation" },
  { value: "vacation", label: "Vacation" },
  { value: "other", label: "Other" },
];

export default function NewCancellationPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [employee, setEmployee] = useState<PickerEmployee | null>(null);
  const [reason, setReason] = useState("resigned");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!employee) return;
    setSubmitting(true); setError(null);
    try {
      const resp = await api.post("/cancellations", {
        employee_id: employee.id,
        reason,
        cancellation_date: date,
        remarks: remarks || null,
      });
      const txn = resp.data.data.transaction_number;
      router.replace(`/transactions/cancellations?posted=${encodeURIComponent(txn)}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Post failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions/cancellations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to cancellations
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">New cancellation</h1>
        <p className="text-sm text-muted-foreground">Release an active bed. Employee status auto-updates for resigned / terminated / visa cancelled.</p>
      </div>

      {step === 1 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <EmployeePicker
            filter={(e) => !!e.current_bed}
            selected={employee}
            onSelect={setEmployee}
          />
          <div className="flex justify-end">
            <button disabled={!employee} onClick={() => setStep(2)} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 2 && employee && (
        <div className="glass rounded-xl p-4 space-y-4">
          <div className="rounded-lg border border-border bg-card/40 p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Releasing</div>
            <div className="font-medium">{employee.full_name}</div>
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">{employee.code}</span> · current bed{" "}
              <span className="font-mono">{employee.current_bed?.bed_code}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reason">
              <select className={selectClass} value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Date">
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          <Field label="Remarks">
            <textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Back</button>
            <button disabled={submitting} onClick={submit} className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60">
              {submitting ? "Posting…" : "Post cancellation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
