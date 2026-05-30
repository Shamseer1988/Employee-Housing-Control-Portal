"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouteParams } from "@/lib/use-route-params";
import Link from "next/link";
import { ArrowLeft, User, Paperclip, BedDouble } from "lucide-react";
import { api } from "@/lib/api";
import { keys } from "@/lib/query-keys";
import { AttachmentsTab } from "@/components/attachments-tab";
import { ErrorState, Skeleton } from "@/components/ui/states";

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
  const { id } = useRouteParams(params);
  const [tab, setTab] = useState<TabKey>("profile");

  const empQuery = useQuery({
    queryKey: keys.employees.detail(id),
    queryFn: async () => {
      const r = await api.get(`/employees/${id}`);
      return r.data.data as Employee;
    },
    enabled: Boolean(id),
  });

  if (empQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (empQuery.isError || !empQuery.data) {
    return (
      <ErrorState
        title="Couldn't load this employee"
        message="The request failed or the employee no longer exists."
        onRetry={() => empQuery.refetch()}
      />
    );
  }
  const emp = empQuery.data;

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

type TimelineEvent = {
  type: "assignment" | "transfer" | "cancellation" | "vacation";
  date: string | null;
  transaction_number: string;
  status?: string;
  bed_code?: string | null;
  property?: string | null;
  reason?: string | null;
  remarks?: string | null;
  closed_on?: string | null;
  closed_reason?: string | null;
  from_bed_code?: string | null;
  to_bed_code?: string | null;
  new_employee_status?: string | null;
  end_date?: string | null;
  return_date?: string | null;
  keep_bed_reserved?: boolean;
};

const EVENT_TONE: Record<TimelineEvent["type"], string> = {
  assignment: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  transfer: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  cancellation: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  vacation: "bg-sky-500/10 text-sky-600 border-sky-500/30",
};

function AccommodationTab({ emp }: { emp: Employee }) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get(`/employees/${emp.id}/timeline`);
        setTimeline(r.data.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [emp.id]);

  return (
    <div className="space-y-4">
      {!emp.accommodation_required ? (
        <div className="glass rounded-xl p-6 text-sm text-muted-foreground">
          This employee does not require accommodation.
        </div>
      ) : !emp.current_bed ? (
        <div className="glass rounded-xl p-6 text-sm text-muted-foreground">
          Not currently assigned to a bed.{" "}
          <Link href="/transactions/assignments/new" className="text-primary underline">Post an assignment</Link>.
        </div>
      ) : (
        <div className="glass rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Property</div>
            <div className="text-sm font-medium">
              {emp.current_property ? (
                <Link href={`/properties/${emp.current_property.id}`} className="hover:text-primary">
                  {emp.current_property.name}
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
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Type</div>
            <div className="text-sm font-medium">{emp.accommodation_type ?? "—"}</div>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-4">
        <div className="text-sm font-semibold mb-3">Movement history</div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : timeline.length === 0 ? (
          <div className="text-sm text-muted-foreground">No accommodation events yet.</div>
        ) : (
          <ol className="relative border-l border-border ml-3 space-y-3">
            {[...timeline].reverse().map((e, i) => (
              <li key={`${e.type}-${e.transaction_number}-${i}`} className="ml-4">
                <div className={"absolute -left-1.5 mt-1 h-3 w-3 rounded-full border " + EVENT_TONE[e.type]} />
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={"text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border " + EVENT_TONE[e.type]}>
                    {e.type}
                  </span>
                  <span className="font-mono text-xs">{e.transaction_number}</span>
                  <span className="text-xs text-muted-foreground font-mono">{e.date ?? "—"}</span>
                </div>
                <div className="text-sm mt-1">
                  {e.type === "assignment" && (
                    <>
                      Assigned to <span className="font-mono text-xs">{e.bed_code}</span>
                      {e.property && <> at {e.property}</>}
                      {e.status && e.status !== "active" && <> · later <span className="capitalize">{e.status}</span>{e.closed_on && <> on {e.closed_on}</>}</>}
                    </>
                  )}
                  {e.type === "transfer" && (
                    <>Transferred <span className="font-mono text-xs">{e.from_bed_code}</span> → <span className="font-mono text-xs">{e.to_bed_code}</span></>
                  )}
                  {e.type === "cancellation" && (
                    <>Released <span className="font-mono text-xs">{e.bed_code}</span> · {e.reason?.replaceAll("_", " ")}{e.new_employee_status && <> · status → {e.new_employee_status}</>}</>
                  )}
                  {e.type === "vacation" && (
                    <>
                      Vacation {e.keep_bed_reserved ? "(bed reserved)" : "(bed released)"}
                      {e.end_date && <> · ends {e.end_date}</>}
                      {e.return_date && <> · returned {e.return_date}</>}
                    </>
                  )}
                </div>
                {e.remarks && <div className="text-xs text-muted-foreground mt-0.5">{e.remarks}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
