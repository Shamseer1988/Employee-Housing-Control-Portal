"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Search, UserCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/lib/auth-store";
import { api } from "@/lib/api";

export function Topbar() {
  const router = useRouter();
  const { user, clear } = useAuth();
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore network errors on logout */
    }
    clear();
    router.replace("/login");
  };

  return (
    <header className="h-16 sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="flex h-full items-center gap-4 px-4 lg:px-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search properties, rooms, employees…"
            className="w-full h-9 rounded-md border border-input bg-card/60 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 text-sm hover:bg-accent"
            >
              <UserCircle2 className="h-5 w-5" />
              <span className="hidden md:inline">{user?.full_name || user?.username || "Guest"}</span>
            </button>
            {open && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-md border border-border bg-card shadow-lg py-1 z-40"
                onMouseLeave={() => setOpen(false)}
              >
                <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
                  <div className="font-medium text-foreground">{user?.full_name}</div>
                  <div>{user?.email}</div>
                  {user?.roles?.length ? (
                    <div className="mt-1 truncate">{user.roles.map((r) => r.name).join(", ")}</div>
                  ) : null}
                </div>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
