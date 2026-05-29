"use client";

import { useEffect } from "react";
import { initSentry } from "@/lib/observability";

/**
 * Fires once on app mount. No-ops when NEXT_PUBLIC_SENTRY_DSN is unset
 * so dev builds and unconfigured deploys pay zero runtime cost.
 */
export function ObservabilityInit() {
  useEffect(() => {
    void initSentry();
  }, []);
  return null;
}
