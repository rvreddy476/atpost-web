"use client"

/**
 * "Keep watching" — RUTUBE's Watching row, at the top of Home.
 *
 * `GET /v1/videos/continue-watching`, which is a DIFFERENT list from
 * `/v1/videos/history` and it matters which: this one is rows the viewer has
 * not finished, ordered for resuming and capped for a shelf; history is every
 * row including the finished ones, newest first, paged. A shelf built on
 * history would offer to resume videos somebody watched to the end, which is
 * the one thing a "keep watching" row must not do. ../history/api.ts has the
 * same note from the other side.
 *
 * ── It renders NOTHING rather than an empty state ─────────────────────────
 * The only shelf in the app that does, and the reason is what it means to be
 * empty: a new account has watched nothing, and a card saying "you have not
 * started any videos" above a grid of videos to start is advice nobody needs.
 * A shelf is an aside; an aside with nothing to say is absent. The grid below
 * it is the page, and it has its own honest empty state.
 *
 * It also renders nothing while signed out, and never asks: the endpoint is
 * 401 without a session and each 401 drags a failed token refresh behind it
 * (../tube/useTubeFeed.ts records what that costs).
 *
 * ── The tiles are purpose-built rather than VideoCard ─────────────────────
 * A resume tile is a fixed-width thing in a scrolling row with a progress bar
 * across its poster, and `VideoCard` is a grid cell that fills its column and
 * carries a channel line, counts and a menu. Bending one into the other would
 * mean a width prop and three flags, which is how a component stops being
 * about anything. What IS shared is the arithmetic: `resumeLine` and
 * `progressFraction` come from ../history/history.ts, so the sentence here and
 * the bar on the history page cannot disagree about the same row.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "@atpost/api-client/session"
import { BlurhashCanvas } from "@momentum/content"
import { fetchContinueWatching } from "@/tube/discoverApi"
import { progressFraction, resumeLine, type HistoryRow } from "@/history/history"
import {
  creatorName,
  videoBlurhash,
  videoHref,
  videoMedia,
  videoPoster,
  videoTitle,
} from "@/tube/video"
import { Shelf, ShelfSkeleton } from "./Shelf"

export function ContinueWatchingShelf() {
  const session = useSession()
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // "unknown" is the beat before the session has read its own cookie. Not
    // the same as signed out, and firing here would race the refresh.
    if (session.status === "unknown") return
    if (!session.signedIn) {
      setRows(null)
      return
    }
    let live = true
    setLoading(true)
    fetchContinueWatching()
      .then((found) => {
        if (live) setRows(found)
      })
      .catch(() => {
        // A shelf that failed is a shelf that is not there. It is an aside,
        // the grid below is the page, and an error card for an aside would put
        // an apology above the content somebody came for.
        if (live) setRows([])
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [session.signedIn, session.status])

  if (!session.signedIn) return null

  if (loading && rows === null) {
    return (
      <Shelf title="Keep watching">
        <ShelfSkeleton count={5} />
      </Shelf>
    )
  }

  if (!rows || rows.length === 0) return null

  return (
    <Shelf
      title="Keep watching"
      note="Picks up where you stopped."
      // The full list of the same rows, which is exactly what History is.
      allHref="/history"
      allLabel="See history"
    >
      {rows.map((row) => (
        <ResumeTile key={row.post.id} row={row} />
      ))}
    </Shelf>
  )
}

/** One resume tile: a poster, a bar across the bottom of it, and two lines. */
function ResumeTile({ row }: { row: HistoryRow }) {
  const media = videoMedia(row.post)
  const poster = videoPoster(media)
  const blurhash = videoBlurhash(media)
  const percent = Math.round(progressFraction(row) * 100)
  const line = resumeLine(row)

  return (
    <li className="w-[240px] shrink-0 snap-start sm:w-[260px]">
      <Link
        href={videoHref(row.post)}
        // One anchor for the whole tile, and one accessible name that carries
        // the resume position — because "Sunset timelapse" alone would be
        // indistinguishable from the same video in the grid below.
        aria-label={`${videoTitle(row.post)} — ${line}`}
        className="group block rounded-mo outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-mo bg-mo-sunken">
          {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}
          {poster && (
            /* A signed, short-lived, already-sized URL is the case next/image
               is wrong for — the optimizer caches the URL and the cached copy
               outlives the credential inside it. @momentum/content's PostMedia
               has the full argument. */
            // eslint-disable-next-line @next/next/no-img-element -- see above.
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          {/* The bar is decoration HERE — the link's own name says the same
              thing in words, and a progressbar role inside an anchor would be
              announced as a second, nameless thing. The history page draws the
              real `role="progressbar"`, where it is not inside a link. */}
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1 bg-black/60"
          >
            <span className="block h-full bg-mo-cyan" style={{ width: `${percent}%` }} />
          </span>
        </div>
        <h3
          aria-hidden="true"
          className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-mo-ink"
        >
          {videoTitle(row.post)}
        </h3>
      </Link>
      <p aria-hidden="true" className="mt-1 truncate text-xs text-mo-body">
        {creatorName(row.post)}
      </p>
      <p aria-hidden="true" className="text-xs text-mo-body">
        {line}
      </p>
    </li>
  )
}
