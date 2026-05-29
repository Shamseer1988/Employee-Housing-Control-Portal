import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { useAuth } from "./auth-store";

/**
 * Base URL strategy (relative; see PHASE 0 notes):
 *  - If NEXT_PUBLIC_API_URL is set at build time we honour it (native dev).
 *  - Otherwise calls go to "/api/v1" — same-origin via nginx — so the
 *    bundle works on localhost, LAN IPs, Tailscale, or the prod host
 *    without a rebuild.
 *
 * Auth model (Phase 1): JWTs live in httpOnly cookies. We send
 * withCredentials so the browser ships them automatically. For non-safe
 * HTTP methods we echo the matching csrf_*_token cookie back as
 * X-CSRF-TOKEN — Flask-JWT-Extended verifies it server-side, which kills
 * cross-site forgery on cookie auth.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: true,
});

const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = name + "=";
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
  }
  return null;
}

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method || "get").toLowerCase();
  if (UNSAFE_METHODS.has(method)) {
    // /auth/refresh validates the *refresh* CSRF cookie; everything else
    // validates the access cookie. The endpoint url is relative to BASE_URL
    // so a simple substring check is enough.
    const isRefresh = (config.url || "").includes("/auth/refresh");
    const csrf = readCookie(isRefresh ? "csrf_refresh_token" : "csrf_access_token");
    if (csrf) {
      config.headers = config.headers ?? {};
      (config.headers as Record<string, string>)["X-CSRF-TOKEN"] = csrf;
    }
  }
  return config;
});

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // No body, no bearer — the refresh cookie + X-CSRF-TOKEN (added by the
  // request interceptor above) is the entire credential surface.
  try {
    await api.post("/auth/refresh", {});
    return true;
  } catch {
    useAuth.getState().clear();
    return false;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (!original || error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }
    // Don't infinite-loop trying to refresh the refresh call itself.
    if ((original.url || "").includes("/auth/refresh") ||
        (original.url || "").includes("/auth/login")) {
      return Promise.reject(error);
    }
    original._retried = true;
    refreshPromise ??= refreshAccessToken();
    const ok = await refreshPromise;
    refreshPromise = null;
    if (!ok) return Promise.reject(error);
    return api.request(original);
  },
);

export type ApiResponse<T> = {
  success: boolean;
  message?: string;
  data: T;
  meta?: Record<string, unknown>;
  details?: string;
};
