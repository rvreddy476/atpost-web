/**
 * Tube's own destinations — the left rail, as data.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS NOT @momentum/chrome's destinations.ts
 *
 * That file is the PRODUCT's places: Home, Reels, Tube, Messages, Friends,
 * Explore, Shop. It is the right list for the social zone and the reels zone,
 * which are surfaces of one app, and it is the wrong list here. The founder's
 * note is unambiguous about which:
 *
 *     "it should redirect to the new page, because it's a completely isolated
 *      application from the feed. It's Momentum Tube. So it should be
 *      completely isolated. It did open like in YouTube completely — channel,
 *      subscriptions, settings at the left side, and videos."
 *
 * A rail whose rows are Messages and Shop is a rail that says "you are in the
 * feed, and video is one tab of it". Tube's rows are Home, Subscriptions, the
 * channels you subscribe to, your own things, and settings — YouTube's shape,
 * because that is the shape the founder named.
 *
 * What DID come across from that file, deliberately, is the discipline rather
 * than the data:
 *
 *   · `href: null` is the only way to say "not available", so an entry cannot
 *     carry a link and a disabled flag that disagree.
 *   · a row with no href is rendered `aria-disabled` and focusable, never
 *     dropped and never linked to a 404. `packages/ui/src/RoleSwitcher.tsx`
 *     made that decision first and wrote down why: somebody who used the
 *     Android app and finds no History anywhere on the web concludes the
 *     platform lost their history, not that it is a phone feature.
 *   · every cross-zone href is absolute and travelled by a plain `<a>`, never
 *     `next/link`, which would prefix this zone's basePath and ask for
 *     `/tube/social`.
 *
 * ── This file is data and pure functions only ─────────────────────────────
 * No JSX, no hooks, no network — so "a row without an href is never a link"
 * and "the current row is the one you are on" can both be asserted without a
 * browser. ./rail.test.ts is that assertion.
 */

import {
  Clock,
  Compass,
  History,
  House,
  ListVideo,
  Settings,
  Undo2,
  Video,
  type LucideIcon,
} from "lucide-react"
import { BRAND } from "@momentum/brand"
import { EXPLORE_PATH, HOME_PATH, TUBE_APP_ONLY_REASON } from "./links"

export { TUBE_APP_ONLY_REASON }

/** Why a "your own" row is dark for somebody who has never published. */
export const NO_CHANNEL_REASON =
  "You have not created a channel yet. A long video is published by a channel, so this fills in once you have one."

/** Why a personal row is dark for somebody who is not signed in. */
export const SIGNED_OUT_REASON = "Sign in to see this."

export interface TubeRailItem {
  /** Stable id. Used for the current-row mark and as a React key. */
  id: string
  label: string
  /**
   * The word for the 76px icon rail, when the full label will not fit.
   *
   * Three rows need one, and they are the three measured truncating at 10px
   * in a 76px tile: "Subscriptions", "Explore Momentum" and "Back to
   * Momentum" render as "Subscriptio…", "Explore Mo…" and "Back to Mo…". A
   * truncated word is worse than a shorter true one — "Back to Mo…" reads as
   * a fault rather than as a destination.
   *
   * It is NOT the accessible name. `label` stays the announced name at both
   * widths, so a screen-reader user hears "Back to Momentum" whichever shape
   * is on screen and the two can never disagree about where a row goes.
   */
  shortLabel?: string
  icon: LucideIcon
  /**
   * Where it goes, or null when nothing serves it.
   *
   * ZONE-RELATIVE when `external` is false — "/", "/subscriptions", "/@ada" —
   * because `next/link` adds this zone's basePath itself. ABSOLUTE when
   * `external` is true, and then it must be travelled by a plain `<a>`.
   */
  href: string | null
  /** True when the href leaves the Tube app and needs a document navigation. */
  external?: boolean
  /** Required when `href` is null, and meaningless when it is not. */
  unavailableReason: string | null
}

/* ── The two rows at the top ──────────────────────────────────────────────── */

export const HOME_ITEM: TubeRailItem = {
  id: "home",
  label: "Home",
  icon: House,
  href: "/",
  unavailableReason: null,
}

export const SUBSCRIPTIONS_ITEM: TubeRailItem = {
  id: "subscriptions",
  label: "Subscriptions",
  shortLabel: "Subs",
  icon: ListVideo,
  href: "/subscriptions",
  unavailableReason: null,
}

export const PRIMARY_ITEMS: readonly TubeRailItem[] = [HOME_ITEM, SUBSCRIPTIONS_ITEM] as const

/* ── "You" ────────────────────────────────────────────────────────────────── */

