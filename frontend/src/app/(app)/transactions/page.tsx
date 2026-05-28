"use client";

import Link from "next/link";
import {
  BedDouble, ArrowRightLeft, RefreshCcw, Plane, FileX, Wrench, FileText,
} from "lucide-react";
import { useAuth } from "@/lib/auth-store";

type Card = {
  href: string;
  title: string;
  desc: string;
  icon: typeof BedDouble;
  perm?: string;
  comingSoon?: boolean;
};

const cards: Card[] = [
  {
    href: "/transactions/assignments",
    title: "Room / Bed Assignment",
    desc: "Allocate an empty bed to an employee. Updates bed status and employee accommodation.",
    icon: BedDouble,
    perm: "assignment.create",
  },
  {
    href: "/transactions/transfers",
    title: "Transfer / Room Change / Bed Change",
    desc: "Move an employee from one bed to another. Old bed becomes empty, new bed occupied.",
    icon: ArrowRightLeft,
    perm: "transfer.create",
  },
  {
    href: "/transactions/cancellations",
    title: "Accommodation Cancellation",
    desc: "Release a bed when an employee resigns, is terminated, or no longer needs housing.",
    icon: FileX,
    perm: "cancellation.create",
  },
  {
    href: "/transactions/vacations",
    title: "Employee Vacation",
    desc: "Record an employee on leave. Optionally reserve the bed for their return.",
    icon: Plane,
    perm: "vacation.create",
  },
  {
    href: "/transactions/renewals",
    title: "Landlord Agreement Renewal",
    desc: "Renew a property's tenancy agreement, archiving the previous one.",
    icon: RefreshCcw,
    perm: "renewal.create",
  },
  {
    href: "/transactions/maintenance",
    title: "Property / Room / Bed Maintenance",
    desc: "Block or release units for maintenance with proper restoration history.",
    icon: Wrench,
    perm: "maintenance.manage",
  },
  {
    href: "/transactions/bulk",
    title: "Bulk Allocation / Bulk Transfer",
    desc: "Upload Excel to allocate or transfer many employees in one batch.",
    icon: FileText,
    perm: "assignment.create",
    comingSoon: true,
  },
];

export default function TransactionsHubPage() {
  const has = useAuth((s) => s.has);
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Operational actions that change employee allocations or property state. Every action is audited.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {cards.map((c) => {
          const allowed = !c.perm || has(c.perm);
          const disabled = c.comingSoon || !allowed;
          const Icon = c.icon;
          const className =
            "glass rounded-xl p-4 block " +
            (disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-accent/30 transition-colors");

          const content = (
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 grid place-items-center shrink-0">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm">{c.title}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
                {c.comingSoon && (
                  <div className="mt-2 inline-flex text-[10px] uppercase tracking-wide rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                    Coming soon
                  </div>
                )}
                {!allowed && !c.comingSoon && (
                  <div className="mt-2 inline-flex text-[10px] uppercase tracking-wide rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                    Permission required
                  </div>
                )}
              </div>
            </div>
          );

          if (disabled) {
            return <div key={c.href} className={className}>{content}</div>;
          }
          return <Link key={c.href} href={c.href} className={className}>{content}</Link>;
        })}
      </div>
    </div>
  );
}
