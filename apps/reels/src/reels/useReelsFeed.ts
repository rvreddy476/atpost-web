"use client"

/**
 * The pages of reels, and finding the one a link asked for.
 *
 * ── Why this does not use @momentum/content's InfiniteFeed ────────────────
 * `InfiniteFeed` loads the next page when a sentinel at the BOTTOM of a
 * scrolling column comes into view. That is right for a column of cards and
 * wrong here: a reels scroller is one full-screen page at a time, so the
 * sentinel would be a whole viewport below the reel being watched and would
 * not enter the observer until somebody had already swiped past the end. The
 * trigger on this surface is distance-in-items, not pixels — fetch when there
 * are fewer than `PREFETCH_MARGIN` reels left ahead of the one on screen, so
 * the next page is already there when the swipe happens.
 *
 * Everything else about the paging is the same contract the feed uses, and it
 * is the server's rather than ours: an absent `meta` means end-of-feed.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchReelsPage } from "./api"

/** Fetch the next page when this many reels or fewer remain ahead. */
const PREFETCH_MARGIN = 4

/**
 * How many pages a deep link may walk before giving up.
 *
 * `/reels/{postId}` has to find its reel in a RANKED feed, and there is no
 * "give me this reel plus the ones after it" endpoint to ask instead. So the
 * link walks pages until the id turns up. The bound exists because the walk is
 * otherwise unbounded on an id that is real but not in this viewer's ranking
 * at all — a private post, a blocked author, a reel from a region this account
 * does not see — and an unbounded walk on a miss is a page that fetches until
 * the ranker runs out.
 *
 * Twelve pages of twelve is 144 reels, which is far past where a person would
 * have scrolled. Past it, the surface says honestly that it could not find the
 * reel rather than opening a different one.
 *
 * The obvious alternative — `GET /v1/posts/{id}` and hoist the result, which
 * is what the Android client's `OpenOnEntry` slot does — was tried and
 * rejected: that endpoint returns a THINNER post than the feed does. Verified
 * on the live gateway, its `media[]` carries `hls_url` but no `variants`, no
 * `blurhash` and no width/height, and the body has no `author` object at all.
 * A reel opened that way would play with no poster, no dimensions and no
 * author row — the one row this whole surface was built to put a Follow button
 * in. Android can do it because its `ReelsHead` is fed from the post the user
 * just created, which it already has in full.
 */
const DEEP_LINK_MAX_PAGES = 12

export interface ReelsFeed {
  items: FeedItem[]
  /** True while the FIRST page is in flight; there is nothing to show yet. */
  loading: boolean
  /** True while a subsequent page is in flight. */
  loadingMore: boolean
  error: string | null
  /** The server has no more reels for this viewer. */
  ended: boolean
  /**
   * The deep-linked reel could not be found. Distinct from `error`: nothing
   * failed, the id is simply not in this viewer's reels.
   */
  deepLinkMissing: boolean
  /** Index of the deep-linked reel once it is found, or null. */
  deepLinkIndex: number | null
  retry: () => void
  /** Tell the feed which reel is on screen, so it can prefetch ahead of it. */
  noteIndex: (index: number) => void
  /** Replace one item in place — an optimistic like or save landing. */
  patch: (id: string, change: Partial<FeedItem>) => void
}

/**
 * @param enabled false while the browser is known to be signed out.
 *
 * `/v1/feed/reels` ranks against a viewer and is 401 for an anonymous
 * browser, so asking without a session is not a request that might work — it
 * is a guaranteed 401, and each one costs a failed token refresh behind it.
 * The layout seeds the session provider from the request's own cookie, so
 * this is known before the first paint rather than after a round trip.
 */
export function useReelsFeed(deepLinkId?: string, enabled = true): ReelsFeed {
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
   * The ranker can return the same reel on two pages — it scores a candidate
   * set rather than reading a stable ordered list — and React would then have
   * two children with one key. Which is not a warning here so much as two
   * players mounted for one reel, both registering with the autoplay
   * coordinator under the same id.
   */
  const seen = useRef(new Set<string>())

  /**
   * A page that failed stays failed until somebody asks again.
   *
   * A ref rather than the `error` state because `load` must see the CURRENT
   * value at call time, not the one captured when it was last created.
   *
   * This is not belt-and-braces. Without it the surface hammers the endpoint:
   * a 401 from `/v1/feed/reels` makes the api-client attempt a refresh, the
   * refresh 400s, the page renders, the prefetch effect asks for a page
   * again — and the whole thing goes round for as long as the tab is open.
   * Observed doing exactly that, six times in nine seconds, against a signed-
   * out browser.
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
      const page = await fetchReelsPage(cursor.current)
      pagesFetched.current += 1
      const fresh = page.items.filter((item) => !seen.current.has(item.id))
      for (const item of fresh) seen.current.add(item.id)
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh])
      cursor.current = page.nextCursor
      if (!page.nextCursor) setEnded(true)
      failed.current = false
    } catch {
      failed.current = true
      setError("Reels could not be loaded.")
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

  /**
   * The deep-link walk.
   *
   * Runs after every page lands, and stops the moment the id is present, the
   * feed ends, or the bound is reached. `deepLinkMissing` is only ever set at
   * the END of the walk — setting it while pages are still arriving would show
   * "we could not find it" over a feed that was about to contain it.
   */
  const deepLinkIndex = deepLinkId ? items.findIndex((i) => i.id === deepLinkId) : -1
  useEffect(() => {
    if (!deepLinkId || loading || inFlight.current) return
    if (deepLinkIndex !== -1) {
      setDeepLinkMissing(false)
      return
    }
    if (ended || pagesFetched.current >= DEEP_LINK_MAX_PAGES) {
      setDeepLinkMissing(true)
      return
    }
    void load()
  }, [deepLinkId, deepLinkIndex, ended, load, loading, items.length])

  const noteIndex = useCallback(
    (index: number) => {
      if (ended || inFlight.current) return
      // An empty list is the FIRST page's business, not the prefetch's.
      // Without this guard `0 - 0 <= margin` is true and the prefetch asks
      // for a page every time the surface renders with nothing on it —
      // which is exactly the state it is in while the first page is failing.
      if (items.length === 0) return
      if (items.length - index <= PREFETCH_MARGIN) void load()
    },
    [ended, items.length, load]
  )

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
    deepLinkMissing: Boolean(deepLinkId) && deepLinkMissing && deepLinkIndex === -1,
    deepLinkIndex: deepLinkIndex === -1 ? null : deepLinkIndex,
    retry,
    noteIndex,
    patch,
  }
}
