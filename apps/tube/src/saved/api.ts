/**
 * The saved page's one read. The write it needs already exists.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CODED AGAINST THE CONTRACT, 2026-09-12, SESSION REQUIRED
 *
 *   GET /v1/posts/bookmarks?type=long_video&limit&cursor
 *       → {data:[PostDetail with is_bookmarked:true], meta:{next_cursor?}}
 *
 * `type=long_video` is what makes this Tube's list rather than the product's.
 * A bookmark is one edge across every content type (`POST /v1/posts/{id}/
 * bookmark` is the same call from the feed, from reels and from here), so
 * the unfiltered list is a person's saved posts and flicks too, and a Tube
 * page that drew them would be drawing rows its own card cannot open. The
 * narrowing is sent every time and nothing here offers to drop it.
 *
 * ── Removing is `setBookmark(id, false)` in ../tube/api.ts ────────────────
 * Not restated here. The watch page's Save button and this page's Remove
 * are the same DELETE against the same route, and two functions for one
 * route is how they drift.
 *
 * ── The cursor is the `/v1/posts` family ──────────────────────────────────
 * A bare RFC3339Nano timestamp, the third of the three cursor families
 * ../tube/api.ts lists, and nothing here parses it: passed back verbatim.
 * A `meta` that is absent entirely is the last page.
 */

import api from "@atpost/api-client"
import type { FeedItem } from "@atpost/types/feed"

const PAGE_SIZE = 12

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
}

export interface SavedPage {
  items: FeedItem[]
  nextCursor: string | null
}

export async function fetchSavedPage(cursor?: string | null): Promise<SavedPage> {
  const res = await api.get<Envelope<unknown[]>>("/v1/posts/bookmarks", {
    params: { type: "long_video", limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
  })
  const data = Array.isArray(res.data?.data) ? res.data.data : []
  return {
    // A row with no id has no watch page to open and no key to be listed
    // under, so it is dropped the way a history row with no post is.
    items: data.filter(
      (row): row is FeedItem =>
        Boolean(row) && typeof row === "object" && typeof (row as FeedItem).id === "string"
    ),
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}
