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
 * feed, and video is one tab of it". Tube's rows are Home, Shorts,
 * Subscriptions, Trending, Explore, the channels you subscribe to, your own
 * things, and settings — YouTube's shape with RUTUBE's discovery rows, because
 * that is the shape the founder named.
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
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY ROW MAPS TO AN ENDPOINT THAT EXISTS
 *
 * The rule this file is really about. A row is added on the day something
 * serves it and not one day before, and the endpoint is named beside it so the
 * next person can check the claim rather than trust it:
 *
 *   Home            GET /v1/feed/videos          (signed out: /v1/posts/recent)
 *   Shorts          the reels zone, /reels       (shelf: /v1/posts/recent?flick)
 *   Subscriptions   GET /v1/feed/videos?subscribed_only=true
 *   Trending        GET /v1/posts/trending?content_type=long_video
 *   Explore         GET /v1/posts/categories, then ?category= on the feed
 *   Your videos     GET /v1/uploads/videos
 *   Playlists       GET /v1/creators/{viewer}/playlists
 *   Watch later     the reserved playlist — see ../playlists/playlists.ts
 *   History         GET /v1/videos/history
 *   Saved           GET /v1/posts/bookmarks?type=long_video
 *   Linked videos   the link editor's own routes (../links)
 *   Upload          the studio (../studio)
 *   Settings        ../settings
 *
 * Rows that were considered and left OUT, each because no route serves them:
 * Liked videos (there is a reels-only liked list and nothing for long video),
 * Downloads, Podcasts / Movies / Music / Gaming (the taxonomy is one flat
 * category slug), "your comments", and dislike. Adding any of them would be a
 * link to a page that could only apologise.
 *
 * ── This file is data and pure functions only ─────────────────────────────
 * No JSX, no hooks, no network — so "a row without an href is never a link"
 * and "the current row is the one you are on" can both be asserted without a
 * browser. ./rail.test.ts is that assertion.
 */

import {
  Bookmark,
  Clapperboard,
  Clock,
  Compass,
  Flame,
  History,
  House,
  LayoutGrid,
  Link2,
  ListVideo,
  Rss,
  Settings,
  Undo2,
  Upload,
  Video,
  type LucideIcon,
} from "lucide-react"
import { BRAND } from "@momentum/brand"
import { EXPLORE_PATH, HOME_PATH, REELS_PATH, TUBE_APP_ONLY_REASON } from "./links"

export { TUBE_APP_ONLY_REASON }

/**
 * Why a row that genuinely needs a channel would be dark.
 *
 * No row in this file uses it any more — see `youItems` — and it stays
 * exported because the channel page and the studio still need the sentence,
 * and because the next row that really does need a channel should reach for
 * written-down words rather than compose new ones.
 */
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
   * Measured truncating at 10px in a 76px tile: "Subscriptions", "Watch
   * later", "Linked videos", "Explore Momentum" and "Back to Momentum" render
   * as "Subscriptio…", "Watch lat…", "Linked vid…", "Explore Mo…" and "Back
   * to Mo…". A truncated word is worse than a shorter true one — "Back to
   * Mo…" reads as a fault rather than as a destination.
   *
   * Two rows would otherwise collide at that width: the in-zone "Explore"
   * (topics, this app) and the cross-zone "Explore Momentum" (the mini-app
   * launcher). The second is shortened to "Apps", which is what /apps is, so
   * the collapsed rail never shows one word for two different places.
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

/* ── Discovery: the five rows at the top ──────────────────────────────────── */

export const HOME_ITEM: TubeRailItem = {
  id: "home",
  label: "Home",
  icon: House,
  href: "/",
  unavailableReason: null,
}

/**
 * Shorts, which is the reels zone and not a page of this one.
 *
 * `external: true` and deliberately so. A short is 9:16, it autoplays, it is
 * swiped rather than clicked, and apps/reels is a whole application built for
 * exactly that. A second shorts player inside Tube would be a second
 * implementation of the autoplay coordinator, the dwell tracker and the watch
 * heartbeat — three things a creator is paid on. So the row is a door, and
 * Home's Shorts shelf (../browse/ShortsShelf.tsx) is the window: the shelf's
 * ITEMS come from `GET /v1/posts/recent?content_type=flick`, which is public,
 * and every one of them opens in /reels.
 */
export const SHORTS_ITEM: TubeRailItem = {
  id: "shorts",
  label: "Shorts",
  icon: Clapperboard,
  href: REELS_PATH,
  external: true,
  unavailableReason: null,
}

export const SUBSCRIPTIONS_ITEM: TubeRailItem = {
  id: "subscriptions",
  label: "Subscriptions",
  shortLabel: "Subs",
  icon: Rss,
  href: "/subscriptions",
  unavailableReason: null,
}

/**
 * Trending — RUTUBE's "In the top", and `GET /v1/posts/trending`.
 *
 * PUBLIC, which is why it sits above the You block rather than inside it: it
 * is one of the three things a signed-out visitor can actually do here (Home,
 * Trending, Explore). The rows come back ranked by the same engagement score
 * the hashtag "top" sort uses, and they are PostDetail rather than feed rows
 * — no variants, no blurhash, no channel — which the page says out loud
 * instead of drawing empty tiles. See ../trending/TubeTrending.tsx.
 */
export const TRENDING_ITEM: TubeRailItem = {
  id: "trending",
  label: "Trending",
  icon: Flame,
  href: "/trending",
  unavailableReason: null,
}

