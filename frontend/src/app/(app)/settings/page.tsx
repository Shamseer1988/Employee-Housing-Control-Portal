"use client";

import { useEffect, useState } from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";

type Setting = {
  id: number;
  key: string;
  value: unknown;
  category: string | null;
  description: string | null;
};

const APPROVAL_TOGGLES: { key: string; label: string; description: string }[] = [
  { key: "approval.assignment.required", label: "Assignment", description: "Require approval before posting a new accommodation assignment." },
  { key: "approval.transfer.required", label: "Transfer", description: "Require approval before executing a bed / room / property transfer." },
  { key: "approval.cancellation.required", label: "Cancellation", description: "Require approval before releasing an active assignment." },
  { key: "approval.renewal.required", label: "Landlord renewal", description: "Require approval before archiving the active agreement and creating a renewal." },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    const r = await api.get("/settings");
    setSettings(r.data.data);
  };

  useEffect(() => { load(); }, []);

  const valueOf = (key: string): boolean => {
    if (key in pending) return pending[key];
    const s = settings.find((x) => x.key === key);
    return Boolean(s?.value);
  };

  const toggle = async (key: string) => {
    const next = !valueOf(key);
    setPending((p) => ({ ...p, [key]: next }));
    setBusy(key);
    try {
      await api.put(`/settings/${encodeURIComponent(key)}`, { value: next });
      await load();
      setPending((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    } catch (err: unknown) {
      alert((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Save failed");
      setPending((p) => {
        const copy = { ...p };
        delete copy[key];
        return copy;
      });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">System Settings</h1>
        <p className="text-sm text-muted-foreground">Phase 11 ships the approval-workflow toggles. Additional sections land in Phase 12.</p>
      </div>

      <div className="glass rounded-xl p-4 space-y-3">
        <div className="text-sm font-semibold">Approval workflow</div>
        <p className="text-xs text-muted-foreground">
          When a toggle is ON, the matching transaction is created in <span className="font-mono">pending_approval</span> status and
          side effects only run after an approver acts.
        </p>
        <div className="space-y-2 mt-2">
          {APPROVAL_TOGGLES.map((t) => {
            const on = valueOf(t.key);
            return (
              <div key={t.key} className="flex items-start gap-3 rounded-lg border border-border bg-card/40 p-3">
                <Can perm="settings.manage" fallback={
                  <div className="h-9 w-12 grid place-items-center text-muted-foreground">
                    {on ? <ToggleRight className="h-5 w-5 text-primary" /> : <ToggleLeft className="h-5 w-5" />}
                  </div>
                }>
                  <button
                    disabled={busy === t.key}
                    onClick={() => toggle(t.key)}
                    aria-label={`Toggle ${t.label}`}
                    className="h-9 w-12 grid place-items-center rounded-md hover:bg-accent disabled:opacity-60"
                  >
                    {on ? <ToggleRight className="h-6 w-6 text-primary" /> : <ToggleLeft className="h-6 w-6 text-muted-foreground" />}
                  </button>
                </Can>
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </div>
                <span className={"rounded-full px-2 py-0.5 text-xs " + (on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  {on ? "Required" : "Off"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
