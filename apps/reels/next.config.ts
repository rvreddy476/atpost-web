import { createZoneConfig } from "@atpost/config/next"

const base = createZoneConfig({ basePath: "/reels" })

/**
 * The reels zone.
 *
 * `createZoneConfig` maps `/v1/:path*` onto this zone's own proxy, and because
 * the zone has a basePath that rule matches `/reels/v1/*` — which is what the
 * api-client asks for, since its baseURL is the basePath.
 *
 * ── The HLS prefix problem is solved in the page, not here ────────────────
 * Exactly as in apps/social, and for exactly the same reason: media-service's
 * master playlist references its children as origin-absolute paths
 * (`/v1/media/{id}/hls/360p.m3u8`), which a player resolves against the ORIGIN
 * rather than against this zone's basePath. A second rewrite with
 * `basePath: false` is rejected by Next at boot, and the workaround for that
 * bakes this zone's own origin into its own config.
 *
 * So the fix lives where the knowledge is: `resolveUrl` in
 * src/reels/resolveUrl.ts, handed to the player, applied to PLAYLIST requests
 * only. Segment urls inside a child playlist are pre-signed absolute links on
 * the media host and must be passed through untouched.
 *
 * A reel that shows a black frame and never starts, with nothing in the
 * console, is this going wrong. See also NEXT_PUBLIC_API_BASE_URL in
 * .env.local — it must be "/reels".
 */
const nextConfig = {
  ...base,
  transpilePackages: [
    ...(base.transpilePackages ?? []),
    "@momentum/analytics",
    "@momentum/chrome",
    "@momentum/content",
    "@momentum/interactions",
    "@momentum/player",
  ],
}

export default nextConfig
