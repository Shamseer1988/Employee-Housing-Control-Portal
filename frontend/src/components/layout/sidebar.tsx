"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Users,
  BedDouble,
  ArrowRightLeft,
  FileSpreadsheet,
  Settings,
  Shield,
  Bell,
  Briefcase,
  ClipboardList,
  Key,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { useCompanyName, useCompanyLogo } from "@/lib/public-settings";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; perm?: string };

const nav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/properties", label: "Properties", icon: Building2, perm: "property.view" },
  { href: "/landlords", label: "Landlords", icon: Key, perm: "landlord.view" },
  { href: "/rooms", label: "Rooms & Beds", icon: BedDouble, perm: "room.view" },
  { href: "/employees", label: "Employees", icon: Users, perm: "employee.view" },
  { href: "/divisions", label: "Divisions", icon: Briefcase, perm: "division.view" },
  { href: "/transactions", label: "Transactions", icon: ArrowRightLeft, perm: "assignment.view" },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, perm: "assignment.view" },
  { href: "/reports", label: "Reports", icon: FileSpreadsheet, perm: "report.view" },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/users", label: "Users & Roles", icon: Shield, perm: "user.view" },
  { href: "/audit", label: "Audit Log", icon: ClipboardList, perm: "audit.view" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "settings.view" },
];

export function Sidebar() {
  const pathname = usePathname();
  const has = useAuth((s) => s.has);
  const [pendingTotal, setPendingTotal] = useState(0);
  const companyName = useCompanyName();
  const logoUrl = useCompanyLogo();

  useEffect(() => {
    if (!has("assignment.view")) return;
    const fetch = () => {
      api.get("/approvals/counts")
        .then((r) => setPendingTotal(r.data.data?.total ?? 0))
        .catch(() => {});
    };
    fetch();
    const t = setInterval(fetch, 60_000);
    return () => clearInterval(t);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const items = nav.filter((n) => !n.perm || has(n.perm));

  return (
    <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-card/40 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-border">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 grid place-items-center text-primary-foreground font-bold">
            {(companyName?.[0] ?? "P").toUpperCase()}
          </div>
        )}
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-sm font-semibold truncate" title={companyName}>{companyName}</span>
          <span className="text-xs text-muted-foreground">Accommodation</span>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname?.startsWith(item.href);
          const badge = item.href === "/approvals" ? pendingTotal : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-medium">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 text-xs text-muted-foreground border-t border-border">
        v0.12.0 · Phase 12
      </div>
    </aside>
  );
}
