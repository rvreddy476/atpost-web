"use client"

/**
 * One cell of the browse grid: a poster, and the way in.
 *
 * ── One anchor, and everything inside it is decoration ────────────────────
 * The founder asked for "an expand option for reels", and the obvious build —
 * a picture that links to the reel, with an Expand BUTTON on top of it — puts
 * a control inside a control. Browsers disagree about what a click on the
 * inner one does, screen readers disagree about how to announce it, and the
 * keyboard gets two tab stops for one act. On a page of a hundred reels that
 * is two hundred tab stops to cross.
 *
 * So the whole tile is the anchor. The Expand pill is real, visible and
 * `aria-hidden` — it says what the tile does to somebody looking at it, while
 * `tileLabel` says the same thing to somebody listening. One control, one tab
 * stop, one accessible name, and the affordance still on screen.
 *
 * The pill does not appear only on hover, either. A hover-revealed control is
 * invisible on every touch device, and this is the page's primary action.
 *
 * ── The link is `next/link`, and this is the one place that is safe ───────
 * Everything the chrome links to is another ZONE and must be a plain `<a>`
 * (see @momentum/chrome's NavItem.tsx and zone.ts). This is the opposite case:
 * `/reels/{id}` is served by this very app, so a client-side transition is
 * both correct and the reason expanding feels instant — the browse page's
 * layout, the chrome and the session all stay mounted.
 *
 * `reelHref` returns "/{id}" and NOT "/reels/{id}" because Next adds the
 * basePath itself. ./tile.ts has the note and a test.
 *
 * ── Contrast, over somebody else's video frame ────────────────────────────
 * The same constraint Reel.tsx is built around, and the same answer: nothing
 * on the picture relies on the palette's measurements, because those are all
 * against Momentum's violet-black ground and none of them apply to a frame of
 * a white kitchen. Every mark here is white inside a scrim, or on an opaque
 * plate. The Expand pill is `bg-black/60` with white type for exactly the
 * reason Reel.tsx's follow plate is: a hairline and a tinted label vanish into
 * a bright frame.
 */

import { useState } from "react"
import Link from "next/link"
import { Maximize2, Heart, MessageCircle } from "lucide-react"
import type { FeedItem } from "@atpost/types/feed"
import { BlurhashCanvas } from "@momentum/content"
import {
  reelHref,
  tileAuthor,
  tileBlurhash,
  tileComments,
  tileDuration,
  tileLabel,
  tileLikes,
  tileMedia,
  tilePoster,
} from "./tile"

export function ReelTile({
  item,
  position,
  total,
}: {
  item: FeedItem
  /** 1-based rank, for the accessible name only. */
  position: number
  total: number
}) {
  const media = tileMedia(item)
  const blurhash = tileBlurhash(media)
  const [posterFailed, setPosterFailed] = useState(false)

  // Read once per render rather than held in state: a signature that expires
  // while the page is open turns this null on the next render, and the
  // blurhash underneath is already the right thing to be looking at.
  const poster = posterFailed ? null : tilePoster(media)

  const duration = tileDuration(media)
  const likes = tileLikes(item)
  const comments = tileComments(item)

  return (
    <li>
      <Link
        href={reelHref(item)}
        aria-label={tileLabel(item, position, total)}
        className={[
          // 9:16 whatever the source is. Two of this account's four reels are
          // 1920x1080 — a landscape "flick" is a real thing this feed
          // contains — and `object-cover` crops them to the grid rather than
          // letting one row of tiles be a different height from the next.
          "group relative block aspect-[9/16] w-full overflow-hidden rounded-mo bg-mo-sunken",
          "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
        ].join(" ")}
      >
        {blurhash && <BlurhashCanvas hash={blurhash} className="h-full w-full" />}

        {poster && (
          /* A signed, 300-second, already-sized URL is exactly the case
             next/image is wrong for: the optimizer caches the URL server-side,
             the cached copy outlives the credential inside it, and it then
             serves an error for a picture it can no longer re-fetch.
             @momentum/content's PostMedia has the full argument at its head. */
          // eslint-disable-next-line @next/next/no-img-element -- see above.
          <img
            src={poster}
            // Decoration. The link's own `aria-label` is the accessible name
            // for this whole cell, and an alt here would be announced twice.
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
            // The commonest cause is a signature that expired between the
            // fetch and the paint. There is nothing to repair — the next page
            // of reels will carry fresh URLs — so it falls back to the
            // blurhash rather than leaving a broken-image glyph in the grid.
            onError={() => setPosterFailed(true)}
          />
        )}

        {/* Top scrim for the duration, bottom scrim for the author and counts.
            On the page rather than on the text, so the padding is covered too:
            a descender falling outside the dark area is as unreadable as no
            scrim at all. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-black/55 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent to-black/75"
        />

        {duration && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 rounded-mo-sm bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white"
          >
            {duration}
          </span>
        )}

        {/* The expand affordance. Always present, brighter under the pointer
            and under keyboard focus — `group-focus-visible` and not `:focus`,
            so a mouse click does not leave the tile lit up behind the
            transition. */}
        <span
          aria-hidden
          className={[
            "absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-mo-pill",
            "bg-black/60 px-2 py-1 text-[11px] font-semibold text-white",
            "transition-colors duration-150 ease-mo",
            "group-hover:bg-black/80 group-focus-visible:bg-black/80",
          ].join(" ")}
        >
          <Maximize2 className="h-3 w-3" />
          Expand
        </span>

        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-2"
        >
          <span className="truncate text-[12px] font-semibold text-white drop-shadow">
            {tileAuthor(item)}
          </span>
          {(likes || comments) && (
            <span className="flex items-center gap-3 text-[11px] font-semibold text-white/90">
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
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}
