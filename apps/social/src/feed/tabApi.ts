/**
 * The URLs the three sections need that `./api.ts` does not already have.
 *
 * ── This file should not exist for long ───────────────────────────────────
 * `./api.ts` opens by saying it is "the whole network surface of the zone",
 * and it is right to: the packages under packages/ are network-free so reels
 * and tube can reuse them, and that only means anything while the wiring they
 * are free OF has one findable home. Three functions in a second file is a
 * small crack in that. It is here because `api.ts` is being edited by another
 * pair of hands this week and two people rewriting one file is a worse
 * problem than two files. **Fold these three into `api.ts` when that lands**,
 * and delete this — nothing outside `./useTabbedFeed.ts` imports it.
 *
 * The same merge should give `fetchFeedPage` a query argument instead of the
 * hardcoded `feed_mode: "ranked"` it has now, at which point `fetchHomePage`
 * below collapses into it. See the note on that function for why the mode
 * cannot simply be shared.
 *
 * ── Routes verified against the running gateway on 2026-09-09 ─────────────
 *   GET  /v1/feed/home  ?feed_mode&following_only     -> [FeedItem], meta.next_cursor
 *   GET  /v1/hashtags/trending  ?limit                -> {hashtags:[…]}
 *   GET  /v1/hashtags/{tag}/posts  ?limit&cursor&sort -> [PostDetail], meta.next_cursor
 *   POST /v1/profiles/batch  {user_ids:[…]}           -> {id: profile} — NO ENVELOPE
 *
 * That last one is the odd one and the note on `hydrateAuthors` says why it is
 * needed at all.
 */

import api from "@atpost/api-client"
import type { FeedAuthor, FeedItem, FeedPage } from "@atpost/types/feed"

/** The same page size `./api.ts` uses, and for the same reason. */
const PAGE_SIZE = 20

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/**
 * One page of the home timeline, with the section's own narrowing.
 *
 * ── The two tabs must NOT send the same `feed_mode`, and this is the bug ──
 * `./api.ts` explains why the web always asks for `ranked`: `chronological` is
 * the viewer's fan-out timeline, so an account that follows nobody gets an
 * empty array, and the front door of the product must not be blank on the day
 * someone joins. That reasoning is correct — for **For You**.
 *
 * Carrying it into **Following** inverts it. Read feed-service's
 * `GetHomeFeed` (service/feed.go): `following_only` is a filter applied to the
 * timeline candidates, and the cold-start fallback fires afterwards on
 *
 *     before == nil && len(candidates) == 0 && feedMode == "ranked"
 *
 * with no reference to `followingOnly`. So for a viewer who follows nobody the
 * filter empties the set, the fallback refills it with recent PUBLIC posts,
 * and a tab that promises "accounts you follow" serves strangers.
 *
 * Confirmed on the live stack with the test account (which follows nobody):
 *
 *     ?feed_mode=ranked                       -> 5 items 3f860f61,2f22163d,…
 *     ?feed_mode=ranked&following_only=true   -> the SAME 5 items
 *     ?feed_mode=chronological&following_only=true -> 0 items
 *
 * An empty Following tab is a true statement with an honest empty state next
 * to it. A full one made of people you have never followed is a false one, and
 * it is worse precisely because nothing on screen looks wrong. So Following
 * sends `chronological`, which has no fallback path, and For You keeps
 * `ranked`, which needs one.
 *
 * (`following_only` is still sent alongside `chronological` even though the
 * chronological timeline is already a fan-out of follows. The two are not the
 * same set: the timeline also carries reposts and fan-out from sources the
 * follow graph no longer contains, and the filter is the server's own answer
 * to "authored by someone the viewer follows".)
 */
export type HomeSection = "for-you" | "following"

/**
 * The query a section sends, as a value — so the rule above can be tested
 * without a network in the way. This repository's tests are pure table tests
 * with no mocking anywhere in it, and the thing worth testing here is not that
 * axios was called; it is that Following never asks for `ranked`.
 */
export function homeFeedParams(
  section: HomeSection,
  cursor?: string | null
): Record<string, string | number | boolean> {
  const following = section === "following"
  return {
    limit: PAGE_SIZE,
    feed_mode: following ? "chronological" : "ranked",
    ...(following ? { following_only: true } : {}),
    ...(cursor ? { cursor } : {}),
  }
}

