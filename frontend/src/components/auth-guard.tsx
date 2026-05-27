"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { api } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, hydrated, setUser, clear } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!accessToken) {
      const redirect = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${redirect}`);
      return;
    }
    if (!user) {
      api
        .get("/auth/me")
        .then((r) => setUser(r.data.data))
        .catch(() => {
          clear();
          router.replace("/login");
        });
    }
  }, [hydrated, accessToken, user, pathname, router, setUser, clear]);

  if (!hydrated || !accessToken || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }
  return <>{children}</>;
}
