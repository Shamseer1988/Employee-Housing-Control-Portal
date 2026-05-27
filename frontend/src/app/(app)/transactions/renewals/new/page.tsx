"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";

type Property = {
  id: number;
  code: string;
  name: string;
  status: string;
  active_agreement: {
    id: number;
    landlord: { id: number; code: string; name: string };
    expiry_date: string;
    monthly_rent: number | null;
    payment_terms: string | null;
    notice_period: string | null;
  } | null;
};
type Landlord = { id: number; code: string; name: string };

export default function NewRenewalPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [landlordId, setLandlordId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [agreementNumber, setAgreementNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("");
  const [reminderDays, setReminderDays] = useState("90");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [p, l] = await Promise.all([
        api.get("/properties"),
        api.get("/landlords"),
      ]);
      setProperties(p.data.data);
      setLandlords(l.data.data);
    })();
  }, []);

  const selected = useMemo(
    () => properties.find((p) => String(p.id) === propertyId) ?? null,
    [properties, propertyId],
  );

  // When the property changes, default the landlord and rent from the active agreement
  useEffect(() => {
    if (!selected) return;
    if (selected.active_agreement) {
      setLandlordId(String(selected.active_agreement.landlord.id));
      if (selected.active_agreement.monthly_rent != null && !monthlyRent) {
        setMonthlyRent(String(selected.active_agreement.monthly_rent));
      }
      if (selected.active_agreement.payment_terms && !paymentTerms) {
        setPaymentTerms(selected.active_agreement.payment_terms);
      }
      if (selected.active_agreement.notice_period && !noticePeriod) {
        setNoticePeriod(selected.active_agreement.notice_period);
      }
    }
  }, [selected]);  // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const resp = await api.post("/renewals", {
        property_id: Number(propertyId),
        landlord_id: Number(landlordId),
        new_start_date: startDate,
        new_expiry_date: expiryDate,
        new_monthly_rent: monthlyRent ? Number(monthlyRent) : null,
        agreement_number: agreementNumber || null,
        payment_terms: paymentTerms || null,
        notice_period: noticePeriod || null,
        reminder_days_before_expiry: Number(reminderDays || 90),
        remarks: remarks || null,
      });
      const txn = resp.data.data.transaction_number;
      router.replace(`/transactions/renewals?posted=${encodeURIComponent(txn)}`);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Post failed");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions/renewals" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to renewals
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">New landlord renewal</h1>
        <p className="text-sm text-muted-foreground">Archives the property&apos;s active agreement and starts a new one in one transaction.</p>
      </div>

      <form onSubmit={submit} className="glass rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Property" span={2}>
            <select required className={selectClass} value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">Select a property…</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
              ))}
            </select>
          </Field>
        </div>

        {selected && (
          <div className="rounded-lg border border-border bg-card/40 p-3 text-sm flex gap-3">
            <Building2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            {selected.active_agreement ? (
              <div>
                <div className="font-medium">Active agreement</div>
                <div className="text-xs text-muted-foreground">
                  {selected.active_agreement.landlord.name} · expires{" "}
                  <span className="font-mono">{selected.active_agreement.expiry_date}</span>
                  {selected.active_agreement.monthly_rent != null && <> · rent {selected.active_agreement.monthly_rent.toLocaleString()}</>}
                </div>
                <div className="text-xs text-amber-600 inline-flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" /> Posting will archive this and create a new active agreement.
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium">No active agreement</div>
                <div className="text-xs text-muted-foreground">This will create the first agreement for the property.</div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Landlord">
            <select required className={selectClass} value={landlordId} onChange={(e) => setLandlordId(e.target.value)}>
              <option value="">Select landlord…</option>
              {landlords.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.code})</option>)}
            </select>
          </Field>
          <Field label="Agreement number">
            <input className={inputClass} value={agreementNumber} onChange={(e) => setAgreementNumber(e.target.value)} />
          </Field>
          <Field label="New start date">
            <input required type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="New expiry date">
            <input required type="date" className={inputClass} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </Field>
          <Field label="New monthly rent">
            <input type="number" step="0.01" className={inputClass} value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} />
          </Field>
          <Field label="Reminder days">
            <input type="number" className={inputClass} value={reminderDays} onChange={(e) => setReminderDays(e.target.value)} />
          </Field>
          <Field label="Payment terms">
            <input className={inputClass} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </Field>
          <Field label="Notice period">
            <input className={inputClass} value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)} />
          </Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="submit" disabled={busy || !propertyId || !landlordId || !startDate || !expiryDate}
            className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Posting…" : "Post renewal"}
          </button>
        </div>
      </form>
    </div>
  );
}
