import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios"
import { ADMIN_CSRF_COOKIE, readCookie } from "./cookies"

/**
 * The console's HTTP client. Admin-local on purpose: it authenticates with the
 * admin session (admin_* cookies), not the consumer one, and must not change
 * `@atpost/api-client`, which every consumer zone shares.
 *
 *   · withCredentials, no Authorization: the tokens are HttpOnly cookies that
 *     travel through this app's same-origin proxy (/v1 → /api/proxy), which
 *     forwards only the admin cookies.
 *   · Writes echo admin_csrf_token as X-CSRF-Token. Never minted locally.
 *   · A 401 triggers ONE refresh through POST /v1/auth/admin-session/refresh,
 *     shared by every request that failed together, then retries once. A
 *     refused refresh leaves the 401 standing; the shell then shows sign-in.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || ""

export const ADMIN_SESSION_ROUTES = {
  login: "/v1/auth/admin-session/login",
  verify2fa: "/v1/auth/admin-session/verify-2fa",
  refresh: "/v1/auth/admin-session/refresh",
  logout: "/v1/auth/admin-session/logout",
  stepUp: "/v1/auth/admin-session/step-up",
  status: "/v1/auth/admin-session",
} as const

/** Requests whose 401 means "not signed in", never "refresh and retry". */
const NO_REFRESH = [
  ADMIN_SESSION_ROUTES.login,
  ADMIN_SESSION_ROUTES.verify2fa,
  ADMIN_SESSION_ROUTES.refresh,
  ADMIN_SESSION_ROUTES.logout,
]

export function isWrite(method: string | undefined): boolean {
  return !!method && ["post", "put", "patch", "delete"].includes(method.toLowerCase())
}

export function shouldRefreshOn401(url: string | undefined): boolean {
  if (!url) return false
  const path = url.split("?")[0]
  return !NO_REFRESH.some((route) => path.endsWith(route))
}

const adminApi = axios.create({ baseURL: API_BASE, withCredentials: true })

adminApi.interceptors.request.use((config) => {
  if (isWrite(config.method)) {
    config.headers["X-Requested-With"] = "XMLHttpRequest"
    const csrf = typeof document === "undefined" ? null : readCookie(document.cookie, ADMIN_CSRF_COOKIE)
    if (csrf) config.headers["X-CSRF-Token"] = csrf
  }
  return config
})

let refreshing: Promise<boolean> | null = null

function refreshAdminSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = adminApi
      .post(ADMIN_SESSION_ROUTES.refresh)
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

adminApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _adminRetry?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._adminRetry && shouldRefreshOn401(original.url)) {
      original._adminRetry = true
      if (await refreshAdminSession()) return adminApi(original)
    }
    return Promise.reject(error)
  },
)

/** Ends the admin session server-side. Never throws: signing out must always work locally. */
export async function adminSignOut(): Promise<void> {
  try {
    await adminApi.post(ADMIN_SESSION_ROUTES.logout)
  } catch {
    /* the server clears the cookies when it can; the caller navigates to sign-in regardless */
  }
}

/** A path inside this app, with its base path ("/admin" as a zone, "" on its own host). */
export function withBasePath(path: string): string {
  return `${process.env.NEXT_PUBLIC_ADMIN_BASE_PATH ?? ""}${path}`
}

export default adminApi
