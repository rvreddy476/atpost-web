/**
 * Whose post this is — the naming rule, as arithmetic.
 *
 * ── "Someone" was the bug, and on one tab it was the NORMAL path ──────────
 * `PostCard` fell back to the literal string "Someone" whenever a row arrived
 * without a hydrated author. On the home feed that is rare. On the hashtag
 * tab it was routine: post-service's posts-by-tag route does not hydrate
 * `author` at all, so the zone re-hydrates it from `POST /v1/profiles/batch`
 * — and when that one request failed, every card on the page fell through at
 * once. Twenty rows, twenty identical "Someone"s, and nothing on screen to
 * say a request had failed rather than twenty people sharing a name.
 *
 * Two things fix that and they are separate. The zone has to SAY the
 * hydration failed and offer the retry (see apps/social's `tabApi.ts` and the
 * notice above the list). This file does the other half: it spends everything
 * the post already carries before it gives up, and when it does give up it
 * says something true.
 *
 * ── The order, and why ────────────────────────────────────────────────────
 *   1. the channel's name — a channel-published post is BY the channel, and
 *      that is the name the rest of the product puts on it.
 *   2. the author's display name.
 *   3. the author's `@username`. A handle is a real, chosen, unique name for
 *      a person; showing it is not a degradation, it is what half the social
 *      web shows by default. It is also frequently present on rows whose
 *      display name is missing, because the two come from different columns.
 *   4. `UNNAMED_AUTHOR`.
 *
 * ── Why the last resort is not "Someone" ──────────────────────────────────
 * "Someone" asserts a person and tells the reader nothing, so a page of them
 * reads as a rendering fault. What is actually true is narrower and more
 * useful: this client was not told who wrote this. "Unknown account" says
 * that, does not claim the account is deleted (it may simply not have loaded)
 * and does not pretend to be a name.
 *
 * Pure — no React, no network — so the rule is a table test rather than a
 * screenshot.
 */

import type { FeedAuthor, FeedChannel } from "@atpost/types/feed"

/** Shown when nothing on the wire named the author. See the header. */
export const UNNAMED_AUTHOR = "Unknown account"

export interface Byline {
  /** The name to print. Never empty, never "Someone". */
  name: string
  /** The `@handle` to print beside it, or undefined when there is none. */
  handle?: string
  /**
   * True when `name` is `UNNAMED_AUTHOR` — nothing on the wire named them.
   * Surfaced so a caller can tell "no name" apart from "named", which is what
   * makes a hydration failure countable rather than invisible.
   */
  unnamed: boolean
}

function clean(value: string | undefined | null): string {
  return (value ?? "").trim()
}

export function authorLabel(source: {
  author?: FeedAuthor
  channel?: FeedChannel
}): Byline {
  const channelName = clean(source.channel?.name)
  const displayName = clean(source.author?.display_name)
  const username = clean(source.author?.username)
  const channelHandle = clean(source.channel?.handle)

  // The handle line is the channel's when there is one, and the author's
  // otherwise — but never the same string that is already the name, which is
  // what "@ada" printed twice on one row would be.
  const handle = channelHandle || username
  const named = channelName || displayName

  if (named) {
    return { name: named, handle: handle ? `@${handle}` : undefined, unnamed: false }
  }
  if (username) {
    // The handle IS the name here, so it is not repeated beside itself.
    return { name: `@${username}`, unnamed: false }
  }
  return {
    name: UNNAMED_AUTHOR,
    handle: channelHandle ? `@${channelHandle}` : undefined,
    unnamed: true,
  }
}