/**
 * The viewer's own rows: two creator destinations, then four viewer ones,
 *
 * ── Two of these four are real links and two are honestly dark ────────────
 * "Your videos" and "Playlists" are the viewer's own channel page and its
 * "Your videos" and "Playlists" are the viewer's own channel page and its
 * playlists tab, which this app serves — so once `GET /v1/channels/me`
 * answers, they are ordinary links to `/@{handle}`. Before it answers, and
 * for an account with no channel at all, they carry `NO_CHANNEL_REASON`,
 * which is the true statement: post-service answers `403 CHANNEL_REQUIRED` to
 * a long video from an account with no channel, so "you have no videos here"
 * and "you have no channel" really are the same fact.
 *
 * "History" and "Saved videos" were dark until 2026-09-12, and the rule that
 * kept them dark is worth keeping: an endpoint is not a page. Both had live
 * endpoints for months (`GET /v1/videos/continue-watching`,
 * `GET /v1/posts/bookmarks`) and no page in this zone to serve them, so a
 * link would have been a link to a 404. The pages exist now, `/history`
 * (src/history) and `/saved` (src/saved), so the rows are links, gated on
 * the SESSION and not on the channel: a viewer with no channel still has a
 * history and a saved list.
 *
 * ── "Saved videos", where the brief said "Watch later" ────────────────────
 * Recorded rather than silently changed. YouTube's word is Watch later; this
 * platform's is a BOOKMARK — `POST /v1/posts/{id}/bookmark`, drawn as "Save"
 * on the watch page's action bar one click from here, and called Saved videos
 * by the Android client (`feature/tube/ui/saved/SavedVideosScreen.kt`).
 * Calling the same list two things on two surfaces is exactly what
 * `cardLabel` in ../tube/video.ts refuses to do with "Watch" and "Expand".
 * If the product decides Watch later is a SEPARATE list from Save, this row
 * splits in two rather than being renamed.
 */
export function youItems({
  signedIn,
  ownChannelRef,
}: {
  signedIn: boolean
  /** The viewer's own channel handle or user id, or null when they have none. */
  ownChannelRef: string | null
}): TubeRailItem[] {
  const ownReason = signedIn ? NO_CHANNEL_REASON : SIGNED_OUT_REASON
  const own = signedIn ? ownChannelRef : null

  return [
    {
      id: "history",
      label: "History",
      icon: History,
      href: signedIn ? "/history" : null,
      unavailableReason: signedIn ? null : SIGNED_OUT_REASON,
    },
    {
      id: "your-videos",
      label: "Your videos",
      shortLabel: "Yours",
      icon: Video,
      href: own ? `/@${own}` : null,
      unavailableReason: own ? null : ownReason,
    },
    {
      id: "playlists",
      label: "Playlists",
      icon: ListVideo,
      href: own ? `/@${own}?tab=playlists` : null,
      unavailableReason: own ? null : ownReason,
    },
    {
      id: "saved",
      label: "Saved videos",
      shortLabel: "Saved",
      icon: Clock,
      href: signedIn ? "/saved" : null,
      unavailableReason: signedIn ? null : SIGNED_OUT_REASON,
    },
  ]
}

/* ── Settings, and the way out ────────────────────────────────────────────── */

/**
 * Settings, as the signed-in viewer sees it.
 *
 * This was dark until 2026-09-12 because the shell's rewrite table had no
 * /settings zone and Tube had no page, the same "an endpoint is not a page"
 * rule the You group records. `/settings` is Tube's own route now
 * (src/settings), and it gates on the session for the reason the page
 * itself gives: every section of it is a claim about one account's state.
 * `settingsItem` is what the rail draws; this constant is the live shape,
 * kept exported so the current-row arithmetic can be tested against it.
 */
export const SETTINGS_ITEM: TubeRailItem = {
  id: "settings",
  label: "Settings",
  icon: Settings,
  href: "/settings",
  unavailableReason: null,
}

export function settingsItem({ signedIn }: { signedIn: boolean }): TubeRailItem {
  if (signedIn) return SETTINGS_ITEM
  return { ...SETTINGS_ITEM, href: null, unavailableReason: SIGNED_OUT_REASON }
}

