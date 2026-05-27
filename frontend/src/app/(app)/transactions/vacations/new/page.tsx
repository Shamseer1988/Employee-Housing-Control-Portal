"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputClass, textareaClass } from "@/components/ui/dialog";
import { EmployeePicker, type PickerEmployee } from "@/components/employee-picker";

export default function NewVacationPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [employee, setEmployee] = useState<PickerEmployee | null>(null);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState("");
  const [reserve, setReserve] = useState(true);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!employee) return;
    setSubmitting(true); setError(null);
    try {
      const resp = await api.post("/vacations", {
        employee_id: employee.id,
        vacation_start_date: start,
        vacation_end_date: end || null,
        keep_bed_reserved: reserve,
        remarks: remarks || null,
      });
      const txn = resp.data.data.transaction_number;
      router.replace(`/transactions/vacations?posted=${encodeURIComponent(txn)}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Post failed");
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions/vacations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to vacations
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">Record vacation</h1>
        <p className="text-sm text-muted-foreground">Mark an employee as on leave. Choose whether to hold their bed.</p>
      </div>

      {step === 1 && (
        <div className="glass rounded-xl p-4 space-y-3">
          <EmployeePicker
            filter={(e) => e.status !== "terminated" && e.status !== "resigned" && e.status !== "visa_cancelled"}
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
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Employee</div>
            <div className="font-medium">{employee.full_name}</div>
            <div className="text-xs text-muted-foreground">
              <span className="font-mono">{employee.code}</span>
              {employee.current_bed && <> · current bed <span className="font-mono">{employee.current_bed.bed_code}</span></>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vacation start">
              <input required type="date" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Vacation end (optional)">
              <input type="date" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          {employee.current_bed && (
            <label className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-3 cursor-pointer">
              <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} className="mt-1" />
              <div>
                <div className="text-sm font-medium">Keep bed reserved</div>
                <div className="text-xs text-muted-foreground">
                  On — the bed sits in <span className="font-mono">reserved</span> status and waits for them to return.
                  Off — the bed is released back to <span className="font-mono">empty</span> and the assignment closes; a new assignment will be needed on return.
                </div>
              </div>
            </label>
          )}
          <Field label="Remarks"><textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
          {error && <div className="text-sm text-destructive">{error}</div>}
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Back</button>
            <button disabled={submitting} onClick={submit} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {submitting ? "Recording…" : "Record vacation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
