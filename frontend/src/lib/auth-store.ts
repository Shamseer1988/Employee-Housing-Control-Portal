"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = { id: number; code: string; name: string };

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
  is_super_user: boolean;
  roles: Role[];
  permissions: string[]; // codes; "*" means all
};

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  hydrated: boolean;
  setSession: (data: { user: AuthUser; access_token: string; refresh_token: string }) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
  setHydrated: (v: boolean) => void;
  has: (code: string) => boolean;
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hydrated: false,
      setSession: ({ user, access_token, refresh_token }) =>
        set({ user, accessToken: access_token, refreshToken: refresh_token }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
      setHydrated: (v) => set({ hydrated: v }),
      has: (code) => {
        const u = get().user;
        if (!u) return false;
        if (u.is_super_user) return true;
        if (u.permissions.includes("*")) return true;
        return u.permissions.includes(code);
      },
    }),
    {
      name: "pug-auth",
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
