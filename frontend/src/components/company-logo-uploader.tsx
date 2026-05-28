"use client";

import { useState } from "react";
import { Upload, Trash2, Image as ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { refreshPublicSettings, useCompanyLogo } from "@/lib/public-settings";
import { Can } from "@/components/can";

export function CompanyLogoUploader() {
  const logoUrl = useCompanyLogo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/settings/company-logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await refreshPublicSettings();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm("Remove the current logo?")) return;
    setBusy(true);
    try {
      await api.delete("/settings/company-logo");
      await refreshPublicSettings();
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 grid grid-cols-1 md:grid-cols-[1fr_minmax(220px,320px)] gap-3 items-start">
      <div>
        <div className="text-sm font-medium">Company logo</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Square PNG / JPG / SVG, recommended at least 256×256. Shown in the
          sidebar header, login page, browser tab and PWA icon.
        </div>
        <div className="text-[10px] text-muted-foreground mt-1 font-mono">company.logo_url</div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 rounded-lg border border-border bg-card grid place-items-center overflow-hidden shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <Can perm="settings.manage">
            <div className="flex items-center gap-2 flex-wrap">
              <label className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
                <Upload className="h-4 w-4" />
                {busy ? "Uploading…" : logoUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) upload(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {logoUrl && (
                <button
                  onClick={remove}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card/60 px-3 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              )}
            </div>
          </Can>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
    </div>
  );
}
