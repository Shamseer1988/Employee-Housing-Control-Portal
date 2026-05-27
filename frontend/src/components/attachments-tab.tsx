"use client";

import { useEffect, useState } from "react";
import { Upload, Download, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";

type Attachment = {
  id: number;
  category: string | null;
  original_name: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
};

export function AttachmentsTab({ entityType, entityId }: {
  entityType: string;
  entityId: number | string;
}) {
  const [rows, setRows] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.get("/attachments", {
        params: { entity_type: entityType, entity_id: entityId },
      });
      setRows(resp.data.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityType, entityId]);  // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file: File, category: string) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("entity_type", entityType);
      fd.append("entity_id", String(entityId));
      if (category) fd.append("category", category);
      await api.post("/attachments", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await load();
    } finally {
      setUploading(false);
    }
  };

  const download = async (att: Attachment) => {
    const resp = await api.get(`/attachments/${att.id}/download`, { responseType: "blob" });
    const url = URL.createObjectURL(resp.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = att.original_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (att: Attachment) => {
    if (!confirm(`Delete ${att.original_name}?`)) return;
    await api.delete(`/attachments/${att.id}`);
    await load();
  };

  return (
    <div className="space-y-4">
      <Can perm="attachment.upload">
        <div className="glass rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <label className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
            <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload agreement"}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f, "agreement");
                e.currentTarget.value = "";
              }}
            />
          </label>
          <label className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card/60 px-3 text-sm hover:bg-accent cursor-pointer">
            <Upload className="h-4 w-4" /> Upload other
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f, "other");
                e.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </Can>

      <div className="glass rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 px-3">File</th>
              <th className="py-2 px-3">Category</th>
              <th className="py-2 px-3">Size</th>
              <th className="py-2 px-3">Uploaded</th>
              <th className="py-2 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">No attachments yet</td></tr>
            ) : (
              rows.map((a) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="py-2 px-3">{a.original_name}</td>
                  <td className="py-2 px-3 text-muted-foreground">{a.category ?? "—"}</td>
                  <td className="py-2 px-3 text-xs">{(a.size_bytes / 1024).toFixed(1)} KB</td>
                  <td className="py-2 px-3 font-mono text-xs">
                    {a.created_at.slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      onClick={() => download(a)}
                      className="h-8 w-8 grid place-items-center rounded-md hover:bg-accent inline-block"
                      aria-label={`Download ${a.original_name}`}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <Can perm="attachment.upload">
                      <button
                        onClick={() => remove(a)}
                        className="h-8 w-8 grid place-items-center rounded-md hover:bg-destructive/10 text-destructive inline-block"
                        aria-label={`Delete ${a.original_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Can>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
