"use client"

/**
 * `/tube/your-videos` — the viewer's own long videos.
 *
 * `GET /v1/uploads/videos`, which is keyed on the caller's `X-User-Id` and
 * answers an EMPTY LIST — not a 403, not a 404 — for somebody who has never
 * published.
 *
 * ── This is why the rail row changed ──────────────────────────────────────
 * "Your videos" used to point at `/@{handle}`, the viewer's own channel page,
 * and stayed `aria-disabled` with "you have not created a channel yet" until
 * `GET /v1/channels/me` answered. That was a true sentence about a different
 * noun, and it had two costs: an account with no channel could not open the
 * row at all, and an account WITH one landed on its public channel page —
 * which shows what everybody else sees and hides a video that is still
 * processing. This page shows what the author has, including the processing
 * ones, because `GetMyVideos` does not hide a still-processing video from its
 * own author. ../chrome/rail.ts records the change.
 *
 * ── The rows are the best-hydrated PostDetail in the zone ─────────────────
 * `GetMyVideos` runs the media-state overlay AND `attachChannelRefs`, so a row
 * carries counts, `duration_ms`, `hls_url`, the live processing status and the
 * channel. It still carries no `variants`, so there is still no poster — the
 * standing shortfall of every PostDetail surface here, recorded in full in
 * ../tube/channelApi.ts. The channel line is HIDDEN anyway: this page is about
 * one creator and it is the person reading it, so a row of their own name
 * under each card says nothing.
 *
 * ── There is no Delete here, and that is deliberate ───────────────────────
 * `DELETE /v1/uploads/{postId}` is real and it is not wired. Deleting a
 * published video is the most destructive act a creator has, it is soft-delete
 * plus a "Recently deleted" restore window on the server, and a page with no
 * way to see or restore that window would be offering half a feature. The
 * studio is where publishing lives and where the other half belongs. Flagged
 * in the handover rather than half-built.
 */

import { useCallback, useEffect, useState } from "react"
import { Video } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { useSession } from "@atpost/api-client/session"
import { useCardActions } from "@/menu/useCardActions"
import { fetchMyVideos } from "@/tube/discoverApi"
import { VideoGrid } from "@/browse/VideoGrid"
import {
  BrowseError,
  BrowseSkeleton,
  EmptyCard,
  EMPTY_ACTION,
  PageHeader,
  SignInCard,
} from "@/browse/states"

export function TubeYourVideos() {
  const session = useSession()
  const actions = useCardActions()

  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (session.status === "unknown") return
    if (!session.signedIn) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError(null)
    fetchMyVideos()
      .then((page) => {
        if (!live) return
        setItems(page.items)
        setCursor(page.nextCursor)
      })
      .catch(() => {
        if (live) setError("Your videos could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [session.signedIn, session.status, reload])

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    fetchMyVideos(cursor)
      .then((page) => {
        setItems((prev) => {
          const seen = new Set(prev.map((row) => row.id))
          return [...prev, ...page.items.filter((row) => !seen.has(row.id))]
        })
        setCursor(page.nextCursor)
      })
      .catch(() => setError("More of your videos could not be loaded."))
      .finally(() => setLoadingMore(false))
  }, [cursor, loadingMore])

  if (session.signedOut) {
    return (
      <div>
        <PageHeader title="Your videos" />
        <SignInCard
          what="Sign in to see your videos"
          why="This is the list of what you have published, which needs to know who you are."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Your videos"
        lede="Everything you have published to Momentum Tube, newest first — including anything still processing."
      />

      {loading ? (
        <BrowseSkeleton />
      ) : error && items.length === 0 ? (
        <BrowseError message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyCard
          icon={Video}
          title="You have not published a video yet"
          body="The studio takes a file, a title and a category, and makes the channel for you if you do not have one."
          action={
            <a href="/tube/upload" className={EMPTY_ACTION}>
              Upload a video
            </a>
          }
        />
      ) : (
        <>
          {/* `hideCreator`: this page is about one creator and it is the
              person reading it. A row of their own name under every card is
              the page's heading repeated twelve times. */}
          <VideoGrid label="Your videos" items={items} actions={actions} hideCreator />

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
                ? "That is the only video you have published."
                : `That is all ${items.length} videos you have published.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
