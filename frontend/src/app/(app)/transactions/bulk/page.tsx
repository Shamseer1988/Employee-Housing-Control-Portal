"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { toast, errorMessage } from "@/components/ui/toast";

type Batch = {
  id: number;
  filename: string | null;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  status: "pending" | "completed" | "failed";
  created_at: string;
};

type Result = {
  batch: Batch;
  summary: { posted_assignments: string[]; posted_transfers: string[] };
  errors: { row_number: number; errors: string }[];
};

export default function BulkMovementsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Batch[]>([]);

  const loadHistory = async () => {
    try {
      const r = await api.get("/bulk-movements/batches");
      setHistory(r.data.data);
    } catch { /* ignore */ }
  };

  useEffect(() => { loadHistory(); }, []);

  const downloadTemplate = async () => {
    try {
      const resp = await api.get("/bulk-movements/template", { responseType: "blob" });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bulk-movements-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed", errorMessage(err));
    }
  };

  const upload = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // No Content-Type override — axios sets multipart/form-data
      // with the boundary when it sees a FormData payload. Forcing
      // the header drops the boundary and the upload fails.
      const resp = await api.post("/bulk-movements/import", fd);
      const data = resp.data.data as Result;
      setResult(data);
      if (data.batch.status === "completed") {
        const a = data.summary.posted_assignments.length;
        const t = data.summary.posted_transfers.length;
        toast.success(`Bulk import complete`, `${a} assignment${a === 1 ? "" : "s"} and ${t} transfer${t === 1 ? "" : "s"} posted.`);
      } else {
        toast.warning("Import rejected", `${data.batch.error_rows} row(s) need fixes. Nothing was committed.`);
      }
      await loadHistory();
    } catch (err: unknown) {
      toast.error("Import failed", errorMessage(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Link href="/transactions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to transactions
        </Link>
        <h1 className="mt-2 text-2xl lg:text-3xl font-semibold tracking-tight">Bulk allocation / Bulk transfer</h1>
        <p className="text-sm text-muted-foreground">
          Upload an Excel sheet to assign or transfer many employees in one go.
          Every row is validated first — if any row has an error, nothing is committed.
        </p>
      </div>

      <div className="glass rounded-xl p-4 space-y-4">
        <div className="space-y-2">
          <div className="text-sm font-medium inline-flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Workbook format
          </div>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal pl-5">
            <li>Download the template and fill one row per movement.</li>
            <li><code className="font-mono text-xs">mode</code> must be either <span className="font-mono">assign</span> or <span className="font-mono">transfer</span>.</li>
            <li>Reference employees by <code className="font-mono text-xs">employee_code</code> (e.g. <span className="font-mono">EMP-00001</span>) and target beds by <code className="font-mono text-xs">bed_code</code>.</li>
            <li>Transfers need an employee that already has a bed; assigns need one without a bed.</li>
            <li>The same bed can&apos;t be targeted twice in the same file.</li>
          </ol>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={downloadTemplate}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent">
            <Download className="h-4 w-4" /> Download template
          </button>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4" />
            {file ? file.name : "Choose .xlsx file…"}
            <input
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
            />
          </label>
          <button
            onClick={upload}
            disabled={!file || busy}
            className="ml-auto h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Validating…" : "Import"}
          </button>
        </div>

        {result && (
          <div className={
            "rounded-lg p-3 text-sm border " +
            (result.batch.status === "completed"
              ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-rose-500/5 border-rose-500/30 text-rose-700 dark:text-rose-400")
          }>
            <div className="flex items-center gap-2 font-medium">
              {result.batch.status === "completed"
                ? <CheckCircle2 className="h-4 w-4" />
                : <AlertTriangle className="h-4 w-4" />}
              {result.batch.status === "completed"
                ? `Imported ${result.batch.success_rows} of ${result.batch.total_rows} rows.`
                : `Rejected — ${result.batch.error_rows} of ${result.batch.total_rows} row(s) need fixes. Nothing was committed.`}
            </div>
            {result.batch.status === "completed" && (
              <div className="mt-1 text-xs text-foreground/80">
                Posted {result.summary.posted_assignments.length} assignment(s) and {result.summary.posted_transfers.length} transfer(s).
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-rose-500/30 bg-background/40">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground bg-card/60 sticky top-0">
                    <tr>
                      <th className="py-1.5 px-2 w-16">Row</th>
                      <th className="py-1.5 px-2">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e) => (
                      <tr key={e.row_number} className="border-t border-border/40">
                        <td className="py-1.5 px-2 font-mono">{e.row_number}</td>
                        <td className="py-1.5 px-2 text-foreground">{e.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="text-sm font-medium mb-3">Recent batches</div>
        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground">No imports yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">File</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Success</th>
                  <th className="py-2 pr-4 text-right">Errors</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-muted-foreground">{new Date(b.created_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-xs truncate max-w-[18rem]">{b.filename ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <span className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (b.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : b.status === "failed"
                            ? "bg-rose-500/10 text-rose-600"
                            : "bg-muted text-muted-foreground")
                      }>
                        {b.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono">{b.success_rows}</td>
                    <td className="py-2 pr-4 text-right font-mono">{b.error_rows}</td>
                    <td className="py-2 pr-4 text-right font-mono">{b.total_rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
