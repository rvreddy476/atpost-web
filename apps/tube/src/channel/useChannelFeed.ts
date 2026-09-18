"use client"

/**
 * One content tab's rows, its cursor, and its failures.
 *
 * Videos and Shorts are the same machine pointed at two `type=` values, so
 * they are one hook used twice rather than two copies of the same effect. The
 * channel page mounts BOTH and enables one: the inactive tab holds whatever it
 * already loaded, so arrowing Videos → Shorts → Videos does not re-fetch page
 * one and does not lose the reader's scroll position in a grid they had
 * already paged through twice.
 *
 * ── `enabled` is what makes the two cheap ─────────────────────────────────
 * Without it, opening a channel would fetch both grids for a person looking
 * at one of them, which on a channel with shorts is a wasted page of twelve
 * on every visit. With it, a tab's first request is made the first time it is
 * SHOWN, and never again for the life of the page.
 *
 * ── The failure is per-tab and does not take the page down ────────────────
 * The channel row is the page; a tab is a section. A tab whose request failed
 * says so inside itself, with its own "Try again", while the header, the other
 * tabs and the subscribe control carry on working. Same discipline the four
 * requests in ./ChannelScreen.tsx keep.
 *
 * ── Why rows are de-duplicated across a page boundary ─────────────────────
 * The author feed is newest-first over a stable list, so a repeat is not
 * expected the way it is on a ranked feed. But a boundary that DID repeat one
 * row would hand React two children with the same key, which is a crash
 * rather than a cosmetic problem, and the guard is four lines.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { fetchChannelPosts, type ChannelFeedKind } from "./api"

/**
 * A page appended to what is already held, with repeats dropped.
 *
 * Exported and pure so ./useChannelFeed.test.ts can assert it without a
 * renderer: this repo has no jsdom and no testing-library, and the one rule in
 * this hook that can crash a page rather than merely look wrong deserves to be
 * checked rather than reasoned about. See the header for why the guard exists
 * at all on a feed that should not repeat.
 */
export function mergePage(previous: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const seen = new Set(previous.map((item) => item.id))
  return [...previous, ...incoming.filter((item) => !seen.has(item.id))]
}

export interface ChannelFeed {
  items: FeedItem[]
  /** The FIRST page is in flight and there is nothing to draw yet. */
  loading: boolean
  /** A later page is in flight, under a grid that already has rows. */
  loadingMore: boolean
  /** The last request failed. The rows already held are still shown. */
  failed: boolean
  /** Is there another page, as far as the server has said? */
  hasMore: boolean
  loadMore: () => void
  /** Ask again after a failure, from wherever the list got to. */
  retry: () => void
}

export function useChannelFeed(
  authorId: string | null | undefined,
  kind: ChannelFeedKind,
  enabled: boolean
): ChannelFeed {
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)
  /** Has page one ever been asked for, for THIS author and kind? */
  const started = useRef(false)
  const inFlight = useRef(false)

  // A new author (or a re-mount onto a different channel) is a different list.
  // The reset is keyed on both so switching channels cannot show the previous
  // channel's rows for a frame.
  useEffect(() => {
    started.current = false
    inFlight.current = false
    setItems([])
    setCursor(null)
    setFailed(false)
    setLoading(false)
    setLoadingMore(false)
  }, [authorId, kind])

  const load = useCallback(
    (from: string | null) => {
      if (!authorId || inFlight.current) return
      inFlight.current = true
      const first = from === null
      if (first) setLoading(true)
      else setLoadingMore(true)
      setFailed(false)

      fetchChannelPosts(authorId, kind, from)
        .then((page) => {
          // See the header: one repeated row across a boundary would be two
          // React children with one key.
          setItems((prev) => (first ? page.items : mergePage(prev, page.items)))
          setCursor(page.nextCursor)
        })
        .catch(() => setFailed(true))
        .finally(() => {
          inFlight.current = false
          setLoading(false)
          setLoadingMore(false)
        })
    },
    [authorId, kind]
  )

  /* Page one, the first time this tab is actually looked at. */
  useEffect(() => {
    if (!enabled || !authorId || started.current) return
    started.current = true
    load(null)
  }, [enabled, authorId, load])

  const loadMore = useCallback(() => {
    if (!cursor || failed) return
    load(cursor)
  }, [cursor, failed, load])

  const retry = useCallback(() => {
    // From the cursor when there are rows behind it, from the top when the
    // first page is what failed — retrying page one over a half-filled grid
    // would silently discard whatever the reader had already scrolled past.
    load(items.length === 0 ? null : cursor)
  }, [cursor, items.length, load])

  return {
    items,
    loading,
    loadingMore,
    failed,
    // A cursor the server did not send means the end of the list, and a failed
    // request means STOP rather than "the end": an infinite scroller that
    // keeps firing into a failing endpoint is how a page melts a phone.
    hasMore: Boolean(cursor) && !failed,
    loadMore,
    retry,
  }
}
