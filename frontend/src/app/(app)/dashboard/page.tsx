import {
  Building2,
  BedDouble,
  Users,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Plane,
  Clock,
} from "lucide-react";

const cards = [
  { label: "Total Properties", value: "—", icon: Building2, accent: "from-blue-500 to-indigo-500" },
  { label: "Total Beds", value: "—", icon: BedDouble, accent: "from-emerald-500 to-teal-500" },
  { label: "Occupied Beds", value: "—", icon: CheckCircle2, accent: "from-green-500 to-emerald-600" },
  { label: "Empty Beds", value: "—", icon: BedDouble, accent: "from-amber-500 to-orange-500" },
  { label: "Maintenance Beds", value: "—", icon: Wrench, accent: "from-rose-500 to-pink-600" },
  { label: "Employees Assigned", value: "—", icon: Users, accent: "from-violet-500 to-purple-600" },
  { label: "On Vacation", value: "—", icon: Plane, accent: "from-sky-500 to-cyan-600" },
  { label: "Agreements Expiring", value: "—", icon: AlertTriangle, accent: "from-red-500 to-rose-600" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Centralized view of accommodation across all PUG group companies.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Phase 1 · Foundation</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="glass rounded-xl p-4 relative overflow-hidden">
              <div
                className={`absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br ${c.accent} opacity-20 blur-2xl`}
              />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{c.label}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-2xl font-semibold">{c.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">Awaiting Phase 3+ data</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4 lg:col-span-2 min-h-[280px]">
          <h2 className="text-sm font-semibold mb-2">Occupancy by Property</h2>
          <div className="h-56 grid place-items-center text-sm text-muted-foreground">
            Charts wired up in Phase 9
          </div>
        </div>
        <div className="glass rounded-xl p-4 min-h-[280px]">
          <h2 className="text-sm font-semibold mb-2">Recent Activity</h2>
          <div className="h-56 grid place-items-center text-sm text-muted-foreground">
            Activity timeline pending
          </div>
        </div>
      </div>
    </div>
  );
}
