"use client"

/**
 * What plays next — the recommendations rail's data.
 *
 * ── One page, and no infinite scroll ──────────────────────────────────────
 * The endpoint pages (`base64url("v1r:" + offset)`), and this asks for one page
 * of twelve and offers a control for the next rather than a sentinel. A rail
 * beside a playing video is not a feed: an IntersectionObserver at the bottom
 * of it fires whenever somebody scrolls down to read the description, which
 * would fetch pages nobody asked for while a video is buffering. `loadMore`
 * exists and is a button.
 *
 * ── Failures are told apart, because the answers differ ───────────────────
 * `404` from this endpoint means "the seed post does not exist, or you cannot
 * see it" — feed-service returns one answer for both deliberately, so the
 * endpoint cannot be used to probe for posts. `400 UNSUPPORTED_CONTENT_TYPE` is
 * a non-video seed, which on this page would be a bug in what we passed.
 * `503 FEED_UNAVAILABLE` is hydration failing, and it is the one worth offering
 * a retry for: feed-service refuses to answer with un-hydrated ids, so a
 * transient dependency outage looks exactly like this and clears on its own.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchRelatedVideos } from "./api"

export interface Related {
  items: FeedItem[]
  loading: boolean
  loadingMore: boolean
  /** Set only when there is nothing to show. A failed SECOND page is not this. */
  error: string | null
  /** The server has no more. */
  ended: boolean
  loadMore: () => void
  retry: () => void
}

function messageFor(error: unknown): string {
  const status = (error as { response?: { status?: number } }).response?.status
  if (status === 404) return "There is nothing related to show for this video."
  if (status === 400) return "Related videos are not available for this post."
  return "Related videos could not be loaded."
}

export function useRelated(postId: string, enabled = true): Related {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)

  const cursor = useRef<string | null>(null)
  const inFlight = useRef(false)
  /**
   * A page that failed stays failed until somebody asks again.
   *
   * The same latch ../tube/useTubeFeed.ts carries, and for the same observed
   * reason: a 401 makes the api-client attempt a refresh, the refresh fails,
   * the component renders, an effect asks again — and the loop runs for as long
   * as the tab is open. A ref rather than state because the loader must see the
   * value at call time, not the one captured when it was created.
   */
  const failed = useRef(false)
  /** Ids already in the rail. The related pool is re-ranked per request, so a
   *  video can legitimately come back on two pages and React would then have
   *  two children with one key. */
  const seen = useRef(new Set<string>())

  const load = useCallback(async () => {
    if (!enabled || !postId || inFlight.current || ended || failed.current) return
    inFlight.current = true
    const first = cursor.current === null && seen.current.size === 0
    if (first) setLoading(true)
    else setLoadingMore(true)

    try {
      const page = await fetchRelatedVideos(postId, cursor.current)
      const fresh = page.items.filter((item) => !seen.current.has(item.id))
      for (const item of fresh) seen.current.add(item.id)
      if (fresh.length > 0) setItems((prev) => [...prev, ...fresh])
      cursor.current = page.nextCursor
      if (!page.nextCursor) setEnded(true)
      setError(null)
      failed.current = false
    } catch (err) {
      failed.current = true
      // A failed SECOND page leaves what is already on screen alone: the rail
      // is still useful, and replacing eleven working rows with an apology
      // because the twelfth page did not arrive is a worse page.
      if (seen.current.size === 0) setError(messageFor(err))
    } finally {
      inFlight.current = false
      setLoading(false)
      setLoadingMore(false)
    }
  }, [enabled, ended, postId])

  useEffect(() => {
    if (!enabled) return
    void load()
    // `postId` and `enabled` only. `load` also changes identity when `ended`
    // flips, and re-running on THAT edge asks for a page the moment the rail
    // ended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, enabled])

  const loadMore = useCallback(() => void load(), [load])

  const retry = useCallback(() => {
    setError(null)
    failed.current = false
    void load()
  }, [load])

  return { items, loading, loadingMore, error, ended, loadMore, retry }
}
