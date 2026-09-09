import { createZoneConfig } from "@atpost/config/next"

const base = createZoneConfig({ basePath: "/tube" })

/**
 * The tube zone — long video.
 *
 * `createZoneConfig` maps `/v1/:path*` onto this zone's own proxy, and because
 * the zone has a basePath that rule matches `/tube/v1/*` — which is what the
 * api-client asks for, since its baseURL is the basePath.
 *
 * ── The HLS prefix problem is solved in the page, not here ────────────────
 * Exactly as in apps/social and apps/reels, and for exactly the same reason:
 * media-service's master playlist references its children as origin-absolute
 * paths (`/v1/media/{id}/hls/360p.m3u8`), which a player resolves against the
 * ORIGIN rather than against this zone's basePath. A second rewrite with
 * `basePath: false` is rejected by Next at boot, and the workaround for that
 * bakes this zone's own origin into its own config.
 *
 * So the fix lives where the knowledge is: `resolveUrl` in
 * src/tube/resolveUrl.ts, handed to the player, applied to PLAYLIST requests
 * only. Segment urls inside a child playlist are pre-signed absolute links on
 * the media host and must be passed through untouched.
 *
 * A video that shows a black frame and never starts, with nothing in the
 * console, is this going wrong. See also NEXT_PUBLIC_API_BASE_URL in
 * .env.local — it must be "/tube".
 */
const nextConfig = {
  ...base,
  transpilePackages: [
    ...(base.transpilePackages ?? []),
    "@momentum/analytics",
    // @momentum/chrome is listed and, as of this change, IMPORTED BY NOTHING
    // in this zone — the shell is src/chrome/ now, and the two constants
    // src/browse/states.tsx used to take from the package (`HOME_PATH`,
    // `signInHref`) moved to src/chrome/links.ts with the reasoning attached.
    //
    // The entry stays for two reasons, both deliberate. The watch page is
    // being built in parallel and may still reach for it; and dropping the
    // dependency properly means editing package.json and the workspace
    // lockfile, which is a bigger and more disruptive change than deleting a
    // line here. It is dead weight in the build graph, not a bug — and it is
    // recorded as dead so the next person removes it on purpose. The same
    // applies to the packages/chrome glob in tailwind.config.js.
    "@momentum/chrome",
    "@momentum/content",
    "@momentum/interactions",
    "@momentum/player",
  ],

  /**
   * `/tube/@{handle}` — the channel page's address.
   *
   * ── Why a rewrite and not a route ─────────────────────────────────────
   * The App Router cannot serve this shape directly, for two reasons that
   * are both hard rules rather than preferences:
   *
   *   · a directory named `@something` under `app/` is a PARALLEL ROUTE
   *     SLOT, not a URL segment — it never appears in a path at all;
   *   · two different dynamic slugs cannot share one level, and
   *     `app/[postId]` (the watch page) already owns the root of this zone.
   *
   * So the real route is `app/channel/[handle]` and this maps the pretty
   * URL onto it. The browser's address bar keeps `/tube/@{handle}` — a
   * rewrite is internal, not a redirect — and `channelHref` in
   * src/tube/channels.ts is the one place that URL is constructed.
   *
   * ── `beforeFiles` is load-bearing, not a default ──────────────────────
   * Rewrites returned as a plain ARRAY are `afterFiles`, which run only
   * once the filesystem and the dynamic routes have failed to match. By
   * then `/tube/@ada` has already matched `[postId]`, and the watch page
   * 404s on a segment that is not a UUID before this rule is ever
   * consulted. `beforeFiles` runs first, which is the whole point.
   *
   * The base config's own `/v1/:path*` rule is preserved as `afterFiles` —
   * exactly where it was, since a bare array meant `afterFiles` — so the
   * api-client's requests still reach this zone's proxy. Dropping it is a
   * zone whose every API call 404s.
   */
  async rewrites() {
    return {
      beforeFiles: [{ source: "/@:handle", destination: "/channel/:handle" }],
      afterFiles: [{ source: "/v1/:path*", destination: "/api/proxy/:path*" }],
      fallback: [],
    }
  },
}

export default nextConfig