/**
 * The way back to the rest of the product.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHERE THIS SITS, AND WHY IT SITS THERE
 *
 * The founder asked for isolation, not for a trap. Three places were
 * considered and this is why the rail's last row won:
 *
 *   · THE LOCKUP. Rejected. In every isolated app the founder named as the
 *     model — YouTube's own included — the wordmark means "this app's home",
 *     and it is the control people hit hundreds of times a session. Making it
 *     mean "leave" instead would break the one gesture the shape teaches, and
 *     making it mean both is a lockup nobody can predict.
 *
 *   · THE PROFILE MENU. Rejected as the ONLY home for it. A menu hides the
 *     exit behind a click on an avatar, which is where an account's settings
 *     live and not where a person looks for a different product. (It is also
 *     drawn there, as a second copy, for one narrow reason: see
 *     ./TubeProfileMenu.tsx.)
 *
 *   · THE RAIL'S LAST ROW. Chosen. The rail is already the list of places you
 *     can go, it is the first thing the eye scans in this layout, and the
 *     bottom of it is out of the way of Home and Subscriptions — the two rows
 *     that get all the traffic. Below 1024px the rail is a drawer rather than
 *     a column, so this row is reachable at 375px too, which is the thing a
 *     rail-only exit usually gets wrong.
 *
 * `external: true` because /social is a different Next app behind the shell's
 * rewrite table. `next/link` here would ask for `/tube/social`.
 */
export const EXIT_ITEM: TubeRailItem = {
  id: "exit",
  label: `Back to ${BRAND.name}`,
  shortLabel: BRAND.name,
  icon: Undo2,
  href: HOME_PATH,
  external: true,
  unavailableReason: null,
}

/** The Explore row, which is the product's mini-app launcher and a real zone. */
export const EXPLORE_ITEM: TubeRailItem = {
  id: "explore",
  label: `Explore ${BRAND.name}`,
  shortLabel: "Explore",
  icon: Compass,
  href: EXPLORE_PATH,
  external: true,
  unavailableReason: null,
}

/*
 * There is deliberately no `signInItem` row.
 *
 * Sign in is not a destination in the same sense as the rows above — it is a
 * state the whole rail is in — so the signed-out rail replaces its channel
 * SECTION with a card that says what an account buys and offers the link,
 * rather than adding a row that would sit between Home and Subscriptions
 * looking like a place. ./TubeRail.tsx draws it, and the top bar carries the
 * same link where a person's eye already goes for it.
 */

/* ── The two predicates every surface shares ──────────────────────────────── */

/**
 * Can this row be opened from a browser?
 *
 * The single predicate the rail, the drawer and the icon rail all ask, so
 * they cannot disagree about what "available" means. It is also the safety
 * property: the anchor branch of ./RailRow.tsx is the only one that reads
 * `href`, and it is unreachable without one.
 */
export function isActionable(item: TubeRailItem): boolean {
  return typeof item.href === "string" && item.href.length > 0
}

/**
 * Which row the current path is inside, or null.
 *
 * `pathname` is what `usePathname()` gives inside a basePath zone — already
 * stripped of "/tube", so "/" is home and "/subscriptions" is subscriptions.
 * External rows are never current: you are not "inside" /social while you are
 * in Tube, and marking a row `aria-current="page"` when it is not is a lie a
 * screen reader repeats on every visit.
 *
 * Home is matched EXACTLY. Every other in-zone row is matched on a segment
 * boundary rather than with `startsWith`, the same near-prefix defect
 * @momentum/chrome's `currentDestinationId` has a note about: "/subscriptions"
 * must not claim "/subscriptionsomething". Home cannot use the boundary rule
 * at all, because "/" is a prefix of literally every path in the zone — which
 * would mark Home current on the watch page and on every channel.
 *
 * ── The query string is dropped, and one row pays for it ──────────────────
 * `usePathname()` does not carry a query, and reading `useSearchParams()`
 * here would make the whole SHELL dynamically rendered on every route in the
 * zone — a real cost, paid on every page, to mark one row.
 *
 * So the two rows that differ only by a query — "Your videos" (`/@you`) and
 * "Playlists" (`/@you?tab=playlists`) — cannot be told apart, and the FIRST
 * match wins, which is "Your videos". Standing on your own Playlists tab
 * therefore marks "Your videos" as the current row. That is the smaller of
 * the two available errors: the alternative is marking neither, and both rows
 * genuinely are the page you are on. It is written down here because it looks
 * like a bug and is a decision.
 */
export function currentRailId(
  pathname: string | null | undefined,
  items: readonly TubeRailItem[]
): string | null {
  if (!pathname) return null
  const path = pathname.split("?")[0]
  for (const item of items) {
    if (item.external) continue
    const href = item.href?.split("?")[0]
    if (!href) continue
    if (href === "/") {
      if (path === "/") return item.id
      continue
    }
    if (path === href || path.startsWith(`${href}/`)) return item.id
  }
  return null
}
