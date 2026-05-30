"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BedDouble, Building2, ClipboardList, FileText, Plane, Users,
  Wrench, ArrowRightLeft, Layers, Calendar,
} from "lucide-react";
import { api } from "@/lib/api";

type ReportInfo = {
  slug: string;
  title: string;
  category: string;
  description: string;
};

const CATEGORY_ICON: Record<string, typeof FileText> = {
  Occupancy: BedDouble,
  Employees: Users,
  Property: Building2,
  Operations: Wrench,
  Audit: ClipboardList,
};

const REPORT_ICON: Record<string, typeof FileText> = {
  "property-occupancy": Building2,
  "room-bed-allocation": BedDouble,
  "empty-beds": BedDouble,
  "property-employees": Users,
  "division-accommodation": Layers,
  "employee-history": ArrowRightLeft,
  "agreement-expiry": Calendar,
  "vacation-employees": Plane,
  "maintenance": Wrench,
  "monthly-movement": ArrowRightLeft,
  "audit-trail": ClipboardList,
};

export default function ReportsIndexPage() {
  const [reports, setReports] = useState<ReportInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/reports");
        setReports(r.data.data);
      } finally { setLoading(false); }
    })();
  }, []);

  const grouped = useMemo(() => {
    const out: Record<string, ReportInfo[]> = {};
    for (const r of reports) (out[r.category] ??= []).push(r);
    return out;
  }, [reports]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Filterable views of occupancy, employees, agreements and operations. Every report exports to Excel.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        Object.entries(grouped).map(([category, items]) => {
          const CategoryIcon = CATEGORY_ICON[category] ?? FileText;
          return (
            <section key={category} className="space-y-3">
              <div className="flex items-center gap-2">
                <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{category}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((r) => {
                  const Icon = REPORT_ICON[r.slug] ?? FileText;
                  return (
                    <Link key={r.slug} href={`/reports/${r.slug}`}
                          className="glass rounded-xl p-4 block hover:bg-accent/30 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">{r.title}</div>
                          <div className="text-xs text-muted-foreground mt-1">{r.description}</div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
