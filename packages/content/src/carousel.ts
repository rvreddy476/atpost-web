/**
 * The carousel's arithmetic — no React, no DOM, no JSX.
 *
 * Everything a multi-page post has to decide is a small piece of maths, and
 * every one of those decisions is a place a carousel goes wrong: the page that
 * is showing, the page that may play, the pages worth mounting, what a key
 * press means, where a drag lands. Kept here so they can be tested as numbers
 * rather than as a screenshot, in the same spirit as `visibleFraction` and
 * `pickActive` in @momentum/player.
 *
 * ── The one rule worth reading twice ──────────────────────────────────────
 * `isPageActive`. A post being the item the autoplay coordinator chose and a
 * page being the one in view are TWO different conditions, and a video may
 * only play when both hold. Collapsing them — playing the post's video
 * whichever page is showing — is the carousel version of the bug the
 * coordinator's header describes: something plays that nobody is looking at,
 * and it keeps billing the creator for it.
 */

/**
 * How many pages either side of the current one are mounted.
 *
 * One. Enough that a swipe never reveals an empty frame — the neighbour is
 * already decoded — and no more, because the alternative is five full-size
 * images per post across twenty posts, which is the whole feed's byte budget
 * spent on pictures nobody scrolled to. Pages outside the window still occupy
 * their exact width in the scroller (see PostCarousel), so nothing shifts when
 * one mounts.
 */
export const RENDER_WINDOW = 1

/**
 * How far a mouse drag must travel before it counts as "next page", as a
 * fraction of the page width.
 *
 * A quarter, matching what a touch scroller does with snap points: less and a
 * twitch during a click changes the page, more and a deliberate short drag
 * springs back and feels broken.
 */
export const DRAG_THRESHOLD = 0.25

export function clampPage(index: number, count: number): number {
  if (count <= 0) return 0
  if (!Number.isFinite(index)) return 0
  return Math.min(count - 1, Math.max(0, Math.round(index)))
}

/**
 * Which page is showing, measured from the scroller.
 *
 * Read from `scrollLeft` at the moment of the decision rather than remembered
 * from an observer callback — the same discipline the autoplay coordinator
 * arrived at the hard way. A scroll-snap container can come to rest between
 * two callbacks, and a stale index means the pill says "2/5" over page three
 * and, worse, the wrong page believes it may play.
 *
 * `Math.abs` because a right-to-left scroller reports a negative offset in
 * some engines; the page index is a distance, not a direction.
 */
export function pageFromScroll(scrollLeft: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0 || !Number.isFinite(pageWidth)) return 0
  return clampPage(Math.abs(scrollLeft) / pageWidth, count)
}

/**
 * May the media on this page play?
 *
 * Both halves, always. `postActive` is the autoplay coordinator's answer to
 * "which ONE post in the feed is on screen"; `index === current` is this
 * carousel's answer to "which ONE page of it is in view". A video on page
 * three of the post you are reading is not on screen, and a video on page one
 * of a post that has scrolled away is not either.
 */
export function isPageActive(postActive: boolean, index: number, current: number): boolean {
  return postActive && index === current
}

/**
 * Is this page mounted, or is it still just a blurhash holding its place?
 *
 * The window is centred on the current page, so a swipe in either direction
 * finds its neighbour already loaded.
 */
export function isPageRendered(index: number, current: number, window = RENDER_WINDOW): boolean {
  return Math.abs(index - current) <= window
}

/**
 * What a key press means, or null for "not ours — let it through".
 *
 * Returning null rather than the current index matters: a handler that
 * "handled" every key would swallow Tab and the browser's own find-in-page.
 * Left/Right rather than Up/Down because the pages are laid out horizontally
 * and Up/Down belong to the feed's own scrolling.
 */
export function keyTarget(key: string, current: number, count: number): number | null {
  if (count <= 1) return null
  switch (key) {
    case "ArrowRight":
      return current < count - 1 ? current + 1 : null
    case "ArrowLeft":
      return current > 0 ? current - 1 : null
    case "Home":
      return current === 0 ? null : 0
    case "End":
      return current === count - 1 ? null : count - 1
    default:
      return null
  }
}

/**
 * Where a mouse drag lands.
 *
 * `dx` is how far the pointer moved, so dragging RIGHT (positive) pulls the
 * previous page into view. A drag past the threshold moves exactly one page
 * however far it went: a carousel is not a scrubber, and a 900px fling on a
 * trackpad should not skip four photographs.
 */
