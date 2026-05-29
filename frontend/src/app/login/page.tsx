"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-store";
import { useCompanyName, useCompanyLogo } from "@/lib/public-settings";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { setUser, setBootstrapped, user, hydrated } = useAuth();
  const companyName = useCompanyName();
  const logoUrl = useCompanyLogo();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = search.get("next") || "/dashboard";

  useEffect(() => {
    if (hydrated && user) {
      router.replace(next);
    }
  }, [hydrated, user, router, next]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await api.post("/auth/login", { username, password });
      // Cookies were set by the server. Only the user profile rides in
      // the body — that's all we keep locally.
      setUser(resp.data.data.user);
      setBootstrapped(true);
      router.replace(next);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Sign in failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="glass-strong w-full max-w-md rounded-2xl p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-10 w-10 rounded-xl object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 grid place-items-center text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
          )}
          <div>
            <h1 className="text-lg font-semibold">{companyName}</h1>
            <p className="text-xs text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="username">
              Username or email
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="admin"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-card/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-muted-foreground">
          Default super user: <code className="font-mono">admin</code> / set via <code>SUPERUSER_PASSWORD</code>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
