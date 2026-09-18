/**
 * The channel page's four sections, and how `?tab=` is read.
 *
 * ── Why this is not in ./ChannelScreen.tsx ────────────────────────────────
 * A correctness rule of the App Router rather than tidiness. That file is
 * `"use client"`, and a plain function exported from a client module and
 * imported by a SERVER component arrives as a client reference — calling it
 * on the server throws. `app/channel/[handle]/page.tsx` reads `searchParams`
 * on the server and parses the tab there, so the parser has to live in a
 * module with no directive on it.
 *
 * Pure, and therefore tested rather than trusted. See ../chrome/search.ts,
 * which is split from its component for exactly the same reason.
 */

/**
 * ── Shorts sits SECOND, between Videos and Playlists ──────────────────────
 * The order is YouTube's and RUTUBE's, and it is the order of how much of a
 * channel each one is: a channel's long video is what it is for, its shorts
 * are the other thing it makes, and playlists and a description are about
 * that work rather than being it. Appending Shorts after About would also
 * have moved it away from the only other tab that draws a grid, which is the
 * one pairing a person switching between them actually notices.
 */
export const CHANNEL_TABS = ["videos", "shorts", "playlists", "about"] as const
export type ChannelTab = (typeof CHANNEL_TABS)[number]

export const CHANNEL_TAB_LABEL: Record<ChannelTab, string> = {
  videos: "Videos",
  shorts: "Shorts",
  playlists: "Playlists",
  about: "About",
}

/** The two tabs that draw a grid of posts, and the kind each one asks for. */
export const TAB_FEED_KIND = { videos: "videos", shorts: "shorts" } as const

/**
 * `?tab=` as one of the four, defaulting to Videos.
 *
 * Trimmed and lowercased before the comparison, and anything unrecognised
 * lands on Videos rather than on an empty page. That is not defensive habit:
 * `?tab=Playlists` from a hand-edited URL and `?tab=about%20` from a mangled
 * copy-paste are what this actually receives, and a channel page that renders
 * nothing at all for them looks broken rather than forgiving.
 */
export function parseTab(raw: string | null | undefined): ChannelTab {
  const value = (raw ?? "").trim().toLowerCase()
  return (CHANNEL_TABS as readonly string[]).includes(value) ? (value as ChannelTab) : "videos"
}

/**
 * The href for one tab of one channel, zone-relative.
 *
 * Videos is the bare channel URL and not `?tab=videos`, so a channel has ONE
 * canonical address rather than two that render identically — which matters
 * for what people copy out of the address bar and paste to each other.
 */
export function channelTabHref(base: string, tab: ChannelTab): string {
  return tab === "videos" ? base : `${base}?tab=${tab}`
}

/* ── The keyboard ─────────────────────────────────────────────────────────── */

/**
 * Where an arrow key moves from the tab you are on, or null for a key this
 * tab strip does not claim.
 *
 * ── Why the page now says `role="tablist"` when it deliberately did not ───
 * What stood here was a `<nav>` of links with `aria-current="page"`, and the
 * note beside it was right on its own terms: announcing something as a tab
 * promises arrow-key movement, and links do not move under arrow keys, so
 * calling them tabs would have been a promise the page did not keep. The
 * founder asked for the promise rather than for the retraction — "keyboard-
 * reachable tabs with proper role=tablist semantics and arrow-key movement" —
 * so the behaviour was built and the role is now true. The tabs are STILL
 * links with real hrefs, because `?tab=` in the URL is what makes a channel's
 * Shorts tab something a person can send to somebody else.
 *
 * ── Wrapping, and Home / End ──────────────────────────────────────────────
 * Both are the WAI-ARIA tabs pattern: Right/Down from the last lands on the
 * first, Left/Up from the first lands on the last, Home and End jump to the
 * ends. Wrapping is what makes a four-tab strip feel like a ring rather than
 * a dead end, and it is the behaviour a screen-reader user is expecting the
 * moment the role is announced.
 *
 * Returns null — not the current index — for every other key, so the caller
 * can tell "this strip handled it" from "leave this alone", and typing Tab,
 * Enter or a letter is never swallowed.
 *
 * Pure so that ./tabs.test.ts can assert the whole ring with no DOM.
 */
export function tabAfterKey(current: ChannelTab, key: string): ChannelTab | null {
  const at = CHANNEL_TABS.indexOf(current)
  // A `current` that is not in the list is not a navigation, it is a bug
  // upstream, and moving from an unknown position would pick a tab at random.
  if (at < 0) return null
  const last = CHANNEL_TABS.length - 1
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return CHANNEL_TABS[at === last ? 0 : at + 1]
    case "ArrowLeft":
    case "ArrowUp":
      return CHANNEL_TABS[at === 0 ? last : at - 1]
    case "Home":
      return CHANNEL_TABS[0]
    case "End":
      return CHANNEL_TABS[last]
    default:
      return null
  }
}

/* ── The ids that tie a tab to its panel ──────────────────────────────────── */

/**
 * `aria-controls` and `aria-labelledby` need matching ids, and a page with
 * two tab strips on it would need them not to collide. There is only ever one
 * here, so the ids are constants rather than generated — `useId` would change
 * them between the server render and the client one, which is the one thing
 * an id in an ARIA relationship may not do.
 */
export function tabId(tab: ChannelTab): string {
  return `channel-tab-${tab}`
}

export function tabPanelId(tab: ChannelTab): string {
  return `channel-panel-${tab}`
}