export async function fetchHomePage(
  section: HomeSection,
  cursor?: string | null
): Promise<FeedPage> {
  const res = await api.get<Envelope<FeedItem[]>>("/v1/feed/home", {
    params: homeFeedParams(section, cursor),
  })
  return {
    items: res.data?.data ?? [],
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/** One row of `GET /v1/hashtags/trending`. */
export interface TrendingTag {
  /** Normalised, no `#`. This is what the posts-by-tag route takes. */
  name: string
  /** What the server wants shown — `#name`. */
  label: string
  postCount: number
}

interface TrendingWire {
  normalized_name?: string
  display_name?: string
  post_count?: number
}

/**
 * The day's trending tags, most-used first.
 *
 * ── An empty list is a QUIET DAY, not a failure ───────────────────────────
 * post-service reads a Redis sorted set keyed `trending:hashtags:{today UTC}`
 * and falls back to a 24-hour SQL aggregate over `posts.hashtags` when that
 * set is empty. Both windows are 24 hours, so a stack with no posts today
 * answers `{"data":{"hashtags":[]}}` with a 200 — which is exactly what the
 * dev gateway does right now, while `/v1/hashtags/momentum/posts` returns real
 * posts from the 5th. The empty state has to say "nothing today", not
 * "something broke", because on a small deployment the first is almost always
 * what happened.
 *
 * This is NOT the same emptiness as `/v1/search`'s hashtag bucket. That one is
 * an index that was never populated and cannot fill up on its own; this one
 * fills the moment anybody posts with a tag.
 */
export async function fetchTrendingTags(limit = 15): Promise<TrendingTag[]> {
  const res = await api.get<Envelope<{ hashtags?: TrendingWire[] }>>("/v1/hashtags/trending", {
    params: { limit },
  })
  const rows = res.data?.data?.hashtags ?? []
  return rows
    .map((row) => {
      const name = (row.normalized_name ?? "").trim()
      return {
        name,
        label: row.display_name || (name ? `#${name}` : ""),
        postCount: row.post_count ?? 0,
      }
    })
    .filter((tag) => tag.name.length > 0)
}

/**
 * One page of a tag's posts, newest first.
 *
 * The rows come from post-service rather than feed-service. They are the same
 * shape in every field a card reads — verified field by field against a
 * `/v1/feed/home` row on 2026-09-09, the difference being seven ranking
 * extras (`score`, `reason`, `reason_text`, `feed_content_type`, `channel`,
 * `title`, `author`) that only feed-service adds — with ONE that matters:
 * `author`. See `hydrateAuthors`.
 *
 * `sort=recent` rather than `top`: this is a feed, and a feed that opens on
 * the same three all-time-best posts every day is an archive. The endpoint's
 * own default is `recent` too; it is passed explicitly so the choice is
 * visible here rather than inherited from a default that could move.
 */
export function hashtagPath(tag: string): string {
  return `/v1/hashtags/${encodeURIComponent(tag)}/posts`
}

export function hashtagParams(cursor?: string | null): Record<string, string | number> {
  return {
    limit: PAGE_SIZE,
    sort: "recent",
    ...(cursor ? { cursor } : {}),
  }
}

export async function fetchHashtagPage(tag: string, cursor?: string | null): Promise<FeedPage> {
  const res = await api.get<Envelope<FeedItem[]>>(hashtagPath(tag), {
    params: hashtagParams(cursor),
  })
  const items = res.data?.data ?? []
  return {
    items: await hydrateAuthors(items),
    nextCursor: res.data?.meta?.next_cursor || null,
  }
}

/**
 * Put a name on posts that arrived without one.
 *
 * `PostCard` reads `item.author?.display_name` and falls back to the string
 * "Someone". feed-service hydrates `author` for every row it serves;
 * post-service's posts-by-tag route does not, so without this every card in a
 * tag's feed is written by Someone — twenty identical strangers, which reads
 * as a rendering bug rather than as missing data. Android hit the same wall
 * and solved it the same way (`HashtagPostHydrator`).
 *
 * One request per page, for the distinct authors on it, and it is allowed to
 * fail: a page of posts with no names on it is still a page of posts, and
 * throwing away twenty real posts because a profile lookup timed out would be
 * the wrong trade. The failure is silent for the same reason — there is
 * nothing the reader could do about it and nothing they need to decide.
 *
 * ── The response has no envelope ──────────────────────────────────────────
 * Every other gateway route answers `{data, error, meta}`. This one answers
 * the map directly, keyed by user id. Verified live; `res.data.data` is
 * undefined here and reading it would silently hydrate nothing, which is the
 * failure mode this note exists to prevent someone re-introducing.
 */
async function hydrateAuthors(items: FeedItem[]): Promise<FeedItem[]> {
  const missing = Array.from(
    new Set(items.filter((i) => !i.author?.display_name && i.author_id).map((i) => i.author_id))
  )
  if (missing.length === 0) return items

  try {
    const res = await api.post<Record<string, { display_name?: string; username?: string }>>(
      "/v1/profiles/batch",
      { user_ids: missing }
    )
    const profiles = res.data ?? {}
    return items.map((item) => {
      const profile = profiles[item.author_id]
      if (!profile) return item
      const author: FeedAuthor = {
        ...(item.author ?? { id: item.author_id }),
        id: item.author_id,
        ...(profile.display_name ? { display_name: profile.display_name } : {}),
        ...(profile.username ? { username: profile.username } : {}),
      }
      return { ...item, author }
    })
  } catch {
    return items
  }
}
