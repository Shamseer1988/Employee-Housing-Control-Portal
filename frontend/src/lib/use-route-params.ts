"use client";

import { use } from "react";

/**
 * Unwraps a Next.js route params object that may be a Promise (Next 15+)
 * or a plain object (Next 14.x). On Next 14, calling React's `use()`
 * with a plain object throws (React minified error #438), so we detect
 * the shape and only call `use()` when given a thenable.
 *
 * `use()` is allowed in conditional branches by design.
 */
export function useRouteParams<T extends Record<string, string>>(
  params: T | Promise<T>,
): T {
  if (
    params &&
    typeof params === "object" &&
    typeof (params as Promise<T>).then === "function"
  ) {
    return use(params as Promise<T>);
  }
  return params as T;
}
