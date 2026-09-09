"use client"

/**
 * The recommendations rail — what plays after this.
 *
 * ── Not one `<video>` mounts here, and that is the design ─────────────────
 * The same rule the browse grid keeps, for the same measured reason: twelve
 * players would each attach hls.js, fetch a master playlist, fetch a child
 * playlist and start buffering, for content nobody has chosen — and here they
 * would do it BESIDE a video somebody IS watching, competing with it for
 * bandwidth and for decoders. A poster is one image request. apps/reels
 * recorded "a page of twelve was observed with four reels all at readyState 4
 * before anybody had swiped once"; this rail must never be that.
 *
 * ── One anchor per row, everything inside it decoration ───────────────────
 * A row is a picture, a title, a channel and a view count, and it is ONE act:
 * watch this. Making the channel its own link inside the row's link nests a
 * control in a control — which browsers disagree about, screen readers announce
 * twice, and the keyboard gives two tab stops for one thing. So the channel is
 * text here and is a real link in the channel row under the player, where it is
 * not inside anything.
 *
 * ── `next/link`, because these are the same zone ──────────────────────────
 * Everything the chrome links to is another zone and must be a plain `<a>`.
 * These are `/tube/{id}`, so a client navigation is right — and it is what
 * makes going from one video to the next feel like a player rather than a
 * document.
 */

import { useState } from "react"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { BlurhashCanvas } from "@momentum/content"
import {
  cardLabel,
  creatorName,
  videoBlurhash,
  videoDuration,
  videoMedia,
  videoPoster,
  videoTitle,
  viewsLabel,
} from "@/tube/video"
import { watchHref } from "./links"

export interface RelatedProps {
  items: FeedItem[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  ended: boolean
  onLoadMore: () => void
  onRetry: () => void
  /** Rendered as the rail's heading. */
  headingId: string
}

export function Related({
  items,
  loading,
  loadingMore,
  error,
  ended,
  onLoadMore,
  onRetry,
  headingId,
}: RelatedProps) {
  return (
    <section aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="font-mo-display text-sm font-semibold tracking-mo-display text-mo-ink"
      >
        Next videos
      </h2>

      {loading && items.length === 0 && <RelatedSkeleton />}

      {error && items.length === 0 && (
        <div role="alert" className="mt-3">
          <p className="text-sm text-mo-body">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-mo-pill border border-mo-strong px-3 py-1 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
          >
            <RefreshCw aria-hidden className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="mt-3 text-sm text-mo-body">Nothing related to show yet.</p>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item, index) => (
          <li key={item.id}>
            <RelatedRow item={item} position={index + 1} total={items.length} />
          </li>
        ))}
      </ul>

      {items.length > 0 && !ended && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-mo-pill border border-mo-strong px-3 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Show more"}
        </button>
      )}
    </section>
  )
}

function RelatedRow({
  item,
  position,
  total,
}: {
  item: FeedItem
  position: number
  total: number
}) {
  const media = videoMedia(item)
  const poster = videoPoster(media)
  const blurhash = videoBlurhash(media)
  const duration = videoDuration(media)
  const [posterFailed, setPosterFailed] = useState(false)

  return (
    <Link
      href={watchHref(item.id)}
      aria-label={cardLabel(item, position, total)}
      className="group flex gap-3 rounded-mo p-1 transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
    >
      <div
        aria-hidden
        className="relative aspect-video w-[168px] shrink-0 overflow-hidden rounded-mo bg-mo-sunken"
      >
        {/* The blurhash sits UNDER the poster rather than instead of it, so the
            frame is soft while the image decodes rather than black — and stays
            soft rather than empty when the signed variant URL has expired. */}
        {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}
        {poster && !posterFailed && (
          /* `<img>` and not next/image, for the reason the browse grid's card
             carries in full: these are signed 300-second URLs, the optimizer
             caches them server-side, and the cached copy outlives the
             credential inside it — so next/image serves an error for a picture
             it can no longer re-fetch. */
          // eslint-disable-next-line @next/next/no-img-element -- see above.
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            // Almost always a signature that expired between the fetch and the
            // paint. Fall back to the blurhash rather than a broken-image glyph.
            onError={() => setPosterFailed(true)}
          />
        )}
        {duration && (
          <span className="absolute bottom-1 right-1 rounded-[4px] bg-black/75 px-1 py-0.5 text-[11px] font-semibold tabular-nums text-white">
            {duration}
          </span>
        )}
      </div>

      <div aria-hidden className="min-w-0 flex-1">
        {/* Two lines, then an ellipsis. A long-video title is up to 100
            characters and three of them wrapped to four lines each turns a rail
            into a wall of text with no pictures visible. */}
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-mo-ink">
          {videoTitle(item)}
        </p>
        <p className="mt-1 truncate text-xs text-mo-body">{creatorName(item)}</p>
        <p className="mt-0.5 text-xs text-mo-body">{viewsLabel(item)}</p>
      </div>
    </Link>
  )
}

/**
 * The rail's own skeleton — poster-shaped, at the rail's real row height.
 *
 * Three rows rather than twelve: it reserves enough that the page does not jump
 * when the first rows land, without pretending to know how many are coming.
 */
function RelatedSkeleton() {
  return (
    <div aria-hidden className="mt-3 flex animate-pulse flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <div className="aspect-video w-[168px] shrink-0 rounded-mo bg-mo-raised" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-full rounded bg-mo-raised" />
            <div className="mt-2 h-3 w-3/5 rounded bg-mo-raised" />
            <div className="mt-2 h-3 w-2/5 rounded bg-mo-raised" />
          </div>
        </div>
      ))}
    </div>
  )
}
