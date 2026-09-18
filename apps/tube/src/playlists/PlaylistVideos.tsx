"use client"

/**
 * One playlist's videos, for the two pages that draw them.
 *
 * `/tube/playlists/{id}` and `/tube/watch-later` are the same list with
 * different headings and a different way of finding the id, so the list is
 * here and the two pages are thin. The alternative was a second copy of the
 * two-round-trip hydration below, which is precisely the kind of thing that
 * ends up paging differently on one of them.
 *
 * ── Two round trips, and why there is no third ────────────────────────────
 * `GET /v1/playlists/{id}/items` answers POINTERS —
 * `{playlist_id, post_id, position, added_at}` and nothing else. So:
 *
 *   1. the pointers, ordered by `position` (`orderedPostIds`, ./playlists.ts)
 *   2. `POST /v1/posts/batch` with those ids, which answers a MAP
 *
 * The map loses the order, which is why the order is computed in step 1 and
 * the map is read back through it. There is no third call: the batch rows are
 * `PostDetail` and they DO carry `channel` on long videos, so the card has a
 * name to draw. What they do not carry is `variants`, so there are no posters
 * — the same shortfall every PostDetail surface in this zone has, recorded in
 * full in ../tube/channelApi.ts.
 *
 * ── Rows are NOT paged ────────────────────────────────────────────────────
 * The items route takes no limit and no cursor: it answers a playlist's whole
 * contents. That is fine for a queue and would not be for a channel's back
 * catalogue, which is why nothing else in this zone works this way. The batch
 * is chunked at 100 because post-service rejects — rather than truncates — a
 * bigger one.
 *
 * ── Removing is honest about what it does ─────────────────────────────────
 * `DELETE /v1/playlists/{id}/items/{postId}` takes the video out of THIS list
 * and does nothing to the video, and the button says so. It is optimistic and
 * rolled back, and a 404 counts as success (./api.ts): the row being asked to
 * go is already gone, which is the outcome that was wanted.
 */

import { useCallback, useEffect, useState } from "react"
import { X } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { useCardActions } from "@/menu/useCardActions"
import { VideoGrid } from "@/browse/VideoGrid"
import { BrowseError, BrowseSkeleton, EmptyCard, EMPTY_ACTION } from "@/browse/states"
import { fetchPlaylistItemIds, fetchPostsByIds, removeFromPlaylist } from "./api"

export interface PlaylistVideosProps {
  /** The playlist to draw, or null while the page is still finding it. */
  playlistId: string | null
  /** What an empty playlist should say. Different for a queue and a list. */
  emptyTitle: string
  emptyBody: string
  /** The accessible name of the grid. */
  label: string
}

export function PlaylistVideos({
  playlistId,
  emptyTitle,
  emptyBody,
  label,
}: PlaylistVideosProps) {
  const actions = useCardActions()
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!playlistId) return
    let live = true
    setLoading(true)
    setError(null)
    ;(async () => {
      const ids = await fetchPlaylistItemIds(playlistId)
      const rows = await fetchPostsByIds(ids)
      if (!live) return
      setItems(rows)
      // Pointers whose post the batch did not return: deleted videos, or ones
      // this viewer may no longer see. Counted rather than drawn as gaps, and
      // said out loud below — a playlist quietly one shorter than its own
      // count is a playlist somebody thinks lost a video.
      setMissing(Math.max(0, ids.length - rows.length))
    })()
      .catch(() => {
        if (live) setError("This playlist could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [playlistId, reload])

  const remove = useCallback(
    async (item: FeedItem) => {
      if (!playlistId) return
      const was = items
      setItems((prev) => prev.filter((row) => row.id !== item.id))
      setNotice(null)
      try {
        await removeFromPlaylist(playlistId, item.id)
        setNotice("Removed from this playlist. The video is still on Momentum.")
      } catch {
        setItems(was)
        setNotice("That could not be removed. Nothing was changed.")
      }
    },
    [items, playlistId]
  )

  if (loading) return <BrowseSkeleton />
  if (error) return <BrowseError message={error} onRetry={() => setReload((n) => n + 1)} />

  if (items.length === 0) {
    return (
      <EmptyCard
        title={emptyTitle}
        body={emptyBody}
        action={
          /* Zone-relative and a plain anchor is wrong here — but this is an
             ordinary in-zone destination, so `next/link` would be right and a
             literal "/tube" would double the prefix. An `<a href="/tube">` is
             used deliberately: an empty state's one link is a fresh start, and
             a full document load of the home page is the correct thing for
             "start over" rather than a client transition that keeps this
             page's state alive underneath. The history page's empty state
             makes the same call. */
          <a href="/tube" className={EMPTY_ACTION}>
            Browse videos
          </a>
        }
      />
    )
  }

  return (
    <>
      {notice && (
        <p role="status" className="mb-4 text-sm text-mo-body">
          {notice}
        </p>
      )}

      {missing > 0 && (
        <p className="mb-4 rounded-mo border border-mo bg-mo-surface px-4 py-3 text-sm text-mo-body">
          {missing === 1
            ? "One video in this playlist is no longer available and is not shown."
            : `${missing} videos in this playlist are no longer available and are not shown.`}
        </p>
      )}

      <VideoGrid
        label={label}
        items={items}
        actions={actions}
        footerFor={(item) => (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void remove(item)}
              // The name says which list, because this card looks identical to
              // the one on Home and the button there would mean something
              // else entirely.
              aria-label="Remove from this playlist"
              className="inline-flex items-center gap-1 rounded-mo-pill px-2 py-1 text-xs font-semibold text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        )}
      />
    </>
  )
}
