"use client";

import { useEffect } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { create } from "zustand";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  durationMs: number;
};

type ToastStore = {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => number;
  dismiss: (id: number) => void;
};

const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (t) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set((s) => ({ items: [...s.items, { id, ...t }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "success", title, description, durationMs: 4000 }),
  error: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "error", title, description, durationMs: 6000 }),
  warning: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "warning", title, description, durationMs: 5000 }),
  info: (title: string, description?: string) =>
    useToastStore.getState().push({ tone: "info", title, description, durationMs: 4000 }),
};

// Extract a useful message from an axios error for showing to the user.
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
  const e = err as { response?: { data?: { message?: string; details?: string } }; message?: string };
  return e?.response?.data?.message || e?.response?.data?.details || e?.message || fallback;
}

const toneStyles: Record<ToastTone, { ring: string; icon: string; Icon: typeof CheckCircle2 }> = {
  success: { ring: "ring-emerald-500/40 border-emerald-500/40", icon: "text-emerald-500", Icon: CheckCircle2 },
  error: { ring: "ring-rose-500/40 border-rose-500/40", icon: "text-rose-500", Icon: XCircle },
  warning: { ring: "ring-amber-500/40 border-amber-500/40", icon: "text-amber-500", Icon: AlertTriangle },
  info: { ring: "ring-sky-500/40 border-sky-500/40", icon: "text-sky-500", Icon: Info },
};

export function Toaster() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);

  // Make toast keyboard-dismissable globally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && items.length > 0) {
        dismiss(items[items.length - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, dismiss]);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={4000}>
      {items.map((t) => {
        const s = toneStyles[t.tone];
        const Icon = s.Icon;
        return (
          <ToastPrimitive.Root
            key={t.id}
            duration={t.durationMs}
            onOpenChange={(open) => { if (!open) dismiss(t.id); }}
            className={
              "pointer-events-auto grid grid-cols-[auto,1fr,auto] items-start gap-3 rounded-lg border bg-card/95 backdrop-blur-md px-4 py-3 shadow-lg ring-1 " + s.ring +
              " data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right-4 data-[state=closed]:slide-out-to-right-4 data-[state=open]:fade-in data-[state=closed]:fade-out"
            }
          >
            <Icon className={"h-5 w-5 mt-0.5 " + s.icon} />
            <div className="min-w-0">
              <ToastPrimitive.Title className="text-sm font-medium leading-tight">{t.title}</ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="text-xs text-muted-foreground mt-0.5 break-words">{t.description}</ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Dismiss"
              className="h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport
        className="fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 outline-none sm:bottom-6 sm:right-6"
      />
    </ToastPrimitive.Provider>
  );
}
