/**
 * The places this product has, and the honest truth about which of them the
 * web can open.
 *
 * ── Where the vocabulary comes from ───────────────────────────────────────
 * Not invented here. The names and the glyphs are the Android client's own
 * top-level destinations —
 * `mobile/android/app/.../navigation/TopLevelDestination.kt` — which are
 * HOME, REELS, FRIENDS, ME, MESSAGES and EXPLORE, drawn from `UsIcons` in
 * `core/designsystem`. `UsIcons` names the Lucide glyph it traced for almost
 * every one of them, so the mapping to `lucide-react` is a lookup rather than
 * a judgement call:
 *
 *     UsIcons.Home     → Lucide `house`          → House
 *     UsIcons.Friends  → Lucide `users`          → Users
 *     UsIcons.Comment  → Lucide `message-circle` → MessageCircle   (Messages)
 *     UsIcons.Explore  → Lucide `layout-grid`    → LayoutGrid
 *     UsIcons.Search   → Lucide `search`         → Search
 *     UsIcons.Tv       → Lucide `tv`             → Tv              (Tube)
 *     UsIcons.Profile  → Lucide `circle-user`    → CircleUser      (Me)
 *
 * Two of them needed a decision, and both are recorded rather than silently
 * made:
 *
 *   · REELS. `UsIcons.Reels` is bespoke — a filled film-reel disc with four
 *     holes and an edit strip — and has no Lucide equivalent. `Film` is the
 *     nearest member of the same family, and it is chosen partly for what it
 *     does NOT collide with: `Clapperboard` already means long video in the
 *     mobile set (`UsIcons.Video`, the Create sheet's long-video tile) and
 *     `Tv` already means Tube. Reusing either would contradict the mobile
 *     vocabulary rather than match it.
 *
 *   · "YouTube icon, TV icon" in the brief is ONE destination, not two. Tube
 *     is the long-video app — `feature/tube` on Android, `/v1/feed/videos` on
 *     the gateway — and the mobile set gives it exactly one glyph,
 *     `UsIcons.Tv`. Drawing two icons for one place would be an invented name.
 *
 *     (This comment used to say Tube's endpoint was `/v1/videos`, which is
 *     half right and was worth correcting rather than leaving. `/v1/videos` IS
 *     a gateway prefix and IS Tube's, but behind it are post-service's creator
 *     tools and watch progress — `GET /v1/videos/{postId}`, `…/progress`,
 *     `/v1/videos/continue-watching`. `GET /v1/videos` on its own is a 404,
 *     verified. The list of videos is `/v1/feed/videos`, on feed-service.)
 *
 * ── Why a destination with no web zone still appears ──────────────────────
 * The web has six zones and the shell's rewrite table is the whole list:
 * /shop, /admin, /social, /apps, /reels, /tube (apps/shell/next.config.ts, and
 * the same list again in apps/shell/src/lib/moduleRedirect.ts). Friends and
 * Messages are not among them.
 *
 * The prior art for what to do about that is `packages/ui/src/RoleSwitcher.tsx`
 * and its reasoning transfers exactly. A delivery partner whose role vanishes
 * from the web does not conclude "that is a phone feature", they conclude the
 * platform has lost their approval. Someone who has used the Android app and
 * finds no Messages anywhere on the web concludes the same thing about their
 * conversations. So the entry is present, named, and honestly unusable: rendered
 * with `aria-disabled` rather than dropped, so it is still reachable by
 * keyboard and a screen-reader user is told the same thing a sighted one can
 * see — and never as an `href` to a route that would 404, which is the one
 * outcome worse than both.
 *
 * ── This file is data and pure functions only ─────────────────────────────
 * No JSX, no hooks, no network. That is what lets the rule "an entry without
 * an href is never rendered as a link" be asserted without a browser, and it
 * is the assertion that actually matters here.
 */

// CircleUser (UsIcons.Profile / Lucide `circle-user`) is not imported here:
// the mobile ME tab is the profile MENU on the web, not a rail row, so its
// glyph lives in ./ProfileMenu with the rest of that control.
import {
  Film,
  House,
  LayoutGrid,
  MessageCircle,
  ShoppingBag,
  Tv,
  Users,
  type LucideIcon,
} from "lucide-react"
import { BRAND } from "@momentum/brand"

/** Why a destination cannot be opened from a browser today. */
export const APP_ONLY_REASON = `Only in the ${BRAND.mobileApp} — the web has no zone for it yet.`

/**
 * The product's front door, absolutely.
 *
 * The header lockup and every "go to your feed" link point here from whichever
 * zone they are drawn in, so it is one constant rather than a literal repeated
 * across two apps. Kept beside DESTINATIONS because it IS the `home` row's
 * href — the row below reads this constant rather than repeating it, so a
 * lockup that goes somewhere other than Home is not expressible.
 */
