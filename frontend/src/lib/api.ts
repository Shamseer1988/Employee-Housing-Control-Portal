import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { useAuth } from "./auth-store";

/**
 * Base URL strategy:
 *  - If `NEXT_PUBLIC_API_URL` is set at build time (typically only in
 *    native dev where the API runs on a different port), use it.
 *  - Otherwise use a relative URL so the browser sends API requests to
 *    whatever host served the page. nginx in front of the stack proxies
 *    `/api/*` to the backend, so the app works regardless of whether
 *    the user typed `localhost`, the LAN IP, a Tailscale name, or a
 *    public hostname.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setSession, user, clear } = useAuth.getState();
  if (!refreshToken || !user) return null;
  try {
    const resp = await axios.post(
      `${BASE_URL}/api/v1/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${refreshToken}` } },
    );
    const access = resp.data?.data?.access_token as string | undefined;
    if (!access) {
      clear();
      return null;
    }
    setSession({ user, access_token: access, refresh_token: refreshToken });
    return access;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (!original || error.response?.status !== 401 || original._retried) {
      return Promise.reject(error);
    }
    original._retried = true;
    refreshPromise ??= refreshAccessToken();
    const token = await refreshPromise;
    refreshPromise = null;
    if (!token) return Promise.reject(error);
    original.headers = original.headers ?? {};
    (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
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
