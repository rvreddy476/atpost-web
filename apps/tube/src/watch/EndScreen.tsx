"use client"

/**
 * What the player shows once the video has ended and nothing is counting
 * down: Replay, the next episode if there is one, and a few of the rail's
 * recommendations, as things to click rather than things that happen.
 *
 * ── After the last episode, nothing starts by itself ──────────────────────
 * The founder's rule, and the reason this component exists separately from
 * the countdown. A series has an order and the countdown follows it; the end
 * of a series, or of a video in no series, has no order to follow, and a page
 * that picked one from the recommendations would be playing a guess with
 * sound on. So this offers, and offers only what is already on the page.
 *
 * ── No new request ────────────────────────────────────────────────────────
 * The tiles are the first four rows of `useRelated`'s data, which the rail
 * beside the player fetched when the page opened. A second fetch for the same
 * list, ranked again, would draw four videos here that disagree with the
 * twelve on the right, and the person would be looking at two different
 * answers to "what next" at once.
 *
 * ── The top of the frame, so an authored end screen stays reachable ───────
 * `video_end_screens` rows, when a creator has written any, are drawn by
 * ./Overlays.tsx inside `top-0 bottom-16`, anywhere the author placed them.
 * This container takes the top 70% of the frame with `pointer-events-none`
 * and only the tiles themselves take events back, so an authored tile that
 * sits in a gap between these is still clickable, and the transport along the
 * bottom is never underneath anything here.
 */

import Link from "next/link"
import { Play, RotateCcw, SkipForward } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { BlurhashCanvas } from "@momentum/content"
import { videoBlurhash, videoMedia, videoPoster, videoTitle } from "@/tube/video"
import type { AutoplayTarget } from "./autoplayNext"
import { watchHref } from "./links"

/** How many recommendations fit without covering the picture. YouTube's number. */
export const END_SCREEN_TILES = 4

export interface EndScreenProps {
  related: FeedItem[]
  /** The next episode, offered as a button when the countdown is not running. */
  next: AutoplayTarget | null
  onReplay: () => void
}

export function EndScreen({ related, next, onReplay }: EndScreenProps) {
  const tiles = related.slice(0, END_SCREEN_TILES)

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[70%] flex-col items-center justify-center gap-3 p-4"
      role="group"
      aria-label="The video has ended"
    >
      <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex items-center gap-1.5 rounded-mo-pill bg-white px-4 py-1.5 text-[13px] font-semibold text-black transition-colors duration-150 ease-mo hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          Replay
        </button>
        {next && (
          <Link
            href={watchHref(next.post_id)}
            className="inline-flex items-center gap-1.5 rounded-mo-pill border border-white/40 bg-black/60 px-4 py-1.5 text-[13px] font-semibold text-white transition-colors duration-150 ease-mo hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <SkipForward aria-hidden className="h-4 w-4" />
            <span className="min-w-0 truncate">
              Next episode{next.title?.trim() ? `: ${next.title.trim()}` : ` ${next.episode_num}`}
            </span>
          </Link>
        )}
      </div>

      {tiles.length > 0 && (
        <ul className="pointer-events-auto grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((item) => (
            <li key={item.id} className="min-w-0">
              <EndScreenTile item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * One recommendation, as a poster with a title.
 *
 * The same poster discipline as the rail's row: a plain `<img>` because the
 * URLs are signed and short-lived and next/image would cache a credential
 * past its expiry; the blurhash underneath so an expired signature degrades
 * to a soft frame rather than a broken-image glyph.
 */
function EndScreenTile({ item }: { item: FeedItem }) {
  const media = videoMedia(item)
  const poster = videoPoster(media)
  const blurhash = videoBlurhash(media)
  const title = videoTitle(item)

  return (
    <Link
      href={watchHref(item.id)}
      aria-label={`Watch next: ${title}`}
      className="group block overflow-hidden rounded-mo bg-black/70 shadow-mo backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
    >
      <div aria-hidden className="relative aspect-video w-full overflow-hidden bg-mo-sunken">
        {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL; see above.
          <img
            src={poster}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity duration-150 ease-mo group-hover:opacity-100 group-focus-visible:opacity-100">
          <Play className="h-6 w-6 text-white" />
        </span>
      </div>
      <p aria-hidden className="line-clamp-2 px-2 py-1.5 text-[12px] font-semibold leading-snug text-white">
        {title}
      </p>
    </Link>
  )
}
