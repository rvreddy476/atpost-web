"use client"

/**
 * One short in a channel's Shorts tab — 9:16, and a door out of Tube.
 *
 * ── Why this is not `../browse/VideoCard.tsx` with a ratio prop ───────────
 * The two differ in more than their aspect. That card is a `next/link` to
 * `/tube/{id}`, it carries a channel line, a menu and a counts row, and it
 * crops everything to 16:9 so a row of mixed shapes is a row rather than a
 * staircase. A short is none of that here:
 *
 *   · IT LEAVES. A short is 9:16, it autoplays and it is swiped, and
 *     apps/reels is an entire application built for that — the autoplay
 *     coordinator, the dwell tracker and the watch heartbeat a creator is
 *     paid on all live there. So a tile is a plain `<a>` to `/reels/{id}`.
 *     `next/link` would ask for `/tube/reels/{id}`, because Next adds this
 *     zone's basePath to every href it is given.
 *   · IT IS NOT CROPPED. Cropping a portrait frame to 16:9 throws away the
 *     middle of every short, and the different shape is the thing that tells
 *     somebody at a glance that this tab holds a different kind of video.
 *
 * Adding a `ratio` and an `external` prop to the shared card to express that
 * would be two new branches in a file four other surfaces depend on, to
 * produce a component that shares almost none of its body with the original.
 * ../browse/ShortsShelf.tsx reached the same conclusion for the home page's
 * shelf and drew its own tile; this is that tile in a grid instead of a rail.
 *
 * ── These rows carry no poster, and this does not pretend they do ─────────
 * `/v1/posts/by-author` sends bare `PostDetail`: `media[]` with `media_id`,
 * `kind`, `duration_ms` and `hls_url`, and no `variants` and no `blurhash`.
 * So most tiles are a glyph on the sunken ground with a duration on them, and
 * the poster branch below is there for the day the endpoint hydrates. A glyph
 * beats an empty well, which reads as an image that failed.
 */

import { Clapperboard } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { BlurhashCanvas } from "@momentum/content"
import { reelHref } from "@/chrome/links"
import {
  videoBlurhash,
  videoDuration,
  videoMedia,
  videoPoster,
  videoTitle,
  viewsLabel,
} from "@/tube/video"
import { visibilityBadge } from "./visibility"

/**
 * The Shorts grid.
 *
 * Denser than ../browse/grid.ts's video grid on purpose: a 9:16 cell at the
 * video grid's ~300px width would be 530px tall, so two rows would be a
 * scroll of its own and a tab of forty shorts would be unnavigable. The floor
 * here is ~150px wide, which is where a portrait frame still reads as a frame
 * and a two-line title still fits — the same threshold ../browse/ShortsShelf
 * .tsx picked for its rail, so a short is the same size wherever Tube draws one.
 */
export const SHORTS_GRID =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"

export function ShortCard({
  item,
  /** Draw "Unlisted" / "Private"? True only on the viewer's own channel. */
  showVisibility = false,
}: {
  item: FeedItem
  showVisibility?: boolean
}) {
  const media = videoMedia(item)
  const poster = videoPoster(media)
  const blurhash = videoBlurhash(media)
  const duration = videoDuration(media)
  const title = videoTitle(item)
  const badge = showVisibility ? visibilityBadge(item.visibility) : null

  return (
    <li>
      {/* A plain <a>, because /reels is another zone. See the header. */}
      <a
        href={reelHref(item.id)}
        // The destination is in the NAME, so a screen-reader user is told they
        // are leaving Tube before they press it rather than after. The
        // visibility, where there is one, is in the name for the same reason:
        // the chip over the poster is `aria-hidden`.
        aria-label={[
          title,
          badge ? badge.description : null,
          `${viewsLabel(item)}`,
          "short, opens in Momentum Reels",
        ]
          .filter(Boolean)
          .join(" — ")}
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
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 ease-mo group-hover:scale-[1.02]"
            />
          ) : (
            <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-mo-body">
              <Clapperboard className="h-6 w-6" />
            </span>
          )}

          {badge && (
            <span
              aria-hidden="true"
              className="absolute left-1.5 top-1.5 rounded-mo-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            >
              {badge.label}
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

        <div aria-hidden="true" className="mt-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-mo-ink">{title}</h3>
          <p className="mt-0.5 text-xs text-mo-body">{viewsLabel(item)}</p>
        </div>
      </a>
    </li>
  )
}
