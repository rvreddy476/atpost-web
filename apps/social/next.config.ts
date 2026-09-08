import { createZoneConfig } from "@atpost/config/next"

const base = createZoneConfig({ basePath: "/social" })

/**
 * The social zone.
 *
 * `createZoneConfig` already maps `/v1/:path*` onto this zone's own proxy, and
 * because the zone has a basePath that rule matches `/social/v1/*` — which is
 * what the api-client asks for, since its baseURL is the basePath.
 *
 * ── The HLS problem is NOT solved here, deliberately ──────────────────────
 * media-service generates master playlists whose child references are absolute
 * paths:
 *
 *     #EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
 *     /v1/media/28d12557-.../hls/360p.m3u8
 *
 * A player resolves those against the ORIGIN, not against the page's basePath,
 * so they arrive as `/v1/media/...` with no `/social` on the front and this
 * zone answers 404. The obvious fix — a second rewrite with `basePath: false`
 * — is rejected by Next at boot ("rewrites urls outside of the basePath"),
 * and the workaround for THAT is to hardcode this zone's own origin into its
 * own config, which stops being true the moment it is deployed anywhere.
 *
 * So it is fixed where the knowledge actually lives: apps/social passes a
 * `resolveUrl` to the player, and the player applies it to playlist requests
 * only. Segments are absolute pre-signed URLs on the media host and must be
 * left exactly as they are. See src/feed/HomeFeed.tsx.
 */
const nextConfig = {
  ...base,
  transpilePackages: [
    ...(base.transpilePackages ?? []),
    "@momentum/analytics",
    "@momentum/content",
    "@momentum/interactions",
    "@momentum/player",
  ],
}

export default nextConfig