/**
 * Explore by topic. `GET /v1/posts/categories` is the taxonomy and
 * `?category=<slug>` is what it drives, on the same call the home grid makes.
 *
 * NOT "Podcasts / Movies / Music / Gaming". Those are four rows in YouTube's
 * rail and four separate corpora on YouTube's server; here the whole taxonomy
 * is one flat list of slugs, and inventing tabs over it would be four rows
 * that are the same query with a different word on top.
 */
export const EXPLORE_TOPICS_ITEM: TubeRailItem = {
  id: "explore-topics",
  label: "Explore",
  icon: Compass,
  href: "/explore",
  unavailableReason: null,
}

export const PRIMARY_ITEMS: readonly TubeRailItem[] = [
  HOME_ITEM,
  SHORTS_ITEM,
  SUBSCRIPTIONS_ITEM,
  TRENDING_ITEM,
  EXPLORE_TOPICS_ITEM,
] as const

/* ── "You" ────────────────────────────────────────────────────────────────── */

/**
 * The viewer's own rows: what you have, then what you make.
 *
 * ── All seven gate on the SESSION, and none on the channel ────────────────
 * That is a change. "Your videos" and "Playlists" used to point at the
 * viewer's own CHANNEL page (`/@{handle}`) and stayed dark with
 * NO_CHANNEL_REASON until `GET /v1/channels/me` answered. Both have real
 * routes of their own now, and neither needs a channel:
 *
 *   · Your videos is `GET /v1/uploads/videos`, keyed on the caller's user id,
 *     which answers an empty list — not a 403 — for somebody who has never
 *     published. A page that says "you have not uploaded a video yet" is
 *     strictly better than a dark row saying "you have no channel", because
 *     the second is a true fact about a different noun.
 *   · Playlists is `GET /v1/creators/{viewer}/playlists` — the viewer's own
 *     id handed to a route that takes anybody's. There is no "my playlists"
 *     route on this gateway and this is exactly it.
 *
 * ── "Watch later" is a reserved playlist, and that is written down ────────
 * There is no watch-later route here. What there is, is playlists, and a
 * playlist with a reserved title is a real list with real rows that survives
 * a reload and reads the same on every device. ../playlists/playlists.ts
 * holds the title, the find-or-create rule and the argument.
 *
 * "Saved" stays a SEPARATE row and is not the same list: a bookmark
 * (`POST /v1/posts/{id}/bookmark`) is one edge across every content type, and
 * it is what the watch page's Save button writes. Two lists, two words, two
 * routes — which is what the old rail could not offer, and why it called the
 * bookmark list "Saved videos" and had no Watch later at all.
 */
export function youItems({
  signedIn,
}: {
  signedIn: boolean
  /**
   * The viewer's own channel handle or id, or null.
   *
   * Accepted and unused: no row in this group depends on a channel any more
   * (see above), and the parameter stays so the shell's one call site does
   * not change shape the day a row needs it again.
   */
  ownChannelRef?: string | null
}): TubeRailItem[] {
  const gate = (href: string): Pick<TubeRailItem, "href" | "unavailableReason"> =>
    signedIn
      ? { href, unavailableReason: null }
      : { href: null, unavailableReason: SIGNED_OUT_REASON }

  return [
    { id: "your-videos", label: "Your videos", shortLabel: "Yours", icon: Video, ...gate("/your-videos") },
    { id: "playlists", label: "Playlists", icon: ListVideo, ...gate("/playlists") },
    { id: "watch-later", label: "Watch later", shortLabel: "Later", icon: Clock, ...gate("/watch-later") },
    { id: "history", label: "History", icon: History, ...gate("/history") },
    { id: "saved", label: "Saved", icon: Bookmark, ...gate("/saved") },
    {
      // Linked videos had NO entry point anywhere in this zone until this
      // row — the authoring screens shipped and nothing in the product
      // pointed at them, so the only way in was to type the URL. A feature
      // reachable only by people who read the source is not shipped.
      id: "linked-videos",
      label: "Linked videos",
      shortLabel: "Links",
      icon: Link2,
      ...gate("/links"),
    },
    {
      // Upload is last in this group and is the one row here that is an ACT
      // rather than a place. It gates on the session and NOT on the channel,
      // which is the one place the group's rule needs stating twice: the
      // studio is where a channel gets CREATED, so darkening it would hide
      // the cure and show only the symptom. It carries its own gate and
      // explains itself.
      //
      // Appearing in both the rail and the top bar is deliberate duplication.
      // Below 1024px the rail is a drawer and the bar's control shrinks to a
      // bare glyph, so the labelled row is the one that says what it does.
      id: "upload",
      label: "Upload",
      icon: Upload,
      ...gate("/upload"),
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
 * (src/settings), and it gates on the session for the reason the page itself
 * gives: every section of it is a claim about one account's state.
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

/**
 * The product's mini-app launcher, which is a real zone.
 *
 * Not to be confused with `EXPLORE_TOPICS_ITEM` above, which is this app's own
 * topic browser. Two rows, two destinations, and two different words at 76px —
 * see `shortLabel`.
 */
export const EXPLORE_ITEM: TubeRailItem = {
  id: "explore",
  label: `Explore ${BRAND.name}`,
  shortLabel: "Apps",
  icon: LayoutGrid,
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
 * ── The query string is dropped, and nothing pays for it any more ─────────
 * `usePathname()` carries no query, and reading `useSearchParams()` here would
 * make the whole SHELL dynamically rendered on every route in the zone — a
 * real cost, paid on every page, to mark one row.
 *
 * That used to cost this function its honesty: "Your videos" was `/@you` and
 * "Playlists" was `/@you?tab=playlists`, two rows differing only by a query,
 * and standing on the second marked the first. Both have their own path now
 * (`/your-videos`, `/playlists`), so every in-zone row is distinguishable from
 * a pathname alone and the caveat is history.
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
