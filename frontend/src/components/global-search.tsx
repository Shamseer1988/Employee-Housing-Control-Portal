"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Building2, BedDouble, Users, Key, DoorOpen, ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";

type Hit = {
  id: number;
  code?: string;
  label: string;
  sublabel: string;
  href: string;
};

type Results = {
  properties: Hit[];
  rooms: Hit[];
  beds: Hit[];
  employees: Hit[];
  landlords: Hit[];
};

const EMPTY: Results = { properties: [], rooms: [], beds: [], employees: [], landlords: [] };

const GROUPS: { key: keyof Results; label: string; icon: typeof Building2 }[] = [
  { key: "properties", label: "Properties", icon: Building2 },
  { key: "employees", label: "Employees", icon: Users },
  { key: "rooms", label: "Rooms", icon: DoorOpen },
  { key: "beds", label: "Beds", icon: BedDouble },
  { key: "landlords", label: "Landlords", icon: Key },
];

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // Flatten results into a navigation order so ↑↓ works across groups.
  const flat = useMemo(() => {
    const out: { group: string; hit: Hit }[] = [];
    for (const g of GROUPS) {
      for (const hit of results[g.key]) out.push({ group: g.label, hit });
    }
    return out;
  }, [results]);

  const total = flat.length;

  // Debounced search
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(EMPTY);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get("/search", { params: { q: q.trim() } });
        if (!cancelled) {
          setResults(r.data.data as Results);
          setActiveIndex(0);
        }
      } catch {
        if (!cancelled) setResults(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Cmd/Ctrl+K focuses the input from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Click-outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = useCallback((hit: Hit) => {
    router.push(hit.href);
    setOpen(false);
    setQ("");
  }, [router]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => (i + 1) % Math.max(total, 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => (i - 1 + Math.max(total, 1)) % Math.max(total, 1)); return; }
    if (e.key === "Enter" && flat[activeIndex]) { e.preventDefault(); go(flat[activeIndex].hit); return; }
  };

  return (
    <div ref={wrapperRef} className="relative flex-1 max-w-md hidden sm:block">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search properties, rooms, employees…"
        aria-label="Search"
        className="w-full h-9 rounded-md border border-input bg-card/60 pl-9 pr-12 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5 pointer-events-none">
        ⌘K
      </kbd>

      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 mt-1 max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl z-50">
          {loading && total === 0 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && total === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground text-center">
              No matches for &ldquo;{q}&rdquo;
            </div>
          )}
          {total > 0 && (() => {
            let cursor = 0;
            return GROUPS.map((g) => {
              const hits = results[g.key];
              if (hits.length === 0) return null;
              const Icon = g.icon;
              return (
                <div key={g.key} className="py-1">
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground bg-card/60">
                    {g.label}
                  </div>
                  {hits.map((hit) => {
                    const myIndex = cursor++;
                    const active = myIndex === activeIndex;
                    return (
                      <button
                        key={`${g.key}-${hit.id}`}
                        type="button"
                        onClick={() => go(hit)}
                        onMouseEnter={() => setActiveIndex(myIndex)}
                        className={
                          "w-full flex items-center gap-3 px-3 py-2 text-left text-sm " +
                          (active ? "bg-accent" : "hover:bg-accent/50")
                        }
                      >
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{hit.label}</div>
                          {hit.sublabel && (
                            <div className="text-xs text-muted-foreground truncate">{hit.sublabel}</div>
                          )}
                        </div>
                        <ArrowRight className={"h-3.5 w-3.5 shrink-0 " + (active ? "text-foreground" : "text-muted-foreground")} />
                      </button>
                    );
                  })}
                </div>
              );
            });
          })()}
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
