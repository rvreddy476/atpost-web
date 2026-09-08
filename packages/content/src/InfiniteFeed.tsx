"use client"

/**
 * The pager: a sentinel below the last card that asks for more when it comes
 * into view.
 *
 * ── Why a sentinel and not a scroll listener ──────────────────────────────
 * A scroll handler runs on every frame of every scroll and has to measure the
 * document to decide anything. An IntersectionObserver on one empty div is
 * asked nothing until the browser decides the div is visible. On a feed of
 * videos, where the main thread is already decoding, that difference is the
 * difference between a smooth scroll and a stuttering one.
 *
 * ── rootMargin, and why it is large ───────────────────────────────────────
 * 800px below the viewport. The next page has to be requested, travel, and
 * render before the person reaches the bottom, and a round trip to the gateway
 * plus hydration is not instant. Firing exactly at the bottom guarantees
 * everyone sees the spinner; firing a screen early means almost nobody does.
 *
 * ── The two ways this goes wrong, both guarded ────────────────────────────
 * The sentinel can be visible when a page ARRIVES — if the new page is short,
 * or the window is tall — and it will happily fire again immediately. And
 * `onLoadMore` may be a new function identity on every render, which would
 * re-create the observer constantly. So the callback is held in a ref, and the
 * observer only ever fires when `hasMore && !loading`.
 */

import { useEffect, useRef } from "react"

export interface InfiniteFeedProps {
  children: React.ReactNode
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  /** Shown under the list while the next page is in flight. */
  loadingIndicator?: React.ReactNode
  /** Shown once, when there is no next page. */
  endIndicator?: React.ReactNode
}

export function InfiniteFeed({
  children,
  hasMore,
  loading,
  onLoadMore,
  loadingIndicator,
  endIndicator,
}: InfiniteFeedProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  // Held in a ref so a caller that passes an inline arrow does not tear the
  // observer down and build it again on every render.
  const loadMoreRef = useRef(onLoadMore)
  loadMoreRef.current = onLoadMore

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loading) return
    if (typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreRef.current()
      },
      { rootMargin: "800px 0px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
    // `loading` is in the deps on purpose: the observer is torn down while a
    // page is in flight and rebuilt after it lands, which is what stops a
    // short page from requesting the next three at once.
  }, [hasMore, loading])

  return (
    <div>
      <div className="space-y-4">{children}</div>
      {loading && loadingIndicator}
      {!hasMore && !loading && endIndicator}
      {/* Not focusable and not announced: it is a scroll trigger, not content. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
    </div>
  )
}
