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
] as const

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
  async rewrites() {
    const beforeFiles: Rewrite[] = [{ source: '/v1/:path*', destination: '/api/proxy/:path*' }, ...zones.flatMap(([path, envName, localUrl]) => {
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