export function dragTarget(
  startPage: number,
  dx: number,
  pageWidth: number,
  count: number,
  threshold = DRAG_THRESHOLD
): number {
  if (pageWidth <= 0 || !Number.isFinite(pageWidth)) return clampPage(startPage, count)
  const travelled = dx / pageWidth
  if (travelled <= -threshold) return clampPage(startPage + 1, count)
  if (travelled >= threshold) return clampPage(startPage - 1, count)
  return clampPage(startPage, count)
}

/**
 * Where a press on an arrow — or on the pip row's own step — lands, or null
 * for "there is nowhere to go, so there is no button".
 *
 * Deliberately expressed in terms of `keyTarget` rather than beside it. "What
 * does next mean at the last page" is ONE question, and answering it twice is
 * how a carousel ends up with an arrow that is live at an end the arrow keys
 * refuse to cross. Null is what makes the arrow ABSENT rather than disabled —
 * see the render site for why that is the rule here.
 */
export function stepTarget(
  direction: "prev" | "next",
  current: number,
  count: number
): number | null {
  return keyTarget(direction === "next" ? "ArrowRight" : "ArrowLeft", current, count)
}

/**
 * Whether the arrows and the pip buttons are on screen.
 *
 * The player's rule, minus the half a carousel has no equivalent for. There is
 * nothing playing here, so `chromeVisible`'s "a stopped video always shows its
 * transport" clause has no meaning; what is left is the part that matters —
 * controls appear when a pointer is over the frame or a keyboard has focused
 * it, and fade CONTROLS_HIDE_MS after the last movement.
 *
 * ── Touch is deliberately not in this list ────────────────────────────────
 * A finger already has the gesture this whole component is built around, and
 * it is the better one: swiping a photograph is direct, momentum-carrying and
 * needs no target to hit. Revealing arrows on a tap would put two 36px buttons
 * over the left and right edges of a video whose own transport is summoned by
 * exactly the same tap, and the first thing a person would do with them is
 * turn the page while trying to pause. So a touch surface keeps the swipe and
 * gets no chrome, which is the behaviour it has today and the right one.
 */
export interface CarouselChrome {
  /** A MOUSE is over the frame. Never set for a touch or a pen. */
  hovered: boolean
  /** The track or one of the controls has keyboard focus. */
  focused: boolean
  /** Something moved within CONTROLS_HIDE_MS — the auto-hide timer as a flag. */
  recentlyMoved: boolean
}

export function controlsVisible(chrome: CarouselChrome): boolean {
  if (chrome.focused) return true
  return chrome.hovered && chrome.recentlyMoved
}

/** The "2/5" pill, top-right. 1-based, because it is read by a person. */
export function pillLabel(current: number, count: number): string {
  return `${clampPage(current, count) + 1}/${count}`
}

/** What one arrow calls itself. Direction only: the pips carry the position. */
export function arrowLabel(direction: "prev" | "next"): string {
  return direction === "next" ? "Next photo" : "Previous photo"
}

/**
 * What one pip calls itself, now that pips are real buttons.
 *
 * ── How this composes with `slideLabel`, which says almost the same thing ──
 * The two are not duplicates and the difference is the whole reason the pips
 * could become interactive at all. `slideLabel` names a THING — "Photo 3 of 5"
 * — and is read when a page arrives. This names an ACTION — "Show photo 3 of
 * 5" — and is read when a person lands on the control that performs it. A
 * screen reader announcing both is announcing two different facts, which is
 * what an interactive dot has to do; announcing "Photo 3 of 5, button" twice
 * would be the duplication the old `aria-hidden` was avoiding.
 *
 * The current pip additionally carries `aria-current`, so "which one am I on"
 * comes from the control itself rather than from counting.
 */
export function pipLabel(index: number, count: number, kind: "image" | "video"): string {
  const noun = kind === "video" ? "video" : "photo"
  return `Show ${noun} ${index + 1} of ${count}`
}

/**
 * What one page calls itself.
 *
 * This is where the position of the CONTENT is announced: a screen-reader user
 * arriving on a page hears "Photo 2 of 5" followed by that photograph's own alt
 * text, once, at the moment it becomes relevant.
 *
 * The pips used to be `aria-hidden` so that this was the only place it was
 * said. They are controls now, and `pipLabel` explains how the two coexist
 * without either of them repeating the other.
 */
export function slideLabel(index: number, count: number, kind: "image" | "video"): string {
  const noun = kind === "video" ? "Video" : "Photo"
  return `${noun} ${index + 1} of ${count}`
}

/** What the whole control calls itself. Stable — it must not change per page. */
export function carouselLabel(count: number): string {
  return `Post media, ${count} items`
}
