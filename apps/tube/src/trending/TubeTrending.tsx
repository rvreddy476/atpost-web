"use client"

/**
 * `/tube/trending` — RUTUBE's "In the top", as a page of its own.
 *
 * `GET /v1/posts/trending?content_type=long_video`, which is PUBLIC. That is
 * why this is a rail row above the You block rather than inside it: with Home
 * and Explore it is one of the three things a signed-out visitor can actually
 * do in this app.
 *
 * ── Two trending endpoints exist and only one of them is about video ──────
 * Both were read before this page was built, because the brief asked which
 * carried better data:
 *
 *   · `GET /v1/posts/trending` (post-service) — posts ranked by the same
 *     engagement score the hashtag "top" sort uses, filterable by
 *     `content_type`. This is the one.
 *   · `GET /v1/discover/trending` (search-service) — reads the Redis sorted
 *     set `trending:hashtags:{YYYY-MM-DD}` and answers
 *     `{"trending":[{hashtag, score}]}`. HASHTAGS. Not videos, not posts, no
 *     ids to open. A page built on it would be a list of words, and Tube has
 *     no hashtag page to send any of them to.
 *
 * So the second one is not a fallback and is not called. It is recorded here
 * so the next person does not have to read both again.
 *
 * ── The rows are thin, and the page says so instead of drawing gaps ───────
 * `GetTrendingPosts` hydrates counts and the live media state and calls
 * NEITHER `attachChannelRefs` NOR anything that fills `variants`. So a row
 * carries a title, an age, counts and a duration, and carries no poster, no
 * blurhash and no channel. The card already draws that case — a soft well with
 * a duration badge — and the strip above the grid states it, for the same
 * reason `PublicNotice` states the signed-out shortfall: somebody who clicks
 * into a video and finds a visibly richer page should have been told that was
 * coming.
 *
 * It is also why Home has no hero carousel. A featured strip is a picture with
 * words over it, and this is the only ranked-by-popularity list in the app;
 * with no picture on any row, a hero would be a full-width band of type
 * pushing the first real video below the fold. ../browse/TubeBrowse.tsx
 * records the same decision at the place where the hero would have gone.
 */

import { useCallback, useEffect, useState } from "react"
import { Flame } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { useCardActions } from "@/menu/useCardActions"
import { fetchTrendingVideos } from "@/tube/discoverApi"
import { VideoGrid } from "@/browse/VideoGrid"
import { BrowseError, BrowseSkeleton, EmptyCard, PageHeader } from "@/browse/states"

export function TubeTrending() {
  const actions = useCardActions()
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    setLoading(true)
    setError(null)
    fetchTrendingVideos()
      .then((page) => {
        if (!live) return
        setItems(page.items)
        setCursor(page.nextCursor)
      })
      .catch(() => {
        if (live) setError("Trending videos could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [reload])

  /**
   * A button rather than a sentinel, and that is the difference from Home.
   *
   * Home is a ranked feed somebody scrolls through; this is a top list, and a
   * top list that keeps growing as you scroll stops being a top list. A press
   * is also the right shape for a page whose next page is genuinely optional.
   */
  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    fetchTrendingVideos(cursor)
      .then((page) => {
        // The same de-duplication the feed hook does, for the same reason: a
        // ranked list scores a candidate set rather than reading a stable
        // ordered one, so a row can legitimately appear on two pages — and
        // React would then have two children with one key.
        setItems((prev) => {
          const seen = new Set(prev.map((row) => row.id))
          return [...prev, ...page.items.filter((row) => !seen.has(row.id))]
        })
        setCursor(page.nextCursor)
      })
      .catch(() => setError("More trending videos could not be loaded."))
      .finally(() => setLoadingMore(false))
  }, [cursor, loadingMore])

  return (
    <div>
      <PageHeader
        title="Trending"
        lede="The long videos getting the most attention on Momentum right now, for everyone — not ranked for your account."
      />

      {/* Said once, above the grid, rather than per card. See the header. */}
      {!loading && !error && items.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-mo border border-mo bg-mo-surface px-4 py-3">
          <Flame aria-hidden="true" className="h-4 w-4 shrink-0 text-mo-purple" />
          <p className="min-w-0 flex-1 text-sm text-mo-body">
            Trending rows arrive without posters or channel names — open one for the full page.
          </p>
        </div>
      )}

      {loading ? (
        <BrowseSkeleton />
      ) : error && items.length === 0 ? (
        <BrowseError message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyCard
          icon={Flame}
          title="Nothing is trending yet"
          body="Trending is ranked on likes, comments and views over the last few days. It fills up as people watch."
        />
      ) : (
        <>
          <VideoGrid label="Trending videos" items={items} actions={actions} />

          {error && (
            <p role="status" className="mt-4 text-center text-sm text-mo-body">
              {error}
            </p>
          )}

          {cursor ? (
            <p className="py-6 text-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-mo-pill border border-mo-strong px-5 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show more"}
              </button>
            </p>
          ) : (
            <p className="py-8 text-center text-sm text-mo-body">
              {items.length === 1
                ? "That is the only video trending right now."
                : `That is all ${items.length} videos trending right now.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
