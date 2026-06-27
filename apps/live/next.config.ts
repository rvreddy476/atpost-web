import type { NextConfig } from "next"

// Commerce Multi-Zone — owns the `/shop` path prefix. The host (apps/shell)
// rewrites `/shop/*` to this app's deployment (see MIGRATION.md). basePath +
// assetPrefix keep this zone's routes and static assets namespaced so zones
// don't collide.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  basePath: "/live",
  assetPrefix: "/live",
  compress: true, // gzip responses (also handled at the CDN/ALB in prod)
  poweredByHeader: false, // drop X-Powered-By (smaller responses, less fingerprinting)
  // Source-only shared packages must be transpiled by this app.
  transpilePackages: ["@atpost/ui", "@atpost/api-client", "@atpost/types"],
  // Bundle-size: rewrite barrel imports (@atpost/ui, lucide-react) to direct
  // module imports so only used components ship. Pairs with sideEffects:false
  // on the packages for proper tree-shaking.
  experimental: {
    optimizePackageImports: ["@atpost/ui", "@atpost/types", "lucide-react"],
  },
  images: {
    // Serve modern formats (smaller payloads) + cache optimized images long.
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2_592_000, // 30 days
    remotePatterns: [
      { protocol: "https", hostname: "*.cleestudio.com" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  // Browser calls /v1/* → same-origin proxy (which forwards to the gateway).
  // basePath applies automatically, so this is /shop/v1 → /shop/api/proxy.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: "/api/proxy/:path*" }]
  },
}

export default nextConfig
