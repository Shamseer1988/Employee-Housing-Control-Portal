"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";

type PublicSettings = {
  companyName: string;
  logoUrl: string | null;
  loaded: boolean;
  load: () => Promise<void>;
};

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export const usePublicSettings = create<PublicSettings>((set, get) => ({
  companyName: process.env.NEXT_PUBLIC_APP_NAME || "PUG Accommodation Portal",
  logoUrl: null,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const resp = await fetch(`${BASE_URL}/api/v1/settings/public`);
      if (!resp.ok) return;
      const body = await resp.json();
      const data = body?.data ?? {};
      set({
        companyName: data["company.name"] || get().companyName,
        logoUrl: data["company.logo_url"] || null,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));

export function usePublicSettingsLoader() {
  const load = usePublicSettings((s) => s.load);
  const loaded = usePublicSettings((s) => s.loaded);
  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);
}

export function useCompanyName() {
  usePublicSettingsLoader();
  return usePublicSettings((s) => s.companyName);
}

export function useCompanyLogo() {
  usePublicSettingsLoader();
  return usePublicSettings((s) => s.logoUrl);
}

// Convenience for non-component code paths (e.g. <head> title)
export function getPublicSettingsSnapshot() {
  return {
    companyName: usePublicSettings.getState().companyName,
    logoUrl: usePublicSettings.getState().logoUrl,
  };
}

// Allow a component to force a refresh after an admin saves new branding.
export async function refreshPublicSettings() {
  usePublicSettings.setState({ loaded: false });
  await usePublicSettings.getState().load();
}

// Re-export to keep imports terse.
export type { PublicSettings };
export { useState };
