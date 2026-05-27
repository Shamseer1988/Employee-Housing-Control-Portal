"use client";

import { Bell, Search, UserCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function Topbar() {
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
          <button
            aria-label="Notifications"
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card/60 hover:bg-accent"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive" />
          </button>
          <ThemeToggle />
          <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 text-sm hover:bg-accent">
            <UserCircle2 className="h-5 w-5" />
            <span className="hidden md:inline">Guest</span>
          </button>
        </div>
      </div>
    </header>
  );
}
