"use client"

/**
 * The pages of shorts, and finding the one a link asked for.
 *
 * ── Why this does not use @momentum/content's InfiniteFeed ────────────────
 * `InfiniteFeed` loads the next page when a sentinel at the BOTTOM of a
 * scrolling column comes into view. That is right for a column of cards and
 * wrong here: a shorts scroller is one full-screen page at a time, so the
 * sentinel would be a whole viewport below the video being watched and would
 * not enter the observer until somebody had already swiped past the end. The
 * trigger on this surface is distance-in-items, not pixels — fetch when there
 * are fewer than `PREFETCH_MARGIN` shorts left ahead of the one on screen, so
 * the next page is already there when the swipe happens.
 *
 * Everything else about the paging is the same contract the feed uses, and it
 * is the server's rather than ours: an absent `meta` means end-of-feed.
 *
 * ── The source is a parameter, and changing it is a NEW FEED ──────────────
 * Three endpoints answer this hook (see ./source.ts): the ranked flicks feed,
 * the same one with `following_only`, and — for a signed-out browser, which
 * the ranked feed 401s — `/v1/posts/recent`. Their cursors are not compatible
 * with each other: feed-service hands out an opaque base64 token wrapping a
 * v1 UUID and rejects anything else with `400 INVALID_CURSOR`, while
 * post-service uses an RFC3339Nano timestamp. So a source change resets the
 * cursor, the items, the seen set, the failure latch and the page count. It is
 * not a filter applied to a list; it is a different list.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchReelsPage } from "./api"
import type { FeedSource } from "./source"

/** Fetch the next page when this many shorts or fewer remain ahead. */
const PREFETCH_MARGIN = 4

/**
 * How many pages a deep link may walk before giving up.
 *
 * `/reels/{postId}` has to find its short in a RANKED feed, and there is no
 * "give me this one plus the ones after it" endpoint to ask instead. So the
 * link walks pages until the id turns up. The bound exists because the walk is
 * otherwise unbounded on an id that is real but not in this viewer's ranking
 * at all — a private post, a blocked author, a short from a region this
 * account does not see — and an unbounded walk on a miss is a page that
 * fetches until the ranker runs out.
 *
 * Twelve pages of twelve is 144 shorts, which is far past where a person would
 * have scrolled. Past it, the surface says honestly that it could not find it
 * rather than opening a different one.
 *
 * The obvious alternative — `GET /v1/posts/{id}` and hoist the result — was
 * tried and rejected: that endpoint returns a THINNER post than the feed does.
 * Verified on the live gateway, its `media[]` carries `hls_url` but no
 * `variants`, no `blurhash` and no width/height, and the body has no `author`
 * object at all. A short opened that way would play with no poster, no
 * dimensions and no author row — the one row this whole surface was built to
 * put a Follow button in.
 */
const DEEP_LINK_MAX_PAGES = 12

export interface ReelsFeed {
  items: FeedItem[]
  /** True while the FIRST page is in flight; there is nothing to show yet. */
  loading: boolean
  /** True while a subsequent page is in flight. */
  loadingMore: boolean
  error: string | null
  /** The server has no more shorts for this viewer. */
  ended: boolean
  /**
   * The deep-linked short could not be found. Distinct from `error`: nothing
   * failed, the id is simply not in this list.
   */
  deepLinkMissing: boolean
  /** Index of the deep-linked short once it is found, or null. */
  deepLinkIndex: number | null
  retry: () => void
  /** Tell the feed which short is on screen, so it can prefetch ahead of it. */
  noteIndex: (index: number) => void
  /**
   * Ask for the next page outright.
   *
   * The browse grid's pager, and only the browse grid's. The immersive
   * scroller uses `noteIndex`, because its trigger is distance-in-ITEMS from
   * the short being watched — see the header — while the grid is an ordinary
   * scrolling column with a sentinel under it, which is a question about
   * pixels that `@momentum/content`'s InfiniteFeed already answers.
   */
  loadMore: () => void
  /** Replace one item in place — an optimistic like or save landing. */
  patch: (id: string, change: Partial<FeedItem>) => void
  /**
   * Take one out: "Not interested", or its author muted.
   *
   * It stays in the `seen` set, so a page fetched from a cursor that was
   * issued before the signal landed cannot put it back a moment later — which
   * is exactly what the ranker will do, since the queue it is paging through
   * was scored before anybody pressed anything.
   */
  remove: (id: string) => void
}

/**
 * @param source which endpoint this feed reads. Changing it starts a new one.
 * @param deepLinkId the short `/reels/{id}` asked for, if any.
 */
export function useReelsFeed(source: FeedSource, deepLinkId?: string): ReelsFeed {
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
   * The ranker can return the same short on two pages — it scores a candidate
   * set rather than reading a stable ordered list — and React would then have
   * two children with one key. Which is not a warning here so much as two
   * players mounted for one short, both registering with the autoplay
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
   * a 401 makes the api-client attempt a refresh, the refresh 400s, the page
   * renders, the prefetch effect asks for a page again — and the whole thing
   * goes round for as long as the tab is open. Observed doing exactly that,
   * six times in nine seconds, against a signed-out browser.
   */
  const failed = useRef(false)

  /**
   * The source the in-flight page was asked from.
   *
   * A tab switch mid-request is the normal case, not a rare one — the strip is
   * two taps apart — and a page from the old source merged into the new list
   * would be a Following feed quietly containing strangers.
   */
  const loadingFor = useRef<FeedSource>(source)

  const load = useCallback(async () => {
    if (inFlight.current || ended || failed.current) return
    inFlight.current = true
    loadingFor.current = source
    const first = pagesFetched.current === 0
    if (first) setLoading(true)
    else setLoadingMore(true)
    setError(null)

    try {
      const page = await fetchReelsPage(source, cursor.current)
      if (loadingFor.current !== source) return
      pagesFetched.current += 1
      const fresh = page.items.filter((item) => !seen.current.has(item.id))
      for (const item of fresh) seen.current.add(item.id)
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh])
      cursor.current = page.nextCursor
      if (!page.nextCursor) setEnded(true)
      failed.current = false
    } catch {
      if (loadingFor.current !== source) return
      failed.current = true
      setError("Shorts could not be loaded.")
    } finally {
      inFlight.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [ended, source])

  /**
   * The first page of THIS source, once.
   *
   * `source` and not `load` in the dependency list. `load` also changes
   * identity when `ended` flips, and re-running this on THAT edge would ask
   * for a page the moment the feed ended.
   */
  useEffect(() => {
    setItems([])
    setError(null)
    setEnded(false)
    setDeepLinkMissing(false)
    setLoading(true)
    cursor.current = null
    pagesFetched.current = 0
    failed.current = false
    seen.current = new Set()
    inFlight.current = false
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])

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
      // Without this guard `0 - 0 <= margin` is true and the prefetch asks for
      // a page every time the surface renders with nothing on it — which is
      // exactly the state it is in while the first page is failing.
      if (items.length === 0) return
      if (items.length - index <= PREFETCH_MARGIN) void load()
    },
    [ended, items.length, load]
  )

  const loadMore = useCallback(() => {
    void load()
  }, [load])

  const patch = useCallback((id: string, change: Partial<FeedItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }, [])

  const remove = useCallback((id: string) => {
    // Deliberately NOT removed from `seen`. See the note on `remove` above.
    setItems((prev) => prev.filter((item) => item.id !== id))
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
    loadMore,
    patch,
    remove,
  }
}
