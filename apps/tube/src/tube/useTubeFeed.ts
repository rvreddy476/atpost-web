"use client"

/**
 * The pages of long videos, and finding the one a link asked for.
 *
 * Both surfaces in this zone read this hook, and they use opposite halves of
 * it. `/tube` pages forward with `loadMore`, driven by `@momentum/content`'s
 * `InfiniteFeed` sentinel. `/tube/{postId}` passes a `deepLinkId` and reads
 * `item` — the walk below is what turns a ranked, paginated feed into "the one
 * video this URL names".
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE WATCH PAGE WALKS THE FEED INSTEAD OF FETCHING THE POST
 *
 * `GET /v1/posts/{postId}` exists, it is one request, and it is the obvious
 * thing to do. It was tried and it is not enough — verified against the live
 * gateway on 2026-09-09 with `02822253-…`, a real long video:
 *
 *     feed row  media[0]: media_id, kind, position, status, width, height,
 *                         blurhash, duration_ms, variants{5}, hls_url,
 *                         expires_at, processing_status, moderation_status,
 *                         playback_url, playback_kind
 *     post row  media[0]: media_id, kind, position, alt_text, alt_decorative,
 *                         processing_status, moderation_status, duration_ms,
 *                         hls_url
 *
 * No `variants`, so no poster and no progressive fallback when HLS will not
 * attach. No `blurhash`, so the frame is black rather than soft while the
 * first frame decodes. No `width`/`height`, so the player cannot reserve the
 * right box and the page jumps when the video loads. And no `author` object at
 * all — post-service's `PostDetail` carries `channel` but not the author, so
 * the row that names who made this and offers the Follow button would be
 * empty. Turning a post row into a feed row means three more calls
 * (`/v1/profiles/batch`, `/v1/media/batch`, `/v1/channels/batch`), which is
 * what feed-service itself does, on the server, once, for a whole page.
 *
 * So the watch page reads the same ranked feed the browse page does and finds
 * its video in it. In the ordinary case — clicking a card — page one is
 * already the page the card came from. A pasted link costs one request per
 * page until the id turns up.
 *
 * The bound below exists because the walk is otherwise unbounded on an id that
 * is real but not in this viewer's ranking at all: a private post, a blocked
 * author, a video from a region this account does not see. Twelve pages of
 * twelve is 144 videos, far past where anybody would have scrolled. Past it
 * the surface says honestly that it could not find the video rather than
 * opening a different one.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchVideosPage, feedQueryKey, type TubeFeedQuery } from "./api"

/** How many pages a deep link may walk before giving up. See the header. */
const DEEP_LINK_MAX_PAGES = 12

export interface TubeFeed {
  items: FeedItem[]
  /** True while the FIRST page is in flight; there is nothing to show yet. */
  loading: boolean
  /** True while a subsequent page is in flight. */
  loadingMore: boolean
  error: string | null
  /** The server has no more videos for this viewer. */
  ended: boolean
  /**
   * The deep-linked video could not be found. Distinct from `error`: nothing
   * failed, the id is simply not in this viewer's videos.
   */
  deepLinkMissing: boolean
  /** The deep-linked video once it is found, or null. */
  item: FeedItem | null
  /** Its 1-based rank in the feed, for analytics `position`. 0 when unknown. */
  position: number
  retry: () => void
  /** Ask for the next page outright. The browse grid's pager. */
  loadMore: () => void
  /** Replace one item in place — an optimistic like or save landing. */
  patch: (id: string, change: Partial<FeedItem>) => void
}

/**
 * @param deepLinkId the post the watch page was opened on, if any.
 * @param enabled false while there is nothing worth asking for.
 * @param query which page of long video — see `TubeFeedQuery` in ./api.ts.
 *
 * ── `enabled` used to mean "there is a session" ───────────────────────────
 * It meant that because `/v1/feed/videos` ranks against a viewer and is 401
 * for an anonymous browser: asking without a session was not a request that
 * might work, it was a guaranteed 401 with a failed token refresh behind each
 * one. That is still true of THAT endpoint, and it is now expressed where it
 * belongs — `query.anonymous` switches the call to the public shelf — so a
 * signed-out home page fetches something that works instead of fetching
 * nothing. `enabled` is back to its plain meaning: false while the caller has
 * not decided yet.
 *
 * ── The query is part of the hook's IDENTITY ──────────────────────────────
 * A cursor and a seen-set belong to one query. Switching from All to Comedy
 * while holding the old cursor asks the server to continue a list it is no
 * longer sending, and the seen-set would silently drop videos that appear in
 * both. So every piece of paging state is torn down and rebuilt when
 * `feedQueryKey(query)` changes — see the effect below, which is the only
 * thing in this file that is allowed to reset it.
 */
