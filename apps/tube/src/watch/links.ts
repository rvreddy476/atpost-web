/**
 * Turning a linked-video target into somewhere this client can actually go.
 *
 * Pure: no React, no DOM. The point of the file is the refusals. A card may
 * target a POLL and an end screen may target a PLAYLIST, and the web has no
 * surface for either — so the honest answer for those is "no link", and a
 * prompt with no link still shows its title and its teaser. The alternative,
 * which is what a naive `href={\`/\${target_id}\`}` produces, is a control that
 * looks like a link and lands on a 404 wearing this zone's chrome.
 *
 * ── Every internal href here is ZONE-RELATIVE ─────────────────────────────
 * These strings go to `next/link` inside a zone whose `basePath` is "/tube",
 * and Next prepends the basePath itself: "/{id}" becomes "/tube/{id}", and
 * "/tube/{id}" would become "/tube/tube/{id}". Same trap as `videoHref` in
 * ../tube/video.ts, which carries a test for it.
 */

import type { EndScreen, SeriesEpisode, VideoCard } from "./api"

/** Where a video is watched, zone-relative. Mirrors `videoHref`. */
export function watchHref(postId: string): string {
  return `/${postId}`
}

/*
 * A channel's URL is deliberately NOT defined here.
 *
 * `channelHref` / `itemChannelHref` in ../tube/channels.ts is the zone's one
 * definition of it, and it knows things this file has no business knowing —
 * that the "@" is stripped and re-added through one normaliser, that a channel
 * with no handle is addressed by its user id, and that `next.config.ts` rewrites
 * `/@:handle` onto the real route before the filesystem is consulted so it never
 * reaches the watch page's `[postId]` segment. ./ChannelRow.tsx uses that one.
 */

/** A destination this client can offer, or nothing. */
export type Destination =
  | { kind: "internal"; href: string }
  | { kind: "external"; href: string }
  | null

/**
 * Only http(s), and only when it parses.
 *
 * `target_url` is free text on the table with no validation behind it, so it
 * can be anything an author's tooling put there. `javascript:` and `data:` URLs
 * in an href are the classic way a content field becomes an execution
 * primitive, and `mailto:`/`tel:` are simply not what an end screen is for.
 */
export function externalDestination(url: string | null | undefined): Destination {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return { kind: "external", href: parsed.toString() }
  } catch {
    return null
  }
}

/**
 * Where an in-video card points.
 *
 * `video` is the founder's own case — "I can link one video to another video" —
 * and it is the only one of the four that this client can honour today.
 * `playlist` and `poll` have no web surface, so they are null and the prompt
 * renders as an announcement rather than a link.
 */
export function cardDestination(card: VideoCard): Destination {
  switch (card.type) {
    case "video":
      return card.target_id ? { kind: "internal", href: watchHref(card.target_id) } : null
    case "external_link":
      return externalDestination(card.target_url)
    case "playlist":
    case "poll":
      return null
    default:
      // The enum is checked in the database, so an unknown type means the
      // server grew one. Refusing to guess is better than sending somebody to
      // a URL built out of a shape nobody here has seen.
      return null
  }
}

/**
 * Where an end-screen tile points.
 *
 * `channel_subscribe` is null on purpose and it is NOT a gap: that tile is not
 * a link at all, it is the subscribe control, and the overlay renders it as
 * one. Returning a href for it would turn a button into a navigation.
 */
export function endScreenDestination(screen: EndScreen): Destination {
  switch (screen.type) {
    case "video":
      return screen.target_id ? { kind: "internal", href: watchHref(screen.target_id) } : null
    case "external_link":
      return externalDestination(screen.target_url)
    case "playlist":
    case "channel_subscribe":
      return null
    default:
      return null
  }
}

/* ── Series ─────────────────────────────────────────────────────────────── */

/** The episodes in playing order, lowest `episode_num` first. */
export function orderedEpisodes(episodes: readonly SeriesEpisode[]): SeriesEpisode[] {
  return episodes
    .filter((e) => Number.isFinite(e.episode_num))
    .slice()
    .sort((a, b) => a.episode_num - b.episode_num)
}

/**
 * The episode after this one, or null.
 *
 * Null in three different situations that all mean "there is nothing to offer":
 * this video is the last episode, this video is not in the list at all (which
 * happens when a series is fetched for the wrong post), or the list is empty.
 *
 * "The next EPISODE NUMBER" rather than "the next row": the ordering is by
 * `episode_num`, so a series with a gap — episodes 1, 2 and 4 after 3 was
 * unpublished — offers 4 after 2 rather than nothing. A gap in an author's
 * numbering is not a reason to strand somebody at the end of episode 2.
 */
export function nextEpisode(
  episodes: readonly SeriesEpisode[],
  postId: string
): SeriesEpisode | null {
  const ordered = orderedEpisodes(episodes)
  const index = ordered.findIndex((e) => e.post_id === postId)
  if (index === -1) return null
  return ordered[index + 1] ?? null
}

/**
 * The episode before this one, or null. The mirror of `nextEpisode`, with the
 * same three nulls and the same tolerance of a gap.
 *
 * It exists for the lock screen: `MomentumVideo` wires the OS "previous
 * track" button only when handed a callback, and a series is the one surface
 * in this zone with a real ordered queue for that button to walk.
 */
export function previousEpisode(
  episodes: readonly SeriesEpisode[],
  postId: string
): SeriesEpisode | null {
  const ordered = orderedEpisodes(episodes)
  const index = ordered.findIndex((e) => e.post_id === postId)
  if (index <= 0) return null
  return ordered[index - 1] ?? null
}

/** What an episode row is called. The row's title, else its number. */
export function episodeLabel(episode: SeriesEpisode): string {
  const title = episode.title?.trim()
  return title || `Episode ${episode.episode_num}`
}
