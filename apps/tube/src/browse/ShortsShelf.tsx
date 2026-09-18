"use client"

/**
 * The Shorts shelf — a window into the reels zone, on Tube's home page.
 *
 * `GET /v1/posts/recent?content_type=flick,reel`, which is PUBLIC: the shelf
 * is there for a signed-out visitor, which is most of the point. A home page
 * that shows an anonymous browser nothing but long video is a home page that
 * hides half the platform from the people most likely to be sampling it.
 *
 * ── Every tile LEAVES Tube, and that is the design ────────────────────────
 * A short is 9:16, it autoplays and it is swiped, and apps/reels is an entire
 * application built for that — with the autoplay coordinator, the dwell
 * tracker and the watch heartbeat a creator is paid on. So each tile is a
 * plain `<a>` to `/reels/{id}` and not a `next/link`: the reels zone is a
 * different Next app behind the shell's rewrite table, and `next/link` would
 * ask for `/tube/reels/{id}`. `reelHref` in ../chrome/links.ts is the one
 * place that path is written.
 *
 * Because they leave, the shelf says so once rather than per tile. A tile that
 * looked like every other tile and then replaced the whole document would be
 * the most surprising control on the page.
 *
 * ── 9:16, and nothing is cropped to 16:9 ──────────────────────────────────
 * The grid below crops everything to 16:9 on purpose (a row of mixed shapes is
 * a staircase). A shorts shelf does the opposite: these ARE portrait, cropping
 * them to landscape throws away the middle of every frame, and the different
 * shape is what tells somebody at a glance that this row is a different kind
 * of thing.
 *
 * ── These rows carry no poster, and the shelf does not pretend ────────────
 * `/v1/posts/recent` sends `PostDetail`: title, counts, `view_count`, and a
 * `media[]` with `duration_ms` and `hls_url`, but no `variants` and no
 * `blurhash`. So a tile is a title on the sunken ground with a duration on it.
 * Verified on the wire and recorded in ../tube/api.ts; stated here so nobody
 * spends an afternoon looking for the missing pictures.
 */

import { useEffect, useState } from "react"
import { Clapperboard } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { BlurhashCanvas } from "@momentum/content"
import { REELS_PATH, reelHref } from "@/chrome/links"
import { fetchShorts } from "@/tube/discoverApi"
import {
  videoBlurhash,
  videoDuration,
  videoMedia,
  videoPoster,
  videoTitle,
  viewsLabel,
} from "@/tube/video"
import { Shelf, ShelfSkeleton } from "./Shelf"

export function ShortsShelf() {
  const [items, setItems] = useState<FeedItem[] | null>(null)

  useEffect(() => {
    let live = true
    fetchShorts()
      .then((rows) => {
        if (live) setItems(rows)
      })
      .catch(() => {
        // An aside that failed is an aside that is not there — the grid below
        // is the page. Same rule as the continue-watching shelf.
        if (live) setItems([])
      })
    return () => {
      live = false
    }
  }, [])

  if (items === null) {
    return (
      <Shelf title="Shorts">
        <ShelfSkeleton count={6} ratio="aspect-[9/16]" width="w-[150px]" />
      </Shelf>
    )
  }

  if (items.length === 0) return null

  return (
    <Shelf
      title="Shorts"
      note="Opens in Momentum Reels."
      allHref={REELS_PATH}
      allExternal
      allLabel="View all"
    >
      {items.map((item) => (
        <ShortTile key={item.id} item={item} />
      ))}
    </Shelf>
  )
}

function ShortTile({ item }: { item: FeedItem }) {
  const media = videoMedia(item)
  const poster = videoPoster(media)
  const blurhash = videoBlurhash(media)
  const duration = videoDuration(media)
  const title = videoTitle(item)

  return (
    <li className="w-[140px] shrink-0 snap-start sm:w-[160px]">
      {/* A plain <a>, because /reels is another zone. See the header. */}
      <a
        href={reelHref(item.id)}
        // The destination is in the name, so a screen-reader user is told they
        // are leaving Tube before they press it rather than after.
        aria-label={`${title} — short, opens in Momentum Reels`}
        className="group block rounded-mo outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-mo bg-mo-sunken">
          {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed, pre-sized URL.
            <img
              src={poster}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            /* No `variants` on this endpoint, so there is genuinely no picture
               — see the header. A glyph is better than an empty well, because
               an empty well reads as a failed image. */
            <span
              aria-hidden="true"
              className="absolute inset-0 grid place-items-center text-mo-body"
            >
              <Clapperboard className="h-6 w-6" />
            </span>
          )}
          {duration && (
            <span
              aria-hidden="true"
              className="absolute bottom-1.5 right-1.5 rounded-mo-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
            >
              {duration}
            </span>
          )}
        </div>
        <h3
          aria-hidden="true"
          className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-mo-ink"
        >
          {title}
        </h3>
      </a>
      <p aria-hidden="true" className="mt-0.5 text-[11px] text-mo-body">
        {viewsLabel(item)}
      </p>
    </li>
  )
}
