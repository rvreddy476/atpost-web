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
 *   · the "2/5" pill, INSIDE the frame (top-LEFT here — see the render site)
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
 * (desktop pointers do not swipe), arrow keys, and the overlays.
 *
 * ── A mouse does not swipe, and it should not have to ─────────────────────
 * The drag below is real and stays. It was also, for a while, the ONLY way a
 * mouse could turn a page — which is the wrong primary interaction on a
 * desktop: nobody drags a photograph to see the next one, the grab cursor
 * promised a gesture people do not make, and the row of dots that showed the
 * position could not be pressed to change it.
 *
 * So there are now three ways to turn a page and the drag is the third:
 *
 *   · ARROWS, overlaid left and right, revealed on hover or keyboard focus
 *     exactly as the player's transport is. ABSENT at the ends rather than
 *     disabled — see the render site.
 *   · PIPS, which are buttons: pressing the third dot shows the third photo.
 *     They are real controls with real labels now; `pipLabel` in carousel.ts
 *     carries how that composes with each slide's own announcement.
 *   · the drag, and the swipe, and the trackpad, and the arrow keys, all
 *     unchanged.
 *
 * The chrome follows the player's rule and its clock — `controlsVisible` and
 * CONTROLS_HIDE_MS — so a carousel inside a feed of videos does not fade on a
 * different schedule from the video sitting next to it. A hidden control is
 * not a tab stop and is `aria-hidden`, which is what keeps twenty carousels
 * from putting a hundred dead buttons in a keyboard user's way.
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

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import type { WatchEvent, WatchSessionInfo } from "@momentum/player"
import { CONTROLS_HIDE_MS } from "@momentum/player"
import { MediaFrame, PostMedia } from "./PostMedia"
import { formatDuration } from "./relativeTime"
import { aspectRatio } from "./variants"
import {
  arrowLabel,
  carouselLabel,
  controlsVisible,
  dragTarget,
  isPageActive,
  isPageRendered,
  keyTarget,
  pageFromScroll,
  pillLabel,
  pipLabel,
  slideLabel,
  stepTarget,
} from "./carousel"

export interface PostCarouselProps {
  item: FeedItem
  /** Every attachment, already in position order. Two or more. */
  media: FeedMedia[]
  /** The coordinator's answer for the POST. Never for a page. */
  active: boolean
  /**
   * The DEFAULT sound state each page's player starts from.
   *
   * Not a shared one, and there is no toggle here: mute belongs to a player
   * now and every page has its own. Two videos in one carousel therefore have
   * two independent speakers, which is the right answer — they are two
   * different videos.
   */
  muted: boolean
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
   * pointer — a <video> with an onClick that toggles PLAY/PAUSE. Without this,
   * every mouse drag that finished over a video page would also stop it. (It
   * used to unmute the whole feed instead, which was the same bug wearing the
   * old click handler.)
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

  /* ── The chrome: arrows and pips, on the player's rule and its clock ───── */

  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [recentlyMoved, setRecentlyMoved] = useState(false)
  const chromeShown = controlsVisible({ hovered, focused, recentlyMoved })

