"use client"

/**
 * One cell of the browse grid: a poster, a title, and the way in.
 *
 * ── One anchor, and everything inside it is decoration ────────────────────
 * The whole card is the link. The obvious build — a picture that links, with a
 * "Watch" BUTTON on top of it and the channel name as a second link to a
 * channel page — puts a control inside a control, and browsers disagree about
 * what a click on the inner one does, screen readers disagree about how to
 * announce it, and the keyboard gets three tab stops for one act. So there is
 * one anchor per video, every mark inside it is `aria-hidden`, and `cardLabel`
 * in ../tube/video.ts is what a screen reader announces. (The channel name
 * will want to be its own link on the day there is a channel page to send it
 * to. `GET /v1/channels/{handle}` exists; the page does not.)
 *
 * ── Zero video elements mount here, and that is the design ────────────────
 * A poster is one image request. A 720p long-video segment set is tens of
 * megabytes, and these are 3-minute videos rather than 30-second ones — the
 * whole point of the "expand for the full video" split is that the grid is the
 * cheap surface. If each card were a player, twelve cards would attach hls.js,
 * fetch a master playlist, fetch a child playlist and start buffering, for
 * content nobody has chosen. That is measured behaviour rather than a worry:
 * apps/reels' Reel.tsx records "a page of twelve was observed with four reels
 * all at readyState 4 before anybody had swiped once."
 *
 * Which is also why this page needs no `viewportInset`. The inset exists so
 * the autoplay coordinator and the dwell tracker do not credit pixels hidden
 * behind sticky chrome — and with no coordinator and no watch measurement on
 * this surface there is no number for a wrong inset to corrupt.
 *
 * The alternative considered and rejected: play the hovered card. It is one
 * player rather than twelve, but it costs a real inset, a keyboard story for
 * what "focused" means on a grid, and a video that starts on a mouse passing
 * over it — and it buys a preview of something one click away from playing
 * properly anyway.
 *
 * ── The link is `next/link`, and this is the one place that is safe ───────
 * Everything the chrome links to is another ZONE and must be a plain `<a>`
 * (see @momentum/chrome's NavItem.tsx and zone.ts). This is the opposite case:
 * `/tube/{id}` is served by this very app, so a client-side transition is both
 * correct and the reason opening a video feels instant — the browse page's
 * layout, the chrome and the session all stay mounted.
 *
 * `videoHref` returns "/{id}" and NOT "/tube/{id}" because Next adds the
 * basePath itself. ../tube/video.ts has the note and a test.
 */

import { useState } from "react"
import Link from "next/link"
import { Heart, MessageCircle, VideoOff } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { BlurhashCanvas, relativeTime } from "@momentum/content"
import {
  cardLabel,
  commentsLabel,
  creatorName,
  isWatchable,
  likesLabel,
  videoBlurhash,
  videoDuration,
  videoHref,
  videoMedia,
  videoPoster,
  videoTitle,
  viewsLabel,
} from "@/tube/video"

export function VideoCard({
  item,
  position,
  total,
}: {
  item: FeedItem
  /** 1-based rank, for the accessible name only. */
  position: number
  total: number
}) {
  const media = videoMedia(item)
  const blurhash = videoBlurhash(media)
  const [posterFailed, setPosterFailed] = useState(false)

  // Read once per render rather than held in state: a signature that expires
  // while the page is open turns this null on the next render, and the
  // blurhash underneath is already the right thing to be looking at.
  const poster = posterFailed ? null : videoPoster(media)

  const duration = videoDuration(media)
  const likes = likesLabel(item)
  const comments = commentsLabel(item)
  const watchable = isWatchable(item)

  return (
    <li>
      <Link
        href={videoHref(item)}
        aria-label={cardLabel(item, position, total)}
        className={[
          "group block rounded-mo",
          "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
        ].join(" ")}
      >
        {/* 16:9 whatever the source is, and that is a real decision rather
            than a default. `postclassify.Classify` sends every LANDSCAPE clip
            to long_video regardless of length, and lets an author mark a
            portrait one long_video explicitly — so this feed genuinely mixes
            1080x1920 and 1920x1080. `object-cover` crops both to one shape so
            a row of cards is a row, not a staircase. */}
        <div className="relative aspect-video w-full overflow-hidden rounded-mo bg-mo-sunken">
          {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}

          {poster && (
            /* A signed, 300-second, already-sized URL is exactly the case
               next/image is wrong for: the optimizer caches the URL
               server-side, the cached copy outlives the credential inside it,
               and it then serves an error for a picture it can no longer
               re-fetch. @momentum/content's PostMedia has the full argument. */
            // eslint-disable-next-line @next/next/no-img-element -- see above.
            <img
              src={poster}
              // Decoration. The link's own `aria-label` is the accessible name
              // for this whole cell, and an alt here would be announced twice.
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 ease-mo group-hover:scale-[1.02]"
              // The commonest cause is a signature that expired between the
              // fetch and the paint. There is nothing to repair — the next
              // page carries fresh URLs — so it falls back to the blurhash
              // rather than leaving a broken-image glyph in the grid.
              onError={() => setPosterFailed(true)}
            />
          )}

          {/* A long_video with no media at all is a real row on this feed —
              two of the six the dev stack returns. It is NOT dropped from the
              grid: somebody's own video vanishing with nothing on screen to
              say why is worse than a plate that says so. The card still opens,
              because the watch page has room for the sentence and this does
              not. ../tube/video.ts has the whole argument. */}
          {!watchable && (
            <span
              aria-hidden
              className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-mo-sunken/80 text-mo-body"
            >
              <VideoOff className="h-6 w-6" />
              <span className="text-[11px] font-semibold">No video attached</span>
            </span>
          )}

          {duration && (
            <span
              aria-hidden
              className="absolute bottom-1.5 right-1.5 rounded-mo-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
            >
              {duration}
            </span>
          )}
        </div>

        {/* The title block sits UNDER the picture rather than in a scrim over
            it, which is the one real difference from the reels tile. A reel's
            caption is incidental to a 9:16 frame; a long video's title is the
            thing being chosen between, it is up to 100 characters, and two
            lines of it over somebody's video frame is unreadable however dark
            the scrim. Text on the page's own ground also means the palette's
            contrast measurements actually apply to it. */}
        <div aria-hidden className="mt-2">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-mo-ink">
            {videoTitle(item)}
          </h3>
          <p className="mt-1 truncate text-sm text-mo-body">{creatorName(item)}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-mo-body">
            <span>{viewsLabel(item)}</span>
            <span aria-hidden>·</span>
            <span>{relativeTime(item.created_at)}</span>
            {/* Counts and NOT buttons. Like, save, share and follow all live
                one click away on the watch page, where the state machines, the
                optimistic rollbacks and the analytics already are. A second
                set here would be a second implementation of each. */}
            {likes && (
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" />
                <span className="tabular-nums">{likes}</span>
              </span>
            )}
            {comments && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                <span className="tabular-nums">{comments}</span>
              </span>
            )}
          </p>
        </div>
      </Link>
    </li>
  )
}
