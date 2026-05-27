"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="glass-strong w-full max-w-md rounded-2xl p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-blue-600 grid place-items-center text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">PUG Accommodation Portal</h1>
            <p className="text-xs text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.href = "/dashboard";
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full h-10 rounded-md border border-input bg-card/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@pugroup.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="w-full h-10 rounded-md border border-input bg-card/60 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            className="w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-xs text-center text-muted-foreground">
          Authentication wiring lands in Phase 2 ·{" "}
          <Link href="/dashboard" className="underline">
            Skip to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