export const HOME_PATH = "/social"

export interface AppDestination {
  /** Stable id. Lowercased form of the Android enum member where one exists. */
  id: string
  /** The word the mobile client uses for it. */
  label: string
  icon: LucideIcon
  /**
   * An absolute path served by one of the shell's zones, or null when no zone
   * serves it. Null is the ONLY way to say "not available" — there is
   * deliberately no `disabled` flag that could disagree with an href.
   */
  href: string | null
  /** Required when `href` is null, and forbidden when it is not. */
  unavailableReason: string | null
  /** A word of context for the rail, where there is room for one. */
  description: string
}

/**
 * Every top-level destination, in the mobile bar's own order, with Shop and
 * Tube folded in where they belong.
 *
 * HOME is first because it is where this page is. Shop is included although
 * the brief did not name it: it is a real, live zone that the shell's own
 * launcher already advertises, and a navigation rail that omits a working
 * destination is as misleading in its own way as one that invents a broken
 * one. It is last, because it is the only entry that is not a social surface.
 */
export const DESTINATIONS: readonly AppDestination[] = [
  {
    id: "home",
    label: "Home",
    icon: House,
    href: HOME_PATH,
    unavailableReason: null,
    description: "Your feed",
  },
  {
    id: "reels",
    label: "Reels",
    icon: Film,
    // A real zone as of the reels build: apps/reels, and the shell's rewrite
    // table now carries /reels. This entry was `href: null` with
    // APP_ONLY_REASON until the zone existed, which is this file's rule — an
    // entry becomes a link on the day something serves it, and not before.
    href: "/reels",
    unavailableReason: null,
    description: "Short video",
  },
  {
    id: "tube",
    label: "Tube",
    icon: Tv,
    // A real zone as of the tube build: apps/tube on port 3012, and the
    // shell's rewrite table now carries /tube. This entry was `href: null`
    // with APP_ONLY_REASON until the zone existed, which is this file's rule —
    // an entry becomes a link on the day something serves it, and not before.
    href: "/tube",
    unavailableReason: null,
    description: "Long video",
  },
  {
    id: "messages",
    label: "Messages",
    icon: MessageCircle,
    href: null,
    unavailableReason: APP_ONLY_REASON,
    description: "Chats and groups",
  },
  {
    id: "friends",
    label: "Friends",
    icon: Users,
    href: null,
    unavailableReason: APP_ONLY_REASON,
    description: "People you know",
  },
  {
    id: "explore",
    label: "Explore",
    icon: LayoutGrid,
    // The mobile Explore tab IS the mini-app launcher (UsIcons.Explore is a
    // grid of apps, not a magnifier, and the comment beside it says why), and
    // /apps is the web's launcher zone. Same place, same glyph, one name.
    href: "/apps",
    unavailableReason: null,
    description: `Mini apps inside ${BRAND.name}`,
  },
  {
    id: "shop",
    label: "Shop",
    icon: ShoppingBag,
    href: "/shop",
    unavailableReason: null,
    description: BRAND.shop,
  },
] as const

/**
 * Can this entry be opened from a browser?
 *
 * The single predicate every surface asks, so the header strip, the rail and
 * any future control cannot disagree about what "available" means.
 */
export function isActionable(destination: AppDestination): boolean {
  return typeof destination.href === "string" && destination.href.length > 0
}

/**
 * Which entry a path is currently inside, or null.
 *
 * Prefix-matched on a segment boundary, not `startsWith`: the raw form would
 * make "/social" claim "/socialising" and "/apps" claim "/apps-admin". That
 * is the same near-prefix defect the api-gateway's own route policy has a
 * test for (`/v1/graph` vs `/v1/graphql`), and it is worth not repeating.
 */
export function currentDestinationId(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  for (const destination of DESTINATIONS) {
    const href = destination.href
    if (!href) continue
    if (pathname === href || pathname.startsWith(`${href}/`) || pathname.startsWith(`${href}?`)) {
      return destination.id
    }
  }
  return null
}

/*
 * A `SEARCH_UNAVAILABLE_REASON` used to sit here, saying that `GET /v1/search`
 * was live but had nowhere on the web to put its answer. It has somewhere now
 * — `/social/search`, reached from ./SearchBox.tsx — so the sentence went with
 * the follow-up rather than being left behind it. An explanation of why
 * something cannot be used, kept next to the thing now working, is read as
 * current by whoever finds it next, and the file's whole subject is not
 * saying things that are no longer true.
 */
