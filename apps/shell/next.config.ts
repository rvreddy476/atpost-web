import type { NextConfig, Rewrite } from "next"

const zones = [
  ["/shop", "COMMERCE_ZONE_URL", "http://localhost:3001"],
  ["/admin", "ADMIN_ZONE_URL", "http://localhost:3002"],
  ["/match", "DATING_ZONE_URL", "http://localhost:3003"],
  ["/social", "SOCIAL_ZONE_URL", "http://localhost:3004"],
  ["/community", "COMMUNITY_ZONE_URL", "http://localhost:3005"],
  ["/creator", "CREATOR_ZONE_URL", "http://localhost:3006"],
  ["/messenger", "MESSENGER_ZONE_URL", "http://localhost:3007"],
  ["/live", "LIVE_ZONE_URL", "http://localhost:3008"],
  ["/memories", "MEMORIES_ZONE_URL", "http://localhost:3009"],
  ["/apps", "MINIAPPS_ZONE_URL", "http://localhost:3010"],
] as const

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  compress: true,
  async rewrites() {
    const beforeFiles: Rewrite[] = zones.flatMap(([path, envName, localUrl]) => {
      const origin = process.env[envName] || localUrl
      return [
        { source: path, destination: `${origin}${path}` },
        { source: `${path}/:path*`, destination: `${origin}${path}/:path*` },
      ]
    })
    return { beforeFiles, afterFiles: [], fallback: [] }
  },
}

export default nextConfig
