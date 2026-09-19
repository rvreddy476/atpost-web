/**
 * The feed's sections, and where they live in the URL.
 *
 * ── The set is not this file's invention ──────────────────────────────────
 * Android already shipped it. `FeedTab.kt` in the mobile repo declares exactly
 * three, in this order, and names them from the Figma home frame:
 *
 *     FOR_YOU("For You")  FOLLOWING("Following")  HASHTAG("HashTag")
 *
 * and `FeedScreen.kt` shows that the third is NOT a third timeline — For You
 * and Following are the same endpoint narrowed server-side, while HashTag is a
 * list of the day's trending tags, each opening its own post list. The labels
 * are copied character for character, capital T in "HashTag" included, because
 * the founder's ask was that the sections be the same ones, and a section that
 * is spelled differently on the web is a different section to the person
 * reading it. If that capital is wrong it is wrong in both places at once,
 * which is the only way a two-platform product stays one product.
 *
 * ── Why a query parameter and not a route ─────────────────────────────────
 * `?tab=following`, not `/social/following`. Three reasons, in order of weight:
 *
 *   1. A tab is a FILTER on one resource, not a different resource. Every tab
 *      is the same column of the same posts under the same heading — the thing
 *      that changes is which ones. `/social/search?q=…` in this zone made the
 *      same call for the same reason and its page.tsx writes the argument out
 *      at length; this is that argument applied to the same shape of problem.
 *   2. `?tag=` composes. The HashTag tab has a second coordinate — which tag —
 *      and `?tab=hashtag&tag=momentum` says that in the vocabulary the URL
 *      already has. `/social/hashtag/momentum` would be a second, differently
 *      shaped way of saying a thing of the same kind.
 *   3. A route is a file. `app/page.tsx` is the only route this zone serves and
 *      the shell rewrites `/social/:path*` here; three new routes would be
 *      three new files outside this feature's boundary and a shell table that
 *      has to agree with them. A parameter needs neither.
 *
 * For You carries NO parameter. It is the default and the front door, so its
 * URL is the bare one — a canonical `/social` rather than a `/social?tab=` that
 * every share and every bookmark would carry around.
 *
 * ── Everything here is pure ───────────────────────────────────────────────
 * Strings in, strings out, no React and no `window`. That is what makes the
 * parsing testable, and the parsing is the half most likely to be wrong: it
 * has to survive a hand-typed tab name, a `#` somebody pasted into `tag=`, and
 * a URL that already carries parameters this feature knows nothing about.
 */

/**
 * Every place the feed can be, as a URL spells it.
 *
 * ── "hashtag" is in this list and is NOT in the tab strip any more ────────
 * The founder's third change: exactly two tabs, For You and Following. The
 * third was a tab and is not one now — but it was never a third timeline (see
 * the note at the top of this file), it is a list of the day's tags, and it
 * has a URL people may already have sent each other:
 * `?tab=hashtag&tag=momentum`. Dropping the id would land every one of those
 * links on the default tab with no explanation, which is the one outcome
 * worse than an extra tab.
 *
 * So the VOCABULARY keeps three and the STRIP draws two. `FEED_TABS` below is
 * the strip; this is what a URL may say. The tag browser is reached from the
 * control beside the tabs — see ./FeedTabs.tsx — which is what it actually is:
 * a way of browsing, not a section of the timeline.
 */
export const FEED_TAB_IDS = ["for-you", "following", "hashtag"] as const

export type FeedTabId = (typeof FEED_TAB_IDS)[number]

/** The tab a URL with no `tab=` means, and the one an unreadable value falls to. */
export const DEFAULT_TAB: FeedTabId = "for-you"

/** The tag browser: a view of this page, reachable by URL, and not a tab. */
export const HASHTAG_VIEW: FeedTabId = "hashtag"

/** True when a route is one of the two the strip actually draws. */
export function isStripTab(tab: FeedTabId): boolean {
  return FEED_TABS.some((t) => t.id === tab)
}

export interface FeedTabDef {
  id: FeedTabId
  /** User-visible, and copied from the Android enum. See the note above. */
  label: string
  /**
   * What a screen reader is told the tab controls, beyond its label. The
   * visible labels are three words with no shared noun between them, so the
   * accessible name says which noun: "For You posts", not just "For You".
   */
  accessibleLabel: string
}

