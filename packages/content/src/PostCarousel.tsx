"use client"

/**
 * A post's media, as an ordered swipeable carousel.
 *
 * This is the web half of the decision already taken on Android
 * (core/ui/PostCard.kt, `PostMediaCarousel`): several photographs are ONE
 * frame you move through, not a column you scroll past. Stacking them
 * vertically — which is what this feed did before — turns a five-photo post
 * into five screens of scrolling, buries the caption and the action bar below
 * the fold, and makes the fifth picture as prominent as the first, which is
 * not what the person who posted it meant.
 *
 * ── What is copied from the Android version, and why ──────────────────────
 *   · the "2/5" pill, top-right, INSIDE the frame
 *   · the position pips, bottom-centre, INSIDE the frame
 * Both sit over the media rather than under it so the card is exactly as tall
 * with a carousel as with a single picture. A pill in a strip above the frame
 * would make every multi-photo post 28px taller than its neighbours for no
 * reason a reader could name.
 *
 * ── What is NOT copied ────────────────────────────────────────────────────
 * This is not a port of a HorizontalPager. A pager is the right abstraction on
 * a touch-only surface; on the web the browser already has one — a scroll
 * container with snap points — and it arrives with momentum, trackpads, a
 * scrollbar for a mouse, RTL, and the platform's own physics for free. So the
 * scroller IS the pager, and this file adds only what the browser does not
 * give: which page is showing (measured, never remembered), a mouse DRAG
 * (desktop pointers do not swipe), arrow keys, and the two overlays.
 *
 * ── Autoplay: two conditions, both required ───────────────────────────────
 * A post being the item the coordinator chose and a page being the one in view
 * are different questions. `isPageActive` is where they meet and it is the
 * only place a page is told it may play. See carousel.ts.
 *
 * ── Impressions are untouched by all of this ──────────────────────────────
 * An impression is per POST. The dwell tracker registers the card's <article>
 * and measures vertical visibility; swiping sideways neither unmounts it nor
 * changes its intersection with the viewport, so five photographs remain one
 * impression. Nothing in this file registers anything with a tracker, and it
 * must stay that way — a per-page impression would multiply every carousel
 * author's reach by however many pictures they attached.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import type { WatchEvent, WatchSessionInfo } from "@momentum/player"
import { MediaFrame, PostMedia } from "./PostMedia"
import { formatDuration } from "./relativeTime"
import { aspectRatio } from "./variants"
import {
  carouselLabel,
  dragTarget,
  isPageActive,
  isPageRendered,
  keyTarget,
  pageFromScroll,
  pillLabel,
  slideLabel,
} from "./carousel"

export interface PostCarouselProps {
  item: FeedItem
  /** Every attachment, already in position order. Two or more. */
  media: FeedMedia[]
  /** The coordinator's answer for the POST. Never for a page. */
  active: boolean
  muted: boolean
  onToggleMuted?: () => void
  /**
   * The watch session the zone minted for this post, and where to send what
   * it measures. Both are handed to ONE page — see `sessionPageId`.
   */
  session?: WatchSessionInfo
  onWatchEvent?: (event: WatchEvent) => void
  /**
   * Which page the session above belongs to: the post's primary video, the
   * one `sessionFor` measured the duration of.
   *
   * A post can carry two videos, and a session carries `contentDurationMs`.
   * Handing the first video's session to the second would compute
   * `percent_viewed` against the wrong duration and pay a creator for a
   * fraction of a video nobody watched — so the second video PLAYS when you
   * swipe to it and is not measured, rather than measured wrongly. Making it
   * measurable is a change to `sessionFor` in the zone (a session per media
   * rather than per post) and belongs there, not here.
   */
  sessionPageId?: string
  onStale?: (postId: string) => void
  resolveUrl?: (url: string) => string
}

/** Distance a pointer may wander before a click is treated as a drag. */
const CLICK_SLOP_PX = 5

