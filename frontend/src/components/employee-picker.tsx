"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

export type PickerEmployee = {
  id: number;
  code: string;
  full_name: string;
  qid_number: string | null;
  gender: string | null;
  status: string;
  accommodation_required: boolean;
  current_bed: { id: number; bed_code: string } | null;
  current_property: { id: number; name: string } | null;
  division: { id: number; name: string } | null;
};

export function EmployeePicker({
  filter,
  selected,
  onSelect,
}: {
  filter: (e: PickerEmployee) => boolean;
  selected: PickerEmployee | null;
  onSelect: (e: PickerEmployee) => void;
}) {
  const [employees, setEmployees] = useState<PickerEmployee[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const resp = await api.get("/employees");
        setEmployees(resp.data.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return employees.filter((e) => {
      if (!filter(e)) return false;
      if (!term) return true;
      return (
        e.full_name.toLowerCase().includes(term) ||
        e.code.toLowerCase().includes(term) ||
        (e.qid_number ?? "").toLowerCase().includes(term)
      );
    });
  }, [employees, q, filter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, code, QID…"
          className="h-9 w-full max-w-sm rounded-md border border-input bg-card/60 px-3 text-sm"
        />
        <div className="text-xs text-muted-foreground">
          {loading ? "Loading…" : `${filtered.length} matching employees`}
        </div>
      </div>
      <div className="overflow-x-auto max-h-[60vh]">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border sticky top-0 bg-card/60 backdrop-blur">
            <tr>
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Current bed</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const sel = selected?.id === e.id;
              return (
                <tr
                  key={e.id}
                  onClick={() => onSelect(e)}
                  className={
                    "border-b border-border/60 cursor-pointer " +
                    (sel ? "bg-primary/10" : "hover:bg-accent/30")
                  }
                >
                  <td className="py-2 pr-4 font-mono text-xs">{e.code}</td>
                  <td className="py-2 pr-4 font-medium">{e.full_name}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{e.current_bed?.bed_code ?? "—"}</td>
                  <td className="py-2 pr-4 capitalize">{e.status.replaceAll("_", " ")}</td>
                  <td className="py-2 pr-4 text-right">
                    {sel && <CheckCircle2 className="h-4 w-4 text-primary inline" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
