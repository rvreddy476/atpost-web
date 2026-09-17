import type { NextConfig, Rewrite } from "next"

/**
 * The zones this shell routes to. One row per app that actually exists.
 *
 * Six rows were removed — /match, /community, /creator, /messenger, /live and
 * /memories — because the apps behind them were deleted. A rewrite to a port
 * nothing is listening on does not 404 cleanly: it hangs until the proxy gives
 * up and then answers 500, which reads as "the platform is broken" rather than
 * "that does not exist". Keeping this table equal to `ls apps/` is the whole
 * discipline.
 *
 * `apps/shell/src/lib/moduleRedirect.ts` holds the same list for the
 * post-login `?redirect=` allowlist. The two move together.
 */
const zones = [
  ["/shop", "COMMERCE_ZONE_URL", "http://localhost:3001"],
  ["/admin", "ADMIN_ZONE_URL", "http://localhost:3002"],
  ["/social", "SOCIAL_ZONE_URL", "http://localhost:3004"],
  ["/apps", "MINIAPPS_ZONE_URL", "http://localhost:3010"],
  ["/reels", "REELS_ZONE_URL", "http://localhost:3011"],
  ["/tube", "TUBE_ZONE_URL", "http://localhost:3012"],
] as const

/**
 * Where the admin console lives once it has its own host.
 *
 * Founder decision 2026-09-17: the console is served at the root of
 * admin.cleestudio.com (staging: admin.staging.cleestudio.com), not under
 * /admin on this host. Set `ADMIN_HOST_URL` to that origin and every /admin
 * request here becomes a redirect there — the console stops being a zone of
 * this shell and is another site with its own sign-in, host-only cookies and
 * CSP, and nothing of it is served under app.cleestudio.com. Left unset (local
 * dev, e2e) the /admin zone row above keeps working exactly as before.
 *
 * Read at RUNTIME, per environment: the shell image is built once, so this
 * cannot be a NEXT_PUBLIC_ value baked into the bundle. Only an http(s)
 * origin is accepted; anything else is ignored rather than trusted, so a
 * mis-set value falls back to dev behaviour instead of sending people
 * somewhere odd.
 */
function adminHostUrl(): string | null {
  const raw = process.env.ADMIN_HOST_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    return url.origin
  } catch {
    return null
  }
}
const adminHost = adminHostUrl()

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  transpilePackages: ['@atpost/api-client', '@momentum/brand'],
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
    ] }]
  },
  // Redirects run before rewrites, so with ADMIN_HOST_URL set the /admin zone
  // row is never consulted; it is also dropped from the rewrite table below so
  // the two cannot disagree. Temporary (307), not permanent: a 308 would be
  // cached by browsers for as long as they like, and the console's address is
  // a deployment decision that must stay changeable.
  async redirects() {
    if (!adminHost) return []
    return [
      { source: '/admin', destination: `${adminHost}/`, permanent: false },
      { source: '/admin/:path*', destination: `${adminHost}/:path*`, permanent: false },
    ]
  },
  async rewrites() {
    const routed = adminHost ? zones.filter(([path]) => path !== '/admin') : zones
    const beforeFiles: Rewrite[] = [{ source: '/v1/:path*', destination: '/api/proxy/:path*' }, ...routed.flatMap(([path, envName, localUrl]) => {
      const origin = process.env[envName] || localUrl
      return [
        { source: path, destination: `${origin}${path}` },
        { source: `${path}/:path*`, destination: `${origin}${path}/:path*` },
      ]
    })]
    return { beforeFiles, afterFiles: [], fallback: [] }
  },
}

export default nextConfig