/**
 * How long after the last scroll event to take one more look, in ms.
 *
 * The same 150 the autoplay coordinator uses, and for the same reason: a snap
 * animation, a fling's momentum or a smooth `scrollTo` comes to rest between
 * two frames, and the resting position is the one that decides which page may
 * play. Re-armed by every scroll event, so it costs nothing while moving.
 */
const SETTLE_MS = 150

export function PostCarousel({
  item,
  media,
  active,
  muted,
  onToggleMuted,
  session,
  onWatchEvent,
  sessionPageId,
  onStale,
  resolveUrl,
}: PostCarouselProps) {
  const count = media.length
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [page, setPage] = useState(0)

  /**
   * The page index, readable from an event handler without making every
   * handler depend on it. Same reasoning as `activeIdRef` in the autoplay
   * coordinator: a handler rebuilt on every page change is a handler React
   * re-attaches on every page change.
   */
  const pageRef = useRef(0)
  const setCurrent = useCallback((next: number) => {
    pageRef.current = next
    setPage((prev) => (prev === next ? prev : next))
  }, [])

  /**
   * ONE shape for the whole post, taken from the first page.
   *
   * Instagram's carousel and Android's `PostMediaFrame` both do this, and the
   * reason is mechanical rather than aesthetic: a track whose pages have
   * different heights changes the card's height as you swipe, which moves the
   * action bar under the reader's cursor and shifts every post below it. The
   * first page is the one the author chose to lead with, so it decides.
   */
  const frameRatio = useMemo(() => aspectRatio(media[0] ?? {}), [media])

  /* ── Which page is showing ────────────────────────────────────────────── */

  /**
   * Measured from the scroller, at the moment of the decision.
   *
   * Not remembered from an IntersectionObserver callback — the correction the
   * autoplay coordinator's header spells out applies here for the same reason.
   * A snap container can settle between two callbacks, and a stale index would
   * leave the pill disagreeing with the picture and, far worse, tell a page
   * that is no longer in view that it may keep playing.
   */
  const measure = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    setCurrent(pageFromScroll(el.scrollLeft, el.clientWidth, count))
  }, [count, setCurrent])

  /**
   * One measurement per painted frame, plus one more once motion stops.
   *
   * The pair is the same one the autoplay coordinator settled on, for both of
   * its reasons. A fling delivers scroll events faster than the screen
   * refreshes, and measuring on each would re-render the card several times
   * for one frame nobody sees — hence the rAF, used as a one-shot and never as
   * a loop. And a `requestAnimationFrame` only runs when the page PAINTS: in a
   * background tab, or a window the compositor has stopped drawing, the last
   * scroll of a swipe would otherwise never be measured and the page in view
   * would stay whatever it was before. The trailing timer is re-armed by every
   * scroll event, so during motion it never fires and after it, once.
   */
  const frame = useRef(0)
  const settle = useRef(0)
  const onScroll = useCallback(() => {
    if (typeof window === "undefined") return

    if (settle.current) window.clearTimeout(settle.current)
    settle.current = window.setTimeout(() => {
      settle.current = 0
      measure()
    }, SETTLE_MS)

    if (frame.current) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0
      measure()
    })
  }, [measure])

  useEffect(() => {
    return () => {
      if (typeof window === "undefined") return
      if (frame.current) {
        window.cancelAnimationFrame(frame.current)
        frame.current = 0
      }
      if (settle.current) {
        window.clearTimeout(settle.current)
        settle.current = 0
      }
    }
  }, [])

  /**
   * A resize changes what `scrollLeft` MEANS — the page width is the divisor —
   * and browsers do not agree on whether a snap container keeps its snapped
   * page across one. Re-measuring costs nothing and is the only way the pill
   * cannot end up describing a page that is no longer under it.
   */
  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure])

  /** Move, and let the scroller's own snapping and smoothness do the moving. */
  const goTo = useCallback(
    (index: number) => {
      const el = trackRef.current
      if (!el) return
      // Optimistic: the pill and the playing page update on the key press
      // rather than on the first scroll event of a 300ms animation. `measure`
      // corrects it if the scroller lands somewhere else.
      setCurrent(index)
      el.scrollTo({ left: index * el.clientWidth })
    },
    [setCurrent]
  )

  /* ── Keyboard ─────────────────────────────────────────────────────────── */

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = keyTarget(event.key, pageRef.current, count)
      if (target === null) return
      // Only once we know the key was ours. Swallowing Home/End at the ends of
      // the carousel would strand a keyboard user who meant the page.
      event.preventDefault()
      goTo(target)
    },
    [count, goTo]
  )

  /* ── Mouse drag ───────────────────────────────────────────────────────── */

  /**
   * Touch and trackpads are the browser's job and are not intercepted here:
   * the native scroller already gives them momentum, rubber-banding and snap
   * points that no JavaScript reimplementation matches. A MOUSE has none of
   * that — there is no such thing as a swipe with a mouse — so a press-and-
   * drag is synthesised, and only for `pointerType === "mouse"`.
   */
  const drag = useRef<{ startX: number; startLeft: number; startPage: number; moved: number } | null>(
    null
  )

  /**
   * How far the last drag travelled, kept for the click that follows it.
   *
   * `pointerup` is followed by a `click` whose target is whatever is under the
   * pointer — a <video> with an onClick that toggles mute. Without this, every
   * mouse drag that finished over a video page would also unmute the feed.
   */
  const dragDistance = useRef(0)

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return
    const el = trackRef.current
    if (!el) return
    drag.current = {
      startX: event.clientX,
      startLeft: el.scrollLeft,
      startPage: pageRef.current,
      moved: 0,
    }
    // Snapping fights an imperative scrollLeft mid-drag: the container keeps
    // pulling back to the nearest snap point and the picture stutters. It goes
    // back on when the pointer comes up, which is what makes the release snap.
    el.style.scrollSnapType = "none"
    el.setPointerCapture(event.pointerId)
  }, [])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = trackRef.current
    if (!state || !el) return
    const dx = event.clientX - state.startX
    state.moved = Math.max(state.moved, Math.abs(dx))
    el.scrollLeft = state.startLeft - dx
  }, [])

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const state = drag.current
      const el = trackRef.current
      if (!state || !el) return
      drag.current = null
      el.style.scrollSnapType = ""
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId)
      goTo(dragTarget(state.startPage, event.clientX - state.startX, el.clientWidth, count))
      // Kept for the click that is about to arrive; cleared on the next press.
      dragDistance.current = state.moved
    },
    [count, goTo]
  )

  /** The click that follows a real drag is the drag ending, not a click. */
  const onClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (dragDistance.current <= CLICK_SLOP_PX) return
    dragDistance.current = 0
    event.stopPropagation()
    event.preventDefault()
  }, [])

  return (
    <div className="relative">
      <div
        ref={trackRef}
        // A labelled group rather than a listbox or a tablist: the pages are
        // content, not options, and nothing here is "selected". `carousel` is
        // the role description the ARIA authoring practices use for exactly
        // this, and the group is focusable so the arrow keys have somewhere to
        // land.
        role="group"
        aria-roledescription="carousel"
        aria-label={carouselLabel(count)}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        // A picture inside a scroller is a drag source by default, so a mouse
        // drag would otherwise start a file drag and leave a ghost image
        // attached to the cursor instead of moving the carousel.
        onDragStart={(event) => event.preventDefault()}
        className={[
          "flex w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain",
          // Programmatic moves animate; the tokens' reduced-motion block and
          // this variant both turn that off for anyone who asked.
          "scroll-smooth motion-reduce:scroll-auto",
          // The scrollbar is noise under a photograph and the pips already say
          // where you are. The pages remain reachable by every other means.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "cursor-grab select-none active:cursor-grabbing",
          "rounded-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo",
        ].join(" ")}
      >
        {media.map((entry, index) => {
          const measured = entry.media_id === sessionPageId
          const duration = entry.kind === "video" ? formatDuration(entry.duration_ms) : ""
          return (
            <div
              key={entry.media_id}
              // The position is announced HERE, once, on arrival — which is the
              // counterpart to the pips being hidden below.
              role="group"
              aria-roledescription="slide"
              aria-label={slideLabel(index, count, entry.kind)}
              className="relative w-full flex-none snap-center"
            >
              {isPageRendered(index, page) ? (
                <>
                  <PostMedia
                    item={item}
                    media={entry}
                    // Both halves. See carousel.ts.
                    active={isPageActive(active, index, page)}
                    muted={muted}
                    onToggleMuted={onToggleMuted}
                    session={measured ? session : undefined}
                    onWatchEvent={measured ? onWatchEvent : undefined}
                    onStale={onStale}
                    resolveUrl={resolveUrl}
                    frameRatio={frameRatio}
                    // Mounting a page IS the decision to load it — the window
                    // above is what makes that decision. See `preloadImage`.
                    preloadImage
                  />
                  {/* This page's own duration, not the post's. The old badge
                      sat over the whole media block, so a carousel whose video
                      was page three printed that duration over page one's
                      photograph. */}
                  {duration && (
                    <span className="pointer-events-none absolute bottom-2 right-2 rounded-mo-sm bg-mo-bg/80 px-1.5 py-0.5 text-xs tabular-nums text-mo-ink">
                      {duration}
                    </span>
                  )}
                </>
              ) : (
                // Not mounted yet, but exactly as wide and as tall as if it
                // were: the scroller's geometry is what `pageFromScroll` reads.
                <MediaFrame ratio={frameRatio} blurhash={entry.blurhash} />
              )}
            </div>
          )
        })}
      </div>

      {/*
        "2/5", top-right, and the pips over the bottom edge — both INSIDE the
        frame, the way Instagram overlays them, so the frame is the same height
        with or without a carousel.

        Both sit on PHOTOGRAPHY, which can be any colour, so neither may rely
        on a theme colour alone — white pips on a white sky are invisible and a
        themed pill vanishes into half the pictures on the platform. Hence a
        scrim, and the numbers are the worst case (a pure white photograph),
        computed the way tokens.css computes its table:

          --mo-ink on --mo-bg @ .70, over white ....  6.46  AA at any size
          --mo-ink on --mo-bg @ .70, over mid grey . 11.62
          --mo-ink on --mo-bg @ .70, over black .... 17.38
          the current pip on --mo-bg @ .60, over white  4.47  clears 3.0

        The DIM pips are 2.0–3.4 against their own scrim and that is deliberate:
        "not the current page" is the one thing they say, they say it against
        the current pip rather than against the picture, and the same fact is
        in the pill in words. They are decorative and marked as such.

        `pointer-events-none` on both, so neither can eat a drag.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-3 rounded-mo-pill bg-mo-bg/70 px-2 py-0.5 text-xs font-medium tabular-nums text-mo-ink backdrop-blur-sm"
      >
        {pillLabel(page, count)}
      </span>

      {/*
        Position pips.

        Hidden from assistive technology on purpose, exactly as the Android
        version clears their semantics: a screen-reader user moving through the
        pages hears each page's own label and alt text, so a row of dots
        announcing "dot dot dot" adds nothing and interrupts the part that
        does. The same information is in the pill, in words, for everyone else.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
      >
        <div className="flex items-center gap-1.5 rounded-mo-pill bg-mo-bg/60 px-2 py-1 backdrop-blur-sm">
          {media.map((entry, index) => (
            <span
              key={entry.media_id}
              className={
                index === page
                  ? "h-1.5 w-1.5 rounded-mo-pill bg-mo-ink"
                  : "h-1 w-1 rounded-mo-pill bg-mo-ink/40"
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}
