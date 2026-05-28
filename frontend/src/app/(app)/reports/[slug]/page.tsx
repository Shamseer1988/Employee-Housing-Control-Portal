"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Download, Printer, Eye, EyeOff, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState, type VisibilityState,
} from "@tanstack/react-table";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { ErrorBoundary } from "@/components/error-boundary";
import { inputClass, selectClass } from "@/components/ui/dialog";

function renderCellValue(v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return Number.isInteger(v) ? v.toString() : v.toLocaleString();
  if (typeof v === "string") return v;
  // Defensive: stringify objects / arrays so a stray nested object never
  // crashes the whole report viewer.
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

type Column = { key: string; label: string; width?: number };
type Row = Record<string, unknown>;
type ReportPayload = { columns: Column[]; rows: Row[]; meta?: Record<string, unknown> };
type ReportInfo = { slug: string; title: string; category: string; description: string };

type FilterField = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "employee" | "property" | "division";
  options?: { value: string; label: string }[];
  placeholder?: string;
};

const FILTERS: Record<string, FilterField[]> = {
  "property-occupancy": [
    { key: "status", label: "Status", type: "select", options: [
      { value: "", label: "All" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "maintenance", label: "Maintenance" },
      { value: "vacated", label: "Vacated" },
    ]},
    { key: "city", label: "City", type: "text", placeholder: "Doha" },
  ],
  "room-bed-allocation": [
    { key: "property_id", label: "Property", type: "property" },
    { key: "status", label: "Bed status", type: "select", options: [
      { value: "", label: "All" },
      { value: "empty", label: "Empty" },
      { value: "occupied", label: "Occupied" },
      { value: "reserved", label: "Reserved" },
      { value: "maintenance", label: "Maintenance" },
      { value: "blocked", label: "Blocked" },
    ]},
  ],
  "empty-beds": [
    { key: "property_id", label: "Property", type: "property" },
  ],
  "property-employees": [
    { key: "property_id", label: "Property", type: "property" },
    { key: "division_id", label: "Division", type: "division" },
  ],
  "division-accommodation": [],
  "employee-history": [
    { key: "employee_id", label: "Employee", type: "employee" },
  ],
  "agreement-expiry": [
    { key: "within_days", label: "Within days", type: "number", placeholder: "90" },
  ],
  "vacation-employees": [],
  "maintenance": [
    { key: "entity_type", label: "Target type", type: "select", options: [
      { value: "", label: "All" },
      { value: "property", label: "Property" },
      { value: "room", label: "Room" },
      { value: "bed", label: "Bed" },
    ]},
    { key: "status", label: "Status", type: "select", options: [
      { value: "in_progress", label: "In progress" },
      { value: "completed", label: "Completed" },
      { value: "cancelled", label: "Cancelled" },
    ]},
  ],
  "monthly-movement": [
    { key: "months", label: "Months", type: "number", placeholder: "12" },
  ],
  "audit-trail": [
    { key: "module", label: "Module", type: "text", placeholder: "user, assignment, …" },
    { key: "action", label: "Action", type: "text", placeholder: "create, post, login, …" },
    { key: "from_date", label: "From", type: "date" },
    { key: "to_date", label: "To", type: "date" },
  ],
};

const SAVED_FILTERS_KEY = "pug.report-filters";

