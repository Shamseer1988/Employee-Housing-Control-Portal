"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, User, Paperclip, BedDouble } from "lucide-react";
import { api } from "@/lib/api";
import { AttachmentsTab } from "@/app/(app)/properties/[id]/page";

type Employee = {
  id: number;
  code: string;
  full_name: string;
  qid_number: string | null;
  passport_number: string | null;
  visa_company: string | null;
  designation: string | null;
  department: string | null;
  nationality: string | null;
  gender: string | null;
  mobile_number: string | null;
  joining_date: string | null;
  accommodation_required: boolean;
  accommodation_type: string | null;
  status: string;
  emergency_contact: string | null;
  remarks: string | null;
  division: { id: number; code: string; name: string } | null;
  current_property: { id: number; code: string; name: string } | null;
  current_room: { id: number; room_number: string } | null;
  current_bed: { id: number; bed_code: string } | null;
};

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  on_vacation: "bg-sky-500/10 text-sky-600",
  transferred: "bg-amber-500/10 text-amber-600",
  visa_cancelled: "bg-rose-500/10 text-rose-600",
  resigned: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground",
};

type TabKey = "profile" | "documents" | "accommodation";

export default function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [emp, setEmp] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("profile");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await api.get(`/employees/${id}`);
        setEmp(r.data.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading || !emp) return <div className="text-sm text-muted-foreground animate-pulse">Loading employee…</div>;

  const tabs: { key: TabKey; label: string; icon: typeof User }[] = [
    { key: "profile", label: "Profile", icon: User },
    { key: "accommodation", label: "Accommodation", icon: BedDouble },
    { key: "documents", label: "Documents", icon: Paperclip },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/employees" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to employees
        </Link>
        <div className="mt-2 flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">{emp.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{emp.code}</span>
              {emp.designation && <> · {emp.designation}</>}
              {emp.division && <> · {emp.division.name}</>}
            </p>
          </div>
          <span className={"rounded-full px-3 py-1 text-xs " + (STATUS_TONE[emp.status] ?? "bg-muted text-muted-foreground")}>
            {emp.status.replaceAll("_", " ")}
          </span>
        </div>
      </div>

      <div className="flex border-b border-border overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={"px-4 py-2 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 " +
              (tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileTab emp={emp} />}
      {tab === "accommodation" && <AccommodationTab emp={emp} />}
      {tab === "documents" && <AttachmentsTab entityType="employee" entityId={emp.id} />}
    </div>
  );
}

function ProfileTab({ emp }: { emp: Employee }) {
  const Cell = ({ k, v }: { k: string; v: string | number | null | undefined | boolean }) => (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v === null || v === undefined || v === "" ? "—" : String(v)}</div>
    </div>
  );
  return (
    <div className="glass rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
      <Cell k="QID" v={emp.qid_number} />
      <Cell k="Passport" v={emp.passport_number} />
      <Cell k="Visa company" v={emp.visa_company} />
      <Cell k="Division" v={emp.division?.name} />
      <Cell k="Department" v={emp.department} />
      <Cell k="Designation" v={emp.designation} />
      <Cell k="Nationality" v={emp.nationality} />
      <Cell k="Gender" v={emp.gender} />
      <Cell k="Mobile" v={emp.mobile_number} />
      <Cell k="Joining date" v={emp.joining_date} />
      <Cell k="Emergency contact" v={emp.emergency_contact} />
      <Cell k="Accommodation required" v={emp.accommodation_required ? "Yes" : "No"} />
      {emp.remarks && (
        <div className="col-span-full">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Remarks</div>
          <div className="text-sm">{emp.remarks}</div>
        </div>
      )}
    </div>
  );
}

function AccommodationTab({ emp }: { emp: Employee }) {
  if (!emp.accommodation_required) {
    return <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">This employee does not require accommodation.</div>;
  }
  if (!emp.current_bed) {
    return (
      <div className="glass rounded-xl p-10 text-center text-sm text-muted-foreground">
        Not currently assigned to a bed. Use the assignment transaction (Phase 6) once it ships.
      </div>
    );
  }
  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Property</div>
          <div className="text-sm font-medium">
            {emp.current_property ? (
              <Link href={`/properties/${emp.current_property.id}`} className="hover:text-primary">
                {emp.current_property.name} <span className="font-mono text-xs text-muted-foreground">({emp.current_property.code})</span>
              </Link>
            ) : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Room</div>
          <div className="text-sm font-medium">{emp.current_room?.room_number ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Bed code</div>
          <div className="text-sm font-medium font-mono">{emp.current_bed.bed_code}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Accommodation type</div>
          <div className="text-sm font-medium">{emp.accommodation_type ?? "—"}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Movement history (transfer / cancellation / vacation) lands in Phase 7.
      </div>
    </div>
  );
}
