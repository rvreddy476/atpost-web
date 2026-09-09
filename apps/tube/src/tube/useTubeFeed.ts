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
import { fetchVideosPage } from "./api"

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
 * @param enabled false while the browser is known to be signed out.
 *
 * `/v1/feed/videos` ranks against a viewer and is 401 for an anonymous
 * browser — there is no anonymous long-video feed on this gateway at all — so
 * asking without a session is not a request that might work. It is a
 * guaranteed 401, and each one costs a failed token refresh behind it. The
 * layout seeds the session provider from the request's own cookie, so this is
 * known before the first paint rather than after a round trip.
 */
export function useTubeFeed(deepLinkId?: string, enabled = true): TubeFeed {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [deepLinkMissing, setDeepLinkMissing] = useState(false)

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

  const load = useCallback(async () => {
    if (!enabled || inFlight.current || ended || failed.current) return
    inFlight.current = true
    const first = pagesFetched.current === 0
    if (first) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    try {
      const page = await fetchVideosPage(cursor.current)
      pagesFetched.current += 1
      const fresh = page.items.filter((item) => !seen.current.has(item.id))
      for (const item of fresh) seen.current.add(item.id)
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh])
      cursor.current = page.nextCursor
      if (!page.nextCursor) setEnded(true)
      failed.current = false
    } catch {
      failed.current = true
      setError("Videos could not be loaded.")
    } finally {
      inFlight.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [enabled, ended])

  /**
   * The first page, once — and again if a session arrives.
   *
   * `enabled` and not `load` in the dependency list. `load` also changes
   * identity when `ended` flips, and re-running this on THAT edge would ask
   * for a page the moment the feed ended.
   */
  useEffect(() => {
    if (!enabled) return
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

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