function loadSavedFilters(slug: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${SAVED_FILTERS_KEY}.${slug}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveFilters(slug: string, filters: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${SAVED_FILTERS_KEY}.${slug}`, JSON.stringify(filters));
}

export default function ReportPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <ErrorBoundary fallbackTitle="The report viewer crashed.">
      <ReportPageInner {...props} />
    </ErrorBoundary>
  );
}

function ReportPageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [info, setInfo] = useState<ReportInfo | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [showColumns, setShowColumns] = useState(false);

  // Picker data
  const [properties, setProperties] = useState<{ id: number; code: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: number; code: string; full_name: string }[]>([]);
  const [divisions, setDivisions] = useState<{ id: number; code: string; name: string }[]>([]);

  const filterFields = FILTERS[slug] ?? [];

  useEffect(() => {
    setFilters(loadSavedFilters(slug));
    api.get("/reports")
      .then((r) => {
        const list = Array.isArray(r.data?.data) ? (r.data.data as ReportInfo[]) : [];
        setInfo(list.find((x) => x.slug === slug) ?? null);
      })
      .catch(() => setInfo(null));
    const need = new Set(filterFields.map((f) => f.type));
    if (need.has("property")) {
      api.get("/properties")
        .then((r) => setProperties(Array.isArray(r.data?.data) ? r.data.data : []))
        .catch(() => setProperties([]));
    }
    if (need.has("employee")) {
      api.get("/employees")
        .then((r) => setEmployees(Array.isArray(r.data?.data) ? r.data.data : []))
        .catch(() => setEmployees([]));
    }
    if (need.has("division")) {
      api.get("/divisions")
        .then((r) => setDivisions(Array.isArray(r.data?.data) ? r.data.data : []))
        .catch(() => setDivisions([]));
    }
  }, [slug]);  // eslint-disable-line react-hooks/exhaustive-deps

  const run = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
      const r = await api.get(`/reports/${slug}`, { params });
      setPayload(r.data.data);
      saveFilters(slug, filters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { run(); }, [slug]);  // eslint-disable-line react-hooks/exhaustive-deps

  const exportXlsx = async () => {
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(filters)) if (v) params[k] = v;
    const r = await api.get(`/reports/${slug}/export`, { params, responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Reset sorting / visibility on slug change so we never carry state into
  // a report with a totally different column set.
  useEffect(() => {
    setSorting([]);
    setVisibility({});
  }, [slug]);

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    if (!payload || !Array.isArray(payload.columns)) return [];
    return payload.columns.map((c) => ({
      id: c.key,
      accessorFn: (row: Row) => (row && typeof row === "object" ? row[c.key] : undefined),
      header: () => c.label,
      cell: (ctx) => renderCellValue(ctx.getValue()),
    }));
  }, [payload]);

  const data = useMemo<Row[]>(() => {
    if (!payload || !Array.isArray(payload.rows)) return [];
    return payload.rows.filter((r): r is Row => r !== null && typeof r === "object");
  }, [payload]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const setF = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="print-hidden">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to reports
        </Link>
        <div className="mt-2 flex items-end justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">{info?.title ?? slug}</h1>
            {info?.description && <p className="text-sm text-muted-foreground">{info.description}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowColumns((v) => !v)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
              {showColumns ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Columns
            </button>
            <button onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
              <Printer className="h-4 w-4" /> Print
            </button>
            <Can perm="report.export">
              <button onClick={exportXlsx}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Download className="h-4 w-4" /> Excel
              </button>
            </Can>
          </div>
        </div>
      </div>

      {filterFields.length > 0 && (
        <div className="glass rounded-xl p-4 print-hidden">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filterFields.map((f) => (
              <div key={f.key} className="space-y-1">
                <label className="text-xs text-muted-foreground">{f.label}</label>
                {f.type === "select" ? (
                  <select className={selectClass} value={filters[f.key] ?? ""} onChange={(e) => setF(f.key, e.target.value)}>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : f.type === "property" ? (
                  <select className={selectClass} value={filters[f.key] ?? ""} onChange={(e) => setF(f.key, e.target.value)}>
                    <option value="">All properties</option>
                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                  </select>
                ) : f.type === "employee" ? (
                  <select className={selectClass} value={filters[f.key] ?? ""} onChange={(e) => setF(f.key, e.target.value)}>
                    <option value="">Select…</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.code})</option>)}
                  </select>
                ) : f.type === "division" ? (
                  <select className={selectClass} value={filters[f.key] ?? ""} onChange={(e) => setF(f.key, e.target.value)}>
                    <option value="">All divisions</option>
                    {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                    placeholder={f.placeholder}
                    value={filters[f.key] ?? ""}
                    onChange={(e) => setF(f.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button onClick={run}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Run report
            </button>
            <button onClick={() => { setFilters({}); saveFilters(slug, {}); run(); }}
              className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
              Clear filters
            </button>
            <div className="ml-auto text-xs text-muted-foreground">Filters persist in your browser.</div>
          </div>
        </div>
      )}

      {showColumns && payload && (
        <div className="glass rounded-xl p-4 print-hidden">
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Visible columns</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {table.getAllLeafColumns().map((c) => {
              const meta = payload?.columns.find((col) => col.key === c.id);
              return (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                  {meta?.label ?? c.id}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="glass rounded-xl overflow-hidden print-clean">
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !payload || payload.rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            {payload?.meta?.note ? String(payload.meta.note) : "No rows match the current filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border sticky top-0 bg-card/80 backdrop-blur">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => {
                      const sort = header.column.getIsSorted();
                      return (
                        <th key={header.id}
                            onClick={header.column.getToggleSortingHandler()}
                            className="py-2 px-3 select-none cursor-pointer hover:text-foreground whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sort === "asc" && <ArrowUp className="h-3 w-3" />}
                            {sort === "desc" && <ArrowDown className="h-3 w-3" />}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60 hover:bg-accent/30">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2 px-3 whitespace-nowrap">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {payload && (
          <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
            {payload.rows.length} row(s)
          </div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          .print-hidden { display: none !important; }
          .glass { background: white !important; backdrop-filter: none !important; border: 1px solid #ddd; }
          body { background: white !important; }
          aside, header { display: none !important; }
          main { padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}
