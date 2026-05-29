/**
 * Centralized TanStack Query key factories (Phase 7).
 *
 * Why this exists: query keys are how Query identifies a cached entry.
 * Typos (`"employees"` vs `["employees", undefined]`) silently produce
 * separate cache entries that never reconcile. A factory module makes
 * the keys typed and grep-able, and gives mutations a single source of
 * truth to call when they invalidate ("after a successful create, what
 * lists do I need to refetch?").
 *
 * Migrated pages use this. Unmigrated pages keep their hand-rolled
 * fetch+useState until they're brought across — see the bottom of this
 * file for the running todo list.
 */

export const keys = {
  employees: {
    all: () => ["employees"] as const,
    list: (filters: Record<string, unknown> = {}) =>
      ["employees", "list", filters] as const,
    detail: (id: number | string) =>
      ["employees", "detail", String(id)] as const,
  },
  properties: {
    all: () => ["properties"] as const,
    list: (filters: Record<string, unknown> = {}) =>
      ["properties", "list", filters] as const,
    detail: (id: number | string) =>
      ["properties", "detail", String(id)] as const,
    occupancy: (id: number | string) =>
      ["properties", "occupancy", String(id)] as const,
  },
  divisions: {
    all: () => ["divisions"] as const,
    list: () => ["divisions", "list"] as const,
  },
  dashboard: {
    summary: () => ["dashboard", "summary"] as const,
    byProperty: () => ["dashboard", "by-property"] as const,
    monthly: () => ["dashboard", "monthly"] as const,
    activity: () => ["dashboard", "activity"] as const,
    alerts: () => ["dashboard", "alerts"] as const,
  },
} as const;

/* ------------------------------------------------------------------
 * Pages still hand-rolled (Phase 7 migration TODO)
 * ------------------------------------------------------------------
 *  - app/(app)/landlords/page.tsx
 *  - app/(app)/properties/page.tsx
 *  - app/(app)/properties/[id]/page.tsx
 *  - app/(app)/reports/page.tsx
 *  - app/(app)/reports/[slug]/page.tsx
 *  - app/(app)/alerts/page.tsx
 *  - app/(app)/users/page.tsx
 *  - app/(app)/divisions/page.tsx
 *  - app/(app)/audit/page.tsx
 *  - app/(app)/approvals/page.tsx
 *  - app/(app)/transactions/page.tsx
 *  - app/(app)/settings/page.tsx
 *
 * Migration recipe (copy from employees/page.tsx):
 *   1. Add a `keys.<resource>.list(filters)` factory above.
 *   2. Replace `useState + useEffect` with `useQuery({ queryKey, queryFn })`.
 *   3. Replace POST/PUT/DELETE handlers with `useMutation` that
 *      invalidates the list key on success.
 *   4. Loading/error/empty: <Skeleton /> / <ErrorState /> / <EmptyState />.
 * ------------------------------------------------------------------ */