  const hideTimer = useRef(0)
  const noteActivity = useCallback(() => {
    setRecentlyMoved(true)
    if (typeof window === "undefined") return
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => {
      hideTimer.current = 0
      setRecentlyMoved(false)
    }, CONTROLS_HIDE_MS)
  }, [])

  useEffect(
    () => () => {
      if (typeof window !== "undefined" && hideTimer.current) window.clearTimeout(hideTimer.current)
    },
    []
  )

  const rootRef = useRef<HTMLDivElement | null>(null)

  /**
   * Nothing invisible may hold the focus — the same hole the player's
   * transport had, arriving here for the same reason.
   *
   * Press a pip with the MOUSE and it has DOM focus without being
   * focus-visible, so `focused` stays false and the chrome is free to fade
   * three seconds later, leaving the focus on an `aria-hidden` button nobody
   * can see. When the chrome goes, the focus comes back out to the track,
   * which is always focusable and always visible.
   */
  useEffect(() => {
    if (chromeShown) return
    const root = rootRef.current
    const track = trackRef.current
    if (typeof document === "undefined" || !root || !track) return
    const active = document.activeElement
    if (active && active !== track && root.contains(active)) track.focus()
  }, [chromeShown])

  /**
   * An arrow press, and the focus problem that comes with hiding one.
   *
   * The arrow that has just carried you to the last page is about to be
   * removed from the document, and a focused element that unmounts drops the
   * focus on `<body>` — a keyboard user pressing Right twice through a
   * two-page carousel would land nowhere and have to Tab back from the top of
   * the page. So when the step lands somewhere that arrow cannot leave, the
   * focus is handed to the track before the button goes.
   */
  const step = useCallback(
    (direction: "prev" | "next") => {
      const target = stepTarget(direction, pageRef.current, count)
      if (target === null) return
      goTo(target)
      noteActivity()
      if (stepTarget(direction, target, count) === null) trackRef.current?.focus()
    },
    [count, goTo, noteActivity]
  )

  const trackId = useId()

  /**
   * Whether a faded control can still be pressed. It cannot.
   *
   * Exactly ONE of the two classes is ever emitted — Tailwind orders
   * `.pointer-events-none` before `.pointer-events-auto` in its own sheet, so
   * a list carrying both resolves to `auto` however it was written, and an
   * invisible arrow would sit over the photograph eating clicks.
   */
  const hit = chromeShown ? "pointer-events-auto" : "pointer-events-none"
  const fade = [
    "transition-opacity duration-150 ease-mo motion-reduce:transition-none",
    chromeShown ? "opacity-100" : "opacity-0",
  ].join(" ")

  return (
    <div
      ref={rootRef}
      className="relative"
      /*
        A touch or a pen never counts as hover. The player's rule, and here it
        is also what keeps the arrows off a phone entirely: a browser fires
        `pointerenter` on the way into a tap, so treating that as hover would
        summon two buttons over the edges of the frame on every tap — and a tap
        on a carousel page holding a video is that video's play/pause.
      */
      onPointerEnter={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") return
        setHovered(true)
        noteActivity()
      }}
      onPointerLeave={() => setHovered(false)}
      onPointerMove={(event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") return
        noteActivity()
      }}
      /*
        KEYBOARD focus pins the chrome open; a click that merely moved the DOM
        focus here does not. `:focus-visible` is the browser's own answer to
        that question and is already this product's focus-ring rule, so the
        controls appear under exactly the condition the ring does.
      */
      onFocus={(event) => {
        const target = event.target as HTMLElement | null
        try {
          setFocused(target?.matches?.(":focus-visible") ?? true)
        } catch {
          setFocused(true)
        }
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}
    >
      <div
        ref={trackRef}
        id={trackId}
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
          /*
            No grab cursor. It was the first thing anyone noticed about this
            carousel and the complaint was exactly right: a hand promises a
            gesture that is not how a person with a mouse turns a page, and it
            was promising it on a control that had no other affordance at all.
            The drag still works — it is just no longer advertised as the way
            in. `select-none` stays, because dragging across a picture must not
            paint a text selection over the card.
          */
          "select-none",
          "rounded-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo",
        ].join(" ")}
      >
        {media.map((entry, index) => {
          const measured = entry.media_id === sessionPageId
          const duration = entry.kind === "video" ? formatDuration(entry.duration_ms) : ""
          return (
            <div
              key={entry.media_id}
              // Where the position of the CONTENT is announced, once, on
              // arrival. The pips below say what pressing them DOES, which is
              // a different sentence — see `pipLabel` in carousel.ts.
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
        "2/5", top-LEFT, and the pips over the bottom edge — both INSIDE the
        frame, the way Instagram overlays them, so the frame is the same height
        with or without a carousel.

        ── Why top-left rather than Android's top-right ────────────────────
        Because the player's speaker lives in the top-right corner now, and a
        page counter has to give way to a control. The pill is a LABEL: it is
        `aria-hidden`, it cannot be pressed, and it says something the person
        can also see from the pips. The speaker is the control people reach for
        most on a video, and a control that moved to a different corner
        depending on whether the post happened to have a second photograph
        would be the worst of both. So the label moved, once, and the transport
        keeps the same geometry everywhere it is mounted.

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
        className="pointer-events-none absolute left-3 top-3 rounded-mo-pill bg-mo-bg/70 px-2 py-0.5 text-xs font-medium tabular-nums text-mo-ink backdrop-blur-sm"
      >
        {pillLabel(page, count)}
      </span>

      {/*
        ── The arrows ──────────────────────────────────────────────────────

        Vertically centred on the left and right edges, which is the one band
        of the frame nothing else wants: the pill has top-left, the player's
        speaker has top-right, the pips have bottom-centre and the duration
        badge has bottom-right.

        ABSENT at the ends, not disabled. That is this card's own rule — a
        disabled control says "not yet" where the truth is "not here" — and it
        is also the honest one for an overlay: a greyed arrow welded over the
        first photograph of every carousel is chrome that can never do
        anything, sitting on top of the content it is decorating. `stepTarget`
        returning null is the single definition of "there is nowhere to go",
        shared with the arrow keys, so the two can never disagree.

        Colour is the player's OVERLAY_BUTTON recipe unchanged, because these
        sit on the same photography its speaker does: `--mo-ink` on `--mo-bg`
        at .70 measures 6.46 against a pure white frame, 11.62 over mid grey
        and 17.38 over black. The glyph is non-text and needs 3.0.
      */}
      {(["prev", "next"] as const).map((direction) => {
        if (stepTarget(direction, page, count) === null) return null
        return (
          <button
            key={direction}
            type="button"
            onClick={() => step(direction)}
            // A faded control is not a control: out of the tab order and out
            // of the accessibility tree while it cannot be seen.
            aria-hidden={!chromeShown}
            tabIndex={chromeShown ? 0 : -1}
            aria-label={arrowLabel(direction)}
            aria-controls={trackId}
            className={[
              OVERLAY_BUTTON,
              hit,
              fade,
              "absolute top-1/2 h-9 w-9 -translate-y-1/2",
              direction === "prev" ? "left-2" : "right-2",
            ].join(" ")}
          >
            {direction === "prev" ? (
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            ) : (
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        )
      })}

      {/*
        ── The pips, which are buttons now ─────────────────────────────────

        They used to be `aria-hidden` decoration, and that was a real decision
        rather than an oversight: a screen-reader user moving through the pages
        hears each page's own label, so a row of dots announcing "dot dot dot"
        added nothing and interrupted the part that did.

        Making them pressable means they can no longer be decoration — an
        interactive thing that is hidden from assistive technology is worse
        than a dot, it is a control only some people can reach. So they are
        real buttons with real labels ("Show photo 3 of 5"), and the current
        one carries `aria-current`. `pipLabel` in carousel.ts sets out how that
        coexists with each slide saying "Photo 3 of 5" without either repeating
        the other: one names a thing, the other names an action.

        What keeps that from costing a keyboard user a hundred tab stops in a
        feed of carousels is the same mechanism the player uses for its
        transport, applied here: while the chrome is faded these are
        `aria-hidden` and `tabIndex={-1}`, so an untouched feed contains none
        of them. Hovering or focusing the frame brings them, and a keyboard
        user reaches them by the same Tab that reveals them.

        The hit target is what makes this usable rather than merely correct: a
        1.5px dot is not a thing a mouse can hit, so each button is a 20px
        square with the dot drawn in the middle of it.
      */}
      {/*
        The full-width row stays `pointer-events-none` for ever: it spans the
        whole frame and sits directly over the left-hand end of a video's
        transport, so a hit area there would swallow the play button and any
        drag begun along the bottom edge. Only the pill inside it — which is as
        wide as the dots and no wider — is ever pressable.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div
          className={`flex items-center gap-0.5 rounded-mo-pill bg-mo-bg/60 px-1 backdrop-blur-sm ${hit} ${fade}`}
        >
          {media.map((entry, index) => (
            <button
              key={entry.media_id}
              type="button"
              onClick={() => {
                goTo(index)
                noteActivity()
              }}
              aria-hidden={!chromeShown}
              tabIndex={chromeShown ? 0 : -1}
              aria-label={pipLabel(index, count, entry.kind)}
              aria-current={index === page ? "true" : undefined}
              aria-controls={trackId}
              className={[
                "flex h-5 w-5 items-center justify-center rounded-mo-pill",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
              ].join(" ")}
            >
              {/*
                The dot itself, unchanged. The current pip is `--mo-ink` on the
                .60 scrim — 4.47 over a pure white photograph, which clears the
                3.0 a non-text mark needs. The dim ones are 2.0–3.4 against
                that same scrim and that is deliberate: "not the current page"
                is the only thing they say, they say it against the current
                pip, and the same fact is in the pill in words.
              */}
              <span
                aria-hidden="true"
                className={
                  index === page
                    ? "h-1.5 w-1.5 rounded-mo-pill bg-mo-ink"
                    : "h-1 w-1 rounded-mo-pill bg-mo-ink/40"
                }
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The shape every overlay control on a carousel shares.
 *
 * Copied verbatim from `OVERLAY_BUTTON` in @momentum/player's MomentumVideo,
 * and copied on purpose rather than imported: that constant is private to the
 * player and a carousel arrow is not a player control, so exporting it would
 * make an internal detail of one package a contract of another. What must not
 * drift is the MEASUREMENT behind it — `--mo-ink` on `--mo-bg` at .70, 6.46
 * against a pure white frame — and that is why the numbers are written out at
 * both sites rather than only here.
 *
 * It carries no `pointer-events` of its own; that belongs to the caller,
 * because it depends on whether the control is currently on screen. See `hit`.
 */
const OVERLAY_BUTTON =
  "inline-flex items-center justify-center rounded-mo-pill " +
  "bg-mo-bg/70 text-mo-ink backdrop-blur-sm transition-colors duration-150 ease-mo " +
  "hover:bg-mo-bg/85 focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-mo"
