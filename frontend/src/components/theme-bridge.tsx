"use client";

import { useEffect } from "react";
import { usePublicSettings, usePublicSettingsLoader, type AccentColor } from "@/lib/public-settings";

// HSL triplets used as CSS variable values (Tailwind reads them via hsl(var(--primary)) ).
const ACCENT_HSL: Record<AccentColor, { primary: string; ring: string }> = {
  blue:    { primary: "221 83% 53%", ring: "221 83% 53%" },
  emerald: { primary: "152 81% 39%", ring: "152 81% 39%" },
  violet:  { primary: "262 83% 58%", ring: "262 83% 58%" },
  amber:   { primary: "38 92% 50%",  ring: "38 92% 50%"  },
  rose:    { primary: "346 77% 50%", ring: "346 77% 50%" },
};

/**
 * Bridges public UI settings to the live document:
 *  - sets --primary / --ring CSS variables based on the configured accent
 *  - toggles `data-glass`, `data-compact`, `data-density` on <html>
 * Tailwind classes can then react via `[data-glass="off"]` selectors.
 */
export function ThemeBridge() {
  usePublicSettingsLoader();
  const { accentColor, glassmorphism, compactMode, tableDensity, loaded } = usePublicSettings();

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const accent = ACCENT_HSL[accentColor] ?? ACCENT_HSL.blue;
    root.style.setProperty("--primary", accent.primary);
    root.style.setProperty("--ring", accent.ring);
    root.dataset.glass = glassmorphism ? "on" : "off";
    root.dataset.compact = compactMode ? "on" : "off";
    root.dataset.density = tableDensity;
  }, [accentColor, glassmorphism, compactMode, tableDensity, loaded]);

  return null;
}
