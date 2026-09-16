import type { NextConfig } from "next"
import { createZoneConfig } from "@atpost/config/next"
import { API_CSP, resolveAdminBasePath, staticSecurityHeaders } from "./src/lib/security/headers"

/**
 * The admin console, servable two ways from one codebase:
 *
 *   own host   ADMIN_BASE_PATH=""      admin.cleestudio.com/…  (production target)
 *   zone       ADMIN_BASE_PATH unset   /admin                  (local dev, e2e)
 *
 * Both are read at BUILD time — Next bakes basePath and NEXT_PUBLIC_* into the
 * bundle — so the own-host image is built with `--build-arg ADMIN_BASE_PATH=`.
 *
 * It starts from the shared zone defaults (transpiled workspace packages,
 * standalone output, the /v1 → /api/proxy rewrite) and overrides what an
 * own-host console decides for itself. `createZoneConfig` refuses a root
 * basePath — correctly, for consumer zones — so it is called with "/admin" and
 * the base path is replaced here. Consumer zones are untouched.
 *
 * Security headers are this app's alone (src/lib/security/headers.ts). The
 * page CSP carries a per-request nonce, so src/middleware.ts sets it; the
 * headers here are the ones that never vary.
 */
const basePath = resolveAdminBasePath(process.env.ADMIN_BASE_PATH)
const production = process.env.NODE_ENV === "production"
const zone = createZoneConfig({ basePath: "/admin" })
const authOrigin = (process.env.AUTH_APP_URL || "").replace(/\/$/, "")

/**
 * Where a signed-out admin is sent. As a zone, the shell's /login sits on the
 * same host. On its own host there is no such page next door, so the URL must
 * be configured (an empty value makes the console say so instead of looping).
 */
const signInUrl =
  // `||`, not `??`: the Dockerfile passes an empty build arg when unset.
  process.env.NEXT_PUBLIC_ADMIN_SIGN_IN_URL ||
  (authOrigin
    ? `${authOrigin}/login?redirect=${encodeURIComponent(basePath || "/")}`
    : basePath
      ? `/login?redirect=${encodeURIComponent(basePath)}`
      : "")

const nextConfig: NextConfig = {
  ...zone,
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    // The browser client prefixes /v1 and the refresh route with this; it must
    // equal the base path, so it is derived rather than configured twice.
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? basePath,
    NEXT_PUBLIC_ADMIN_BASE_PATH: basePath,
    NEXT_PUBLIC_ADMIN_SIGN_IN_URL: signInUrl,
  },
  async redirects() {
    // As a zone, /admin/login and /admin/register forward to the one auth page
    // (same behaviour as before). On its own host a "/login" → "/login"
    // redirect would loop, so it exists only when an auth app is configured.
    if (!basePath && !authOrigin) return []
    const returnTo = encodeURIComponent(basePath || "/")
    return ["login", "register"].map((page) => ({
      source: `${basePath}/${page}`,
      destination: `${authOrigin}/${page}?redirect=${returnTo}`,
      permanent: false,
      basePath: false as const,
    }))
  },
  async headers() {
    const noStore = [
      { key: "Content-Security-Policy", value: API_CSP },
      { key: "Cache-Control", value: "no-store" },
    ]
    return [
      { source: "/:path*", headers: staticSecurityHeaders({ production }) },
      { source: "/api/:path*", headers: noStore },
      { source: "/v1/:path*", headers: noStore },
    ]
  },
}

export default nextConfig
