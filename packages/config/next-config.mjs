/**
 * Shared production defaults for independently deployed Next.js zones.
 * Zone-specific behavior remains explicit through the function arguments.
 *
 * @param {{ basePath: string }} options
 */
export function createZoneConfig({ basePath }) {
  if (!basePath.startsWith("/") || basePath === "/") {
    throw new Error(`Zone basePath must be a non-root absolute path; received: ${basePath}`)
  }

  return {
    reactStrictMode: true,
    output: "standalone",
    basePath,
    assetPrefix: basePath,
    compress: true,
    poweredByHeader: false,
    transpilePackages: ["@atpost/ui", "@atpost/api-client", "@atpost/types", "@atpost/form"],
    experimental: {
      optimizePackageImports: ["@atpost/ui", "@atpost/types", "lucide-react"],
    },
    images: {
      formats: ["image/avif", "image/webp"],
      minimumCacheTTL: 2_592_000,
      remotePatterns: [
        { protocol: "https", hostname: "*.cleestudio.com" },
        ...(process.env.NODE_ENV === "development"
          ? [{ protocol: "http", hostname: "localhost" }]
          : []),
      ],
    },
    async rewrites() {
      return [{ source: "/v1/:path*", destination: "/api/proxy/:path*" }]
    },
    async redirects() {
      const authOrigin = (process.env.AUTH_APP_URL || '').replace(/\/$/, '')
      const returnTo = encodeURIComponent(basePath)
      return [
        { source: `${basePath}/login`, destination: `${authOrigin}/login?redirect=${returnTo}`, permanent: false, basePath: false },
        { source: `${basePath}/register`, destination: `${authOrigin}/register?redirect=${returnTo}`, permanent: false, basePath: false },
      ]
    },
    async headers() {
      return [{
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      }]
    },
  }
}
