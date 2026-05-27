"use client";

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
  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 animate-fade-in">
      <div className={`glass-strong w-full ${sizes[size]} rounded-2xl p-6 relative`}>
        <button
          aria-label="Close"
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 rounded-md hover:bg-accent grid place-items-center"
        >
          <X className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold mb-4 pr-8">{title}</h2>
        {children}
      </div>
    </div>
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