export function useTubeFeed(
  deepLinkId?: string,
  enabled = true,
  query: TubeFeedQuery = {}
): TubeFeed {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [deepLinkMissing, setDeepLinkMissing] = useState(false)

  /** The query's identity, and the only thing that makes this hook start over. */
  const queryKey = feedQueryKey(query)

  const cursor = useRef<string | null>(null)
  const inFlight = useRef(false)
  const pagesFetched = useRef(0)

  /**
   * Ids already on screen.
   *
   * The ranker can return the same video on two pages — it scores a candidate
   * set rather than reading a stable ordered list — and React would then have
   * two children with one key. `/v1/feed/videos` makes this likelier than the
   * reels feed does, because its first page is topped up from
   * `/v1/posts/recent` and a recent video can legitimately be in both halves.
   */
  const seen = useRef(new Set<string>())

  /**
   * A page that failed stays failed until somebody asks again.
   *
   * A ref rather than the `error` state because `load` must see the CURRENT
   * value at call time, not the one captured when it was last created.
   *
   * This is not belt-and-braces. Without it the surface hammers the endpoint:
   * a 401 makes the api-client attempt a refresh, the refresh 400s, the page
   * renders, the deep-link effect asks for a page again — and the whole thing
   * goes round for as long as the tab is open. It was observed doing exactly
   * that in apps/reels, six times in nine seconds, against a signed-out
   * browser.
   */
  const failed = useRef(false)

  /**
   * The end of the feed, as a ref as well as as state.
   *
   * The state is what the surface renders. The ref is what `load` reads,
   * and they are separate for two reasons that both bite:
   *
   *   · `load` must see the CURRENT value at call time. Reading the state
   *     variable meant `load` changed identity whenever `ended` flipped,
   *     which the effect below then had to have an `eslint-disable` and a
   *     paragraph to work around.
   *   · A reset sets `ended` to false and calls `load` in the same tick. A
   *     `load` closed over the old state would see the OLD `true` and refuse
   *     to fetch the first page of the new query — a chip that filters to a
   *     category and then shows an empty grid forever.
   */
  const endedRef = useRef(false)

  /**
   * Which query the pages on screen belong to.
   *
   * Bumped by the reset effect. A response that comes back after the query
   * has moved on is dropped rather than appended: without this, switching
   * chips quickly interleaves two feeds into one list, and the cursor that
   * ends up in `cursor.current` belongs to whichever request happened to
   * finish last.
   */
  const generation = useRef(0)

  /** The query as of the last reset. See the note on `generation`. */
  const activeQuery = useRef<TubeFeedQuery>(query)

  const load = useCallback(async () => {
    if (!enabled || inFlight.current || endedRef.current || failed.current) return
    inFlight.current = true
    const mine = generation.current
    const first = pagesFetched.current === 0
    if (first) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    try {
      const page = await fetchVideosPage(cursor.current, activeQuery.current)
      if (mine !== generation.current) return
      pagesFetched.current += 1
      const fresh = page.items.filter((item) => !seen.current.has(item.id))
      for (const item of fresh) seen.current.add(item.id)
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh])
      cursor.current = page.nextCursor
      if (!page.nextCursor) {
        endedRef.current = true
        setEnded(true)
      }
      failed.current = false
    } catch {
      if (mine !== generation.current) return
      failed.current = true
      setError("Videos could not be loaded.")
    } finally {
      if (mine === generation.current) {
        inFlight.current = false
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [enabled])

  /**
   * The first page — and the whole state torn down when the query changes.
   *
   * `queryKey` rather than `query` in the dependency list because `query` is
   * an object literal at every call site and would be a new identity on every
   * render, which is an infinite fetch loop rather than a subtle bug.
   *
   * Everything below the line is paging state that belongs to ONE query, and
   * this is the only place any of it is reset. Leaving any single piece
   * behind has a distinct and confusing symptom: a stale `cursor` continues a
   * list the server is no longer sending, a stale `seen` set silently drops
   * videos that are in both answers, a stale `ended` shows an empty grid
   * forever, and a stale `failed` latch refuses to fetch the new query at all.
   */
  useEffect(() => {
    if (!enabled) return
    generation.current += 1
    activeQuery.current = query
    cursor.current = null
    pagesFetched.current = 0
    inFlight.current = false
    seen.current = new Set()
    failed.current = false
    endedRef.current = false
    setItems([])
    setEnded(false)
    setError(null)
    setDeepLinkMissing(false)
    setLoading(true)
    void load()
    // `query` is intentionally absent: `queryKey` is its identity, and `load`
    // is stable now that it no longer closes over `ended`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, queryKey])

  const foundAt = deepLinkId ? items.findIndex((i) => i.id === deepLinkId) : -1

  /**
   * The deep-link walk.
   *
   * Runs after every page lands, and stops the moment the id is present, the
   * feed ends, or the bound is reached. `deepLinkMissing` is only ever set at
   * the END of the walk — setting it while pages are still arriving would show
   * "we could not find it" over a feed that was about to contain it.
   */
  useEffect(() => {
    if (!deepLinkId || loading || inFlight.current) return
    if (foundAt !== -1) {
      setDeepLinkMissing(false)
      return
    }
    if (ended || pagesFetched.current >= DEEP_LINK_MAX_PAGES) {
      setDeepLinkMissing(true)
      return
    }
    void load()
  }, [deepLinkId, foundAt, ended, load, loading, items.length])

  const loadMore = useCallback(() => {
    void load()
  }, [load])

  const patch = useCallback((id: string, change: Partial<FeedItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }, [])

  const retry = useCallback(() => {
    setError(null)
    // The only thing that clears the latch. A retry is a person asking.
    failed.current = false
    void load()
  }, [load])

  return {
    items,
    loading,
    loadingMore,
    error,
    ended,
    deepLinkMissing: Boolean(deepLinkId) && deepLinkMissing && foundAt === -1,
    item: foundAt === -1 ? null : items[foundAt],
    position: foundAt === -1 ? 0 : foundAt + 1,
    retry,
    loadMore,
    patch,
  }
}
