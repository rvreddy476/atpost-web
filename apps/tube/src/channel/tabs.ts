/**
 * The channel page's three sections, and how `?tab=` is read.
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

export const CHANNEL_TABS = ["videos", "playlists", "about"] as const
export type ChannelTab = (typeof CHANNEL_TABS)[number]

export const CHANNEL_TAB_LABEL: Record<ChannelTab, string> = {
  videos: "Videos",
  playlists: "Playlists",
  about: "About",
}

/**
 * `?tab=` as one of the three, defaulting to Videos.
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
