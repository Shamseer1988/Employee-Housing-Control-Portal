"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Save, Shield } from "lucide-react";
import { api } from "@/lib/api";
import { Can } from "@/components/can";

type Permission = { id: number; code: string; action: string; description: string };
type Catalog = { modules: Record<string, Permission[]>; count: number };
type Role = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
  permissions: { id: number; code: string; module: string }[];
  user_count: number;
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permIds, setPermIds] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        api.get("/roles"),
        api.get("/roles/permissions/catalog"),
      ]);
      setRoles(r.data.data);
      setCatalog(c.data.data);
      if (r.data.data.length && selectedId === null) {
        setSelectedId(r.data.data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? null, [roles, selectedId]);

  useEffect(() => {
    if (selected) setPermIds(new Set(selected.permissions.map((p) => p.id)));
  }, [selected]);

  useEffect(() => {
    if (catalog) setExpanded(new Set(Object.keys(catalog.modules)));
  }, [catalog]);

  const toggle = (id: number) =>
    setPermIds((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleModule = (mod: string) => {
    if (!catalog) return;
    const modPerms = catalog.modules[mod].map((p) => p.id);
    const allSelected = modPerms.every((id) => permIds.has(id));
    setPermIds((s) => {
      const next = new Set(s);
      modPerms.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.put(`/roles/${selected.id}`, { permission_ids: Array.from(permIds) });
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Roles & Permissions</h1>
        <p className="text-sm text-muted-foreground">
          Configure what each role can do across the system.
        </p>
      </div>

      {loading ? (
        <div className="glass rounded-xl p-10 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
          <div className="glass rounded-xl p-2 h-fit">
            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">Roles</div>
            <div className="space-y-1">
              {roles.map((r) => {
                const active = selectedId === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={
                      "w-full text-left rounded-md px-3 py-2 text-sm flex items-center justify-between " +
                      (active ? "bg-primary/10 text-primary" : "hover:bg-accent")
                    }
                  >
                    <span className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5" />
                      {r.name}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.user_count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass rounded-xl p-4">
            {!selected || !catalog ? (
              <div className="text-sm text-muted-foreground">Select a role to edit its permissions.</div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div>
                    <div className="text-lg font-semibold">{selected.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selected.code} {selected.is_system && "· system role"} · {permIds.size} of{" "}
                      {catalog.count} permissions
                    </div>
                    {selected.description && (
                      <p className="text-sm text-muted-foreground mt-1">{selected.description}</p>
                    )}
                  </div>
                  <Can perm="role.manage">
                    <button
                      onClick={save}
                      disabled={saving}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save permissions"}
                    </button>
                  </Can>
                </div>

                <div className="space-y-2">
                  {Object.entries(catalog.modules).map(([mod, perms]) => {
                    const open = expanded.has(mod);
                    const allOn = perms.every((p) => permIds.has(p.id));
                    return (
                      <div key={mod} className="rounded-md border border-border">
                        <div
                          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-accent/50"
                          onClick={() =>
                            setExpanded((s) => {
                              const next = new Set(s);
                              next.has(mod) ? next.delete(mod) : next.add(mod);
                              return next;
                            })
                          }
                        >
                          <div className="flex items-center gap-2 text-sm font-medium capitalize">
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {mod}
                            <span className="text-xs text-muted-foreground">
                              ({perms.filter((p) => permIds.has(p.id)).length}/{perms.length})
                            </span>
                          </div>
                          <label className="text-xs flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={allOn} onChange={() => toggleModule(mod)} /> All
                          </label>
                        </div>
                        {open && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1 p-3 pt-0">
                            {perms.map((p) => (
                              <label key={p.id} className="flex items-start gap-2 text-sm rounded-md hover:bg-accent/50 px-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={permIds.has(p.id)}
                                  onChange={() => toggle(p.id)}
                                  className="mt-0.5"
                                />
                                <span>
                                  <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                                  <br />
                                  <span className="text-xs">{p.description}</span>
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
