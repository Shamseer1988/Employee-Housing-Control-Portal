"use client";

import { useAuth } from "@/lib/auth-store";

export function Can({ perm, children, fallback = null }: { perm: string; children: React.ReactNode; fallback?: React.ReactNode }) {
  const has = useAuth((s) => s.has);
  return <>{has(perm) ? children : fallback}</>;
}
