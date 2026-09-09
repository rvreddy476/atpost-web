/**
 * Where this chrome is mounted, and how it addresses everywhere else.
 *
 * Pure: no React, no network, no DOM. That is what lets the one thing this
 * chrome can get catastrophically wrong — a link that resolves against the
 * wrong zone — be tested as arithmetic.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A `basePath` PROP AND NOT `process.env.NEXT_PUBLIC_API_BASE_URL`
 *
 * The two files this replaced (`zonePath` in AppFrame, `searchAction` in
 * SearchBox) both read that variable, and inside apps/social that was right:
 * the value is required to equal the zone's own basePath, so one deployment
 * constant answered "where am I". It stops being right the moment a SECOND
 * zone mounts the same chrome.
 *
 * Next does inline `NEXT_PUBLIC_*` into a transpiled workspace package, so
 * reading it here would technically work — and that is exactly the problem.
 * It would work by accident of the bundler, produce a different value in each
 * app from source that says nothing about either, and fail silently in a unit
 * test or a Storybook where the variable is simply unset. A component that
 * renders links into four zones should be told which one it is in.
 *
 * So every app states it once, at the mount point:
 *
 *     <AppFrame basePath="/social">   apps/social/src/app/layout.tsx
 *     <AppFrame basePath="/reels">    apps/reels/src/app/(browse)/layout.tsx
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FAILURE THIS FILE EXISTS TO PREVENT
 *
 * `next/link` prefixes the zone's basePath onto every href it is given. So
 * `<Link href="/social">` inside the reels zone asks for `/reels/social`,
 * which nothing serves. That is not hypothetical — it is a live bug found in
 * apps/reels (`states.tsx`, and the viewer's own back link), and it is why
 * ./NavItem.tsx has a paragraph about only ever using a plain `<a>` for
 * anything outside the current zone.
 *
 * The rule this file encodes: a path that is INSIDE the current zone may be a
 * client-side transition, and anything else must be a document navigation to
 * an absolute path. `zoneRelative` is the predicate that decides which.
 */

/* ── Where am I ───────────────────────────────────────────────────────────── */

/**
 * The absolute path of the route currently on screen.
 *
 * Next strips the basePath from `usePathname()`, so a page served at
 * `/social/search` reports `/search` and the zone root reports `/`. Every href
 * in ./destinations.ts is absolute, so they cannot be compared until the
 * prefix is put back.
 */
export function zonePath(basePath: string, pathname: string | null | undefined): string {
  if (!pathname) return basePath || "/"
  return pathname === "/" ? basePath || "/" : `${basePath}${pathname}`
}

/**
 * The same path as a link INSIDE this zone, or null when it is somewhere else.
 *
 * `/social/search` inside `/social` is `/search` — safe for `router.push`.
 * `/social/search` inside `/reels` is null — it must be a document navigation.
 *
 * The boundary check is a segment boundary and not `startsWith`, for the same
 * reason `currentDestinationId` uses one: `/socialising` starts with `/social`
 * and is not inside it. Getting that wrong here would push a browser to a
 * client-side route derived by chopping six characters off an unrelated path.
 */
export function zoneRelative(basePath: string, absolute: string): string | null {
  if (!basePath) return absolute
  if (absolute === basePath) return "/"
  if (!absolute.startsWith(basePath)) return null
  const rest = absolute.slice(basePath.length)
  if (!rest.startsWith("/") && !rest.startsWith("?")) return null
  return rest.startsWith("?") ? `/${rest}` : rest
}

/**
 * Where a signed-out browser is sent, and how it gets back to THIS zone.
 *
 * /login is served by the shell, never by a zone, so this is always an
 * absolute path reached with a plain `<a>` or `window.location`. The redirect
 * is the zone's own basePath, which is on the shell's allowlist by
 * construction — `moduleHomes` in apps/shell/src/lib/moduleRedirect.ts is the
 * same five prefixes the rewrite table carries.
 */
export function signInHref(basePath: string): string {
  return `/login?redirect=${encodeURIComponent(basePath || "/")}`
}

/* ── Search ───────────────────────────────────────────────────────────────── */

/**
 * The results page, absolutely, wherever the box is drawn.
 *
 * There is ONE search results page on the web and it is in the social zone.
 * The reels zone has no `/search` route and will not grow one — a second
 * results page would be a second opinion about the same index — so the box in
 * the reels header submits ACROSS zones, and this constant is why it can.
 *
 * When this moves, it moves here. Nothing else in the chrome spells it.
 */
export const SEARCH_PATH = "/social/search"

/**
 * The query, as it will be sent.
 *
 * ── This is the one definition, and it used to live in apps/social ────────
 * `apps/social/src/search/contract.ts` owned it, and this chrome imported it
 * as `@/search/contract` — the single reason the chrome could not be a package
 * at all. It is here now, and the search page re-exports it from here, so
 * there is still exactly one implementation and the dependency runs app →
 * package like every other.
 *
 * That direction is the right one on the merits and not just for the build:
 * the search BOX is what decides what string goes on the wire, and the results
 * page is downstream of it. The alternative — a `normalizeQuery` prop threaded
 * in from each app — would have meant apps/reels supplying a search-service
 * detail it has no other reason to know, or importing it from apps/social,
 * which is the thing zones may not do.
 *
 * What did NOT move is the rest of that contract. `queryTooLong`,
 * `MAX_QUERY_BYTES` and the row-to-card mapping are search-service's wire
 * shape and the results page's business; the chrome neither reads nor enforces
 * them. Trimming is the only rule the box needs, and it needs it for a reason
 * of its own: the service trims before deciding a query is empty, so a box
 * that submitted "   " would navigate to a page rendering results for a string
 * the service never saw.
 */
export function normalizeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim()
}

/** The results page for a query. Absolute; the caller decides how to go. */
export function searchHref(query: string): string {
  return `${SEARCH_PATH}?q=${encodeURIComponent(query)}`
}