/**
 * THE STRIP. Two entries, and the founder's third change is that it is two.
 *
 * The labels are still Android's, character for character — the ask that the
 * sections be the same sections has not changed, only how many of them are a
 * tab. `HashTag` left this list and stayed in `FEED_TAB_IDS` above.
 */
export const FEED_TABS: readonly FeedTabDef[] = [
  { id: "for-you", label: "For You", accessibleLabel: "For You — recommended posts" },
  { id: "following", label: "Following", accessibleLabel: "Following — posts from accounts you follow" },
]

/** Where the feed is: which tab, and — on HashTag — which tag is open. */
export interface FeedRoute {
  tab: FeedTabId
  /** Normalised, without its `#`. Null on every tab but HashTag's tag view. */
  tag: string | null
}

export const HOME_ROUTE: FeedRoute = { tab: DEFAULT_TAB, tag: null }

function isTabId(value: string): value is FeedTabId {
  return (FEED_TAB_IDS as readonly string[]).includes(value)
}

/**
 * A tag as the server stores it: lowercase, no `#`, no surrounding space.
 *
 * post-service does its own `TrimPrefix("#")` on the path segment and stores
 * `normalized_name` lowercased, so this is not a client convention — it is the
 * same normalisation, applied before the request rather than after, so that
 * `?tag=%23Momentum` and `?tag=momentum` are one cache entry and one URL
 * rather than two of each.
 *
 * Returns "" for anything that is not a tag, which callers read as "no tag".
 */
export function normalizeTag(raw: string | null | undefined): string {
  if (!raw) return ""
  return raw.trim().replace(/^#+/, "").trim().toLowerCase()
}

/**
 * Read the feed's position out of a query string.
 *
 * Accepts the whole `location.search`, with or without its leading `?`. An
 * unknown `tab=` is not an error and not a 404: it is a URL somebody typed or
 * an old link, and the useful answer is the front door. A `tag=` outside the
 * HashTag tab is dropped rather than carried, so the two halves of the route
 * cannot describe a state the UI has no way to render.
 */
export function readRoute(search: string): FeedRoute {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  const raw = (params.get("tab") ?? "").trim().toLowerCase()
  const tab: FeedTabId = isTabId(raw) ? raw : DEFAULT_TAB
  if (tab !== "hashtag") return { tab, tag: null }
  const tag = normalizeTag(params.get("tag"))
  return { tab, tag: tag || null }
}

/**
 * Write it back, preserving every parameter that is not ours.
 *
 * The feed is not the only thing that may have put something in the query
 * string — a campaign parameter on a shared link, a `?ref=` from the shell —
 * and a tab switch that silently dropped them would make the URL lie about
 * where the reader came from. So this edits two keys and copies the rest.
 *
 * Returns the string to hand to `history.replaceState`: `"?…"` when there is
 * anything to say and `""` when there is not, which is what turns the default
 * tab back into a bare `/social` instead of leaving `?tab=for-you` behind.
 */
export function writeRoute(search: string, route: FeedRoute): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)

  if (route.tab === DEFAULT_TAB) params.delete("tab")
  else params.set("tab", route.tab)

  const tag = route.tab === "hashtag" ? normalizeTag(route.tag) : ""
  if (tag) params.set("tag", tag)
  else params.delete("tag")

  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

/** True when two routes name the same place. */
export function sameRoute(a: FeedRoute, b: FeedRoute): boolean {
  return a.tab === b.tab && a.tag === b.tag
}

/**
 * The cache key for a route's list of posts.
 *
 * Each tab pages independently and keeps its own cursor, so each needs its own
 * bucket; a tag needs one PER TAG, because two tags are two lists and reusing
 * one bucket would show #momentum's posts under #test for the frame before the
 * fetch lands. The HashTag tab with no tag open has no post list at all — it
 * shows the trending tags — so it has no key.
 */
export function listKey(route: FeedRoute): string | null {
  if (route.tab === "hashtag") return route.tag ? `tag:${route.tag}` : null
  return route.tab
}
