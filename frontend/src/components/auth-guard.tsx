"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { api } from "@/lib/api";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, bootstrapped, setUser, clear, setBootstrapped } = useAuth();

  // Bootstrap once per page load: hit /auth/me with the existing cookie.
  // - 200 → we're signed in (refresh user profile).
  // - 401 → the cookie is gone/expired; clear store and redirect to login.
  useEffect(() => {
    if (!hydrated || bootstrapped) return;
    api
      .get("/auth/me")
      .then((r) => setUser(r.data.data))
      .catch(() => clear())
      .finally(() => setBootstrapped(true));
  }, [hydrated, bootstrapped, setUser, clear, setBootstrapped]);

  // After bootstrap, route the user based on the verified session state.
  useEffect(() => {
    if (!hydrated || !bootstrapped) return;
    if (!user) {
      const redirect = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${redirect}`);
    }
  }, [hydrated, bootstrapped, user, pathname, router]);

  if (!hydrated || !bootstrapped || !user) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
      </div>
    );
  }
  return <>{children}</>;
}
