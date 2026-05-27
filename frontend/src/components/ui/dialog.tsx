"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="dialog" aria-modal="true" aria-label={title}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`glass-strong w-full ${sizes[size]} rounded-2xl p-6 relative max-h-[90vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Close dialog"
              onClick={onClose}
              className="absolute top-3 right-3 h-8 w-8 rounded-md hover:bg-accent grid place-items-center"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="text-lg font-semibold mb-4 pr-8">{title}</h2>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children, span = 1 }: { label: string; children: React.ReactNode; span?: 1 | 2 }) {
  return (
    <div className={`space-y-1 ${span === 2 ? "col-span-2" : ""}`}>
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full h-9 rounded-md border border-input bg-card/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const textareaClass =
  "w-full min-h-[80px] rounded-md border border-input bg-card/60 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export const selectClass = inputClass;
