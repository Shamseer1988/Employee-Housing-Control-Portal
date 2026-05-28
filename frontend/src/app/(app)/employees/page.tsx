"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, Upload, Download, UserX, ChevronRight, Users as UsersIcon } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";
import { Modal, Field, inputClass, selectClass, textareaClass } from "@/components/ui/dialog";
import { toast, errorMessage } from "@/components/ui/toast";
import { SkeletonTable } from "@/components/ui/states";

type Division = { id: number; code: string; name: string };

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
  division: Division | null;
  current_property: { id: number; code: string; name: string } | null;
  current_bed: { id: number; bed_code: string } | null;
};

const STATUSES = ["active", "on_vacation", "transferred", "visa_cancelled", "resigned", "terminated"];
const ACC_TYPES = ["shared_room", "single_room", "supervisor_room", "executive_room", "temporary", "family"];
const GENDERS = ["male", "female", "other"];

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600",
  on_vacation: "bg-sky-500/10 text-sky-600",
  transferred: "bg-amber-500/10 text-amber-600",
  visa_cancelled: "bg-rose-500/10 text-rose-600",
  resigned: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground",
};

export default function EmployeesPage() {
  const [rows, setRows] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [accommodation, setAccommodation] = useState("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [showImport, setShowImport] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (status) params.status = status;
      if (divisionId) params.division_id = divisionId;
      if (accommodation) params.accommodation = accommodation;
      const [e, d] = await Promise.all([
        api.get("/employees", { params }),
        divisions.length ? Promise.resolve({ data: { data: divisions } }) : api.get("/divisions"),
      ]);
      setRows(e.data.data);
      if (!divisions.length) setDivisions(d.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const deactivate = async (emp: Employee) => {
    if (!confirm(`Deactivate ${emp.full_name}?`)) return;
    await api.delete(`/employees/${emp.id}`);
    await load();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Employees</h1>
          <p className="text-sm text-muted-foreground">Master directory with accommodation status, documents and Excel import.</p>
        </div>
        <div className="flex items-center gap-2">
          <Can perm="employee.import">
            <button onClick={() => setShowImport(true)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
              <Upload className="h-4 w-4" /> Import
            </button>
          </Can>
          <Can perm="employee.create">
            <button onClick={() => { setEditing(null); setShowForm(true); }}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New employee
            </button>
          </Can>
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search code, name, QID, passport, mobile…"
            className="h-9 w-full max-w-sm rounded-md border border-input bg-card/60 px-3 text-sm" />
          <select className={selectClass + " w-auto"} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            <option value="">All divisions</option>
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className={selectClass + " w-auto"} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
          </select>
          <select className={selectClass + " w-auto"} value={accommodation} onChange={(e) => setAccommodation(e.target.value)}>
            <option value="">Any accommodation</option>
            <option value="yes">Needs accommodation</option>
            <option value="no">No accommodation</option>
          </select>
          <button onClick={load} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">Filter</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2 pr-4">Code</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">QID</th>
                <th className="py-2 pr-4">Division</th>
                <th className="py-2 pr-4">Designation</th>
                <th className="py-2 pr-4">Mobile</th>
                <th className="py-2 pr-4">Accommodation</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Actions</th>
              </tr>
            </thead>
            {loading && <SkeletonTable rows={6} columns={9} />}
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr><td colSpan={9} className="py-10 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <UsersIcon className="h-4 w-4" />
                    No employees match. Adjust the filters or import from Excel.
                  </div>
                </td></tr>
              )
              : !loading && rows.map((e) => (
                <tr key={e.id} className="border-b border-border/60 hover:bg-accent/30">
                  <td className="py-2 pr-4 font-mono text-xs">{e.code}</td>
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/employees/${e.id}`} className="hover:text-primary inline-flex items-center gap-1">
                      {e.full_name} <ChevronRight className="h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </Link>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{e.qid_number ?? "—"}</td>
                  <td className="py-2 pr-4">{e.division?.name ?? "—"}</td>
                  <td className="py-2 pr-4">{e.designation ?? "—"}</td>
                  <td className="py-2 pr-4">{e.mobile_number ?? "—"}</td>
                  <td className="py-2 pr-4">
                    {e.current_bed ? (
                      <span className="font-mono text-xs">{e.current_bed.bed_code}</span>
                    ) : e.accommodation_required ? (
                      <span className="text-xs text-amber-600">Pending</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not required</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <span className={"rounded-full px-2 py-0.5 text-xs " + (STATUS_TONE[e.status] ?? "bg-muted text-muted-foreground")}>
                      {e.status.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Can perm="employee.edit">
                      <button onClick={() => { setEditing(e); setShowForm(true); }}
                        aria-label={`Edit ${e.full_name}`}
                        className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent inline-block">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {e.status !== "terminated" && (
                        <button onClick={() => deactivate(e)}
                          aria-label={`Deactivate ${e.full_name}`}
                          className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive inline-block">
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </Can>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <EmployeeDialog open={showForm} editing={editing} divisions={divisions}
        onClose={() => setShowForm(false)}
        onSaved={async () => { setShowForm(false); await load(); }} />

      <ImportDialog open={showImport} onClose={() => setShowImport(false)}
        onImported={async () => { setShowImport(false); await load(); }} />
    </div>
  );
}

function EmployeeDialog({ open, editing, divisions, onClose, onSaved }: {
  open: boolean; editing: Employee | null; divisions: Division[];
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      if (editing) {
        setForm({
          ...editing,
          division_id: editing.division?.id ?? null,
        });
      } else {
        setForm({ accommodation_required: true, status: "active" });
      }
    }
  }, [editing, open]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      delete payload.division;
      delete payload.current_property;
      delete payload.current_room;
      delete payload.current_bed;
      if (editing) {
        const resp = await api.put(`/employees/${editing.id}`, payload);
        toast.success(`Employee ${resp.data?.data?.code ?? editing.code} updated`);
      } else {
        const resp = await api.post("/employees", payload);
        toast.success(`Employee ${resp.data?.data?.code ?? ""} created`);
      }
      onSaved();
    } catch (err: unknown) {
      toast.error("Save failed", errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${editing.full_name}` : "New employee"} size="lg">
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" span={2}>
            <input required className={inputClass} value={String(form.full_name ?? "")} onChange={(e) => set("full_name", e.target.value)} />
          </Field>
          <Field label="QID number"><input className={inputClass} value={String(form.qid_number ?? "")} onChange={(e) => set("qid_number", e.target.value)} /></Field>
          <Field label="Passport number"><input className={inputClass} value={String(form.passport_number ?? "")} onChange={(e) => set("passport_number", e.target.value)} /></Field>
          <Field label="Visa company"><input className={inputClass} value={String(form.visa_company ?? "")} onChange={(e) => set("visa_company", e.target.value)} /></Field>
          <Field label="Division">
            <select className={selectClass} value={String(form.division_id ?? "")} onChange={(e) => set("division_id", e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Designation"><input className={inputClass} value={String(form.designation ?? "")} onChange={(e) => set("designation", e.target.value)} /></Field>
          <Field label="Department"><input className={inputClass} value={String(form.department ?? "")} onChange={(e) => set("department", e.target.value)} /></Field>
          <Field label="Nationality"><input className={inputClass} value={String(form.nationality ?? "")} onChange={(e) => set("nationality", e.target.value)} /></Field>
          <Field label="Gender">
            <select className={selectClass} value={String(form.gender ?? "")} onChange={(e) => set("gender", e.target.value || null)}>
              <option value="">—</option>
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="Mobile number"><input className={inputClass} value={String(form.mobile_number ?? "")} onChange={(e) => set("mobile_number", e.target.value)} /></Field>
          <Field label="Joining date"><input type="date" className={inputClass} value={String(form.joining_date ?? "").slice(0, 10)} onChange={(e) => set("joining_date", e.target.value || null)} /></Field>
          <Field label="Accommodation type">
            <select className={selectClass} value={String(form.accommodation_type ?? "")} onChange={(e) => set("accommodation_type", e.target.value || null)}>
              <option value="">—</option>
              {ACC_TYPES.map((t) => <option key={t} value={t}>{t.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={selectClass} value={String(form.status ?? "active")} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}
            </select>
          </Field>
          <Field label="Accommodation required">
            <label className="flex items-center gap-2 h-9">
              <input type="checkbox" checked={Boolean(form.accommodation_required)} onChange={(e) => set("accommodation_required", e.target.checked)} />
              <span className="text-sm">Needs accommodation</span>
            </label>
          </Field>
          <Field label="Emergency contact"><input className={inputClass} value={String(form.emergency_contact ?? "")} onChange={(e) => set("emergency_contact", e.target.value)} /></Field>
        </div>
        <Field label="Remarks"><textarea className={textareaClass} value={String(form.remarks ?? "")} onChange={(e) => set("remarks", e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-border bg-card/60 px-3 text-sm">Cancel</button>
          <button type="submit" disabled={busy} className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | {
    status: string;
    success_rows: number;
    error_rows: number;
    total_rows: number;
    errors: { row_number: number; errors: string }[];
  }>(null);

  useEffect(() => {
    if (open) { setFile(null); setResult(null); }
  }, [open]);

  const downloadTemplate = async () => {
    const resp = await api.get("/employees/template", { responseType: "blob" });
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employee_import_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await api.post("/employees/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult({
        status: resp.data.data.batch.status,
        success_rows: resp.data.data.batch.success_rows,
        error_rows: resp.data.data.batch.error_rows,
        total_rows: resp.data.data.batch.total_rows,
        errors: resp.data.data.errors,
      });
      if (resp.data.data.batch.status === "completed") onImported();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Import failed";
      setResult({ status: "failed", success_rows: 0, error_rows: 0, total_rows: 0, errors: [{ row_number: 0, errors: msg }] });
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import employees from Excel" size="lg">
      <div className="space-y-4">
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
          <li>Download the template and fill in employees (one per row).</li>
          <li>Use existing division codes (e.g. <code className="font-mono text-xs">DIV-0001</code>).</li>
          <li>Upload the file — every row is validated first, nothing is saved if any row has errors.</li>
        </ol>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> Download template
          </button>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4" />
            {file ? file.name : "Choose file…"}
            <input type="file" accept=".xlsx" className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
          </label>
          <button onClick={upload} disabled={!file || busy}
            className="ml-auto h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {busy ? "Validating…" : "Import"}
          </button>
        </div>

        {result && (
          <div className={"rounded-lg p-3 text-sm " + (result.status === "completed" ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive")}>
            <div className="font-medium">
              {result.status === "completed"
                ? `Imported ${result.success_rows} of ${result.total_rows} rows successfully.`
                : `Import failed — ${result.error_rows || result.errors.length} row(s) need fixes.`}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-destructive/30 bg-background/40">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground bg-card/60 sticky top-0">
                    <tr><th className="py-1 px-2">Row</th><th className="py-1 px-2">Errors</th></tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t border-border/40">
                        <td className="py-1 px-2 font-mono">{e.row_number}</td>
                        <td className="py-1 px-2 text-foreground">{e.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
