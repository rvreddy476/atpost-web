"use client"

/**
 * Which ONE item is playing.
 *
 * ── The bug this is shaped to avoid ───────────────────────────────────────
 * The Android client had an autoplay that resolved a row to a post by LIST
 * INDEX while measuring a different row's geometry, so it played the item
 * below the one on screen. It was fixed there last week; nothing here may
 * reintroduce it.
 *
 * The defence is structural rather than careful: an element is bound to its
 * STABLE ID at the moment it registers, in `elementToId`, and every decision
 * after that reads the id off the element that was actually measured. There is
 * no array of items in this file, no index, and nothing to fall out of step
 * when the feed prepends a page or a post is removed. If you find yourself
 * wanting to pass `items` in here, that is the bug asking to come back.
 *
 * ── One video, ever ───────────────────────────────────────────────────────
 * This returns a single id. It is not a set, and it is not per-item state that
 * happens to usually have one winner: the invariant is enforced by the shape
 * of the return value, so two videos cannot both believe they are active.
 *
 * ── Three reasons to stop ─────────────────────────────────────────────────
 *   · scrolled away        — not enough of it is on screen any more
 *   · the tab went away    — `visibilitychange`, which scrolling never fires,
 *                            so a video in a background tab would otherwise
 *                            play to nobody and bill the creator for it
 *   · reduced motion       — nothing ever becomes active
 *
 * ── The observer is a doorbell, not a measurement ─────────────────────────
 * This is the correction to a real bug, and it is the thing to understand
 * before touching anything below.
 *
 * An IntersectionObserver does not tell you "how visible is this now". It
 * tells you "this element's `intersectionRatio` has crossed one of the
 * thresholds you listed". Between two crossings it says nothing at all, and
 * `intersectionRatio` is a fraction of the ELEMENT — which is NOT the number
 * this file ranks on. We rank on `visibleFraction`, a fraction of the
 * VIEWPORT, because a 900px card can never fill 60% of itself on a 720px
 * screen (see the note on `visibleFraction`). The two differ by a factor of
 * `elementHeight / min(elementHeight, viewportHeight)`, so the 0.6 decision
 * boundary lands in the middle of a gap between sampled thresholds.
 *
 * Measured in the live feed: a 475px card in a 374px viewport. Its last
 * threshold crossing (intersectionRatio 0.4) recorded visibleFraction 0.545;
 * the next threshold up (0.6) would not arrive until visibleFraction 0.762.
 * At scroll offsets 1350–1400 the card was genuinely 0.61, 0.68 and 0.74
 * visible — well past the bar — while the coordinator still held 0.545 and
 * played nothing. No callback had fired, because none was owed. A wheel event
 * appeared to "fix" it only by jolting the ratio across a threshold.
 *
 * That silence is not rare and it is not only about scrolling. It is why a
 * programmatic `scrollTo`, `scrollIntoView`, PageDown, an anchor jump, the
 * scroll position a browser restores on back/forward, momentum that ends
 * between crossings, the mobile URL bar collapsing, or a layout shift above
 * the fold could all leave the wrong item playing — and an off-screen video
 * that keeps playing keeps emitting `watch_heartbeat`, which is money.
 *
 * So the fix is in two halves:
 *
 *   1. NOTHING is decided from a remembered ratio. `recompute` measures every
 *      registered element against the viewport at the instant it decides.
 *      There is no ratios cache left to go stale — that map is deliberately
 *      gone, and it must not come back.
 *   2. The observer, a capture-phase `scroll` listener, `resize`, the visual
 *      viewport, and a ResizeObserver are all just DOORBELLS. Any one of them
 *      ringing means "geometry may have moved, go and look". None of them is
 *      trusted to say what the geometry IS, so no single one of them has to be
 *      complete — which is the only way to cover every path the viewport can
 *      move by, including the ones nobody has thought of yet.
 *
 * ── What it must not become ───────────────────────────────────────────────
 * Not a `requestAnimationFrame` loop and not a `setInterval`. An idle feed on
 * a phone must cost nothing: every doorbell is an event, the work is coalesced
 * into one measurement per painted frame, and the single trailing timer is
 * re-armed by motion and fires once after it stops. Twenty cards share one of
 * each listener — the hook owns the set, so a per-card listener is never the
 * answer.
 */

import { useCallback, useEffect, useRef, useState } from "react"

export interface AutoplayCoordinator {
  /** The id that should be playing, or null. Never more than one. */
  activeId: string | null
  /** Give an element to the coordinator, bound to a stable id. */
  register: (id: string) => (el: HTMLElement | null) => void
}

export interface AutoplayOptions {
  /**
   * Turn the whole thing off — reduced motion, or a surface that does not
   * autoplay at all. When false nothing is ever active and no observer runs.
   */
  enabled?: boolean
  /**
   * How much of an item must be visible before it may play. 0.6 rather than
   * 0.5 because at exactly half, two items in a tall column swap on every
   * frame of a slow scroll, and the flicker is worse than a late start.
   */
  minRatio?: number
  /**
   * The parts of the window that are covered by chrome and are therefore not
   * "on screen" at all. See `ViewportInset`.
   */
  viewportInset?: ViewportInset
}

/**
 * The window is not always the same thing as what you can see.
 *
 * A sticky header sits over the top of the viewport, so the top `n` pixels of
 * the window show chrome and never show a card. Without being told, this file
 * measures a card as visible while part of it is behind that bar, and credits
 * it — the error is exactly `insetTop / min(cardHeight, viewportHeight)`, up
 * to 6.7 points on a 900px window with a 56px header. Bounded, but systematic,
 * and it flows through `activeId` into `watch_heartbeat`, which is what a
 * creator is paid on.
 *
 * ── Why an inset and not a bigger `minRatio` ──────────────────────────────
 * Raising the bar to compensate was considered and rejected. The error is a
 * function of the window's height, so any constant added to `minRatio` is
 * right at one window size and wrong at every other — over-correcting on a
 * tall desktop window and under-correcting on a short phone one. It would also
 * quietly change the hand-off behaviour, which is a separate thing 0.6 was
 * tuned for. This describes the geometry instead, and the geometry is what
 * changed.
 *
 * The numbers are pixels of the LAYOUT viewport, measured from the real chrome
 * by whoever renders it — never a constant written down twice. `bottom` is
 * here for the surface that grows a docked player or a tab bar; nothing sets
 * it today and it costs nothing to have got the shape right once.
 */
export interface ViewportInset {
  top?: number
  bottom?: number
}

/** The strip of the window that a card can actually be seen in. */
function usableBand(viewportHeight: number, inset?: ViewportInset) {
  // Negative or absurd insets are a caller's arithmetic error, not a licence
  // to divide by a negative number.
  const top = Math.max(0, inset?.top ?? 0)
  const bottom = Math.max(0, inset?.bottom ?? 0)
  return { top, bottom: viewportHeight - bottom, height: viewportHeight - top - bottom }
}

/**
 * Thresholds for the observer.
 *
 * These no longer decide anything — see the header. They are a spread of
 * "wake me up" points, kept wide so that entering, leaving and crossing the
 * middle of the screen each ring the doorbell cheaply.
 */
const THRESHOLDS = [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1]

/**
 * How much better a challenger must be before it takes the crown.
 *
 * The real hysteresis, and the companion to `minRatio` above. `minRatio` sets
 * how visible an item must be to play at all; this sets how much of a margin
 * unseats one that already is. Without it, measuring on every frame — which is
 * what this file now does — would let two equal cards straddling the middle of
 * a tall window swap on every frame of a slow scroll, which is the exact
 * flicker `minRatio` was raised to 0.6 to avoid.
 */
const HANDOVER_MARGIN = 0.1

/**
 * How long after the last doorbell to take one more look, in ms.
 *
 * A smooth scroll, a fling's momentum, or a `scrollIntoView` with
 * `behavior: "smooth"` can stop between two frames, and the resting position
 * is the one that matters. This is re-armed by every doorbell, so during
 * motion it never fires; it fires exactly once, when motion stops. It is not a
 * poll: nothing schedules it while the page is still.
 */
const SETTLE_MS = 150

/** Just enough of a rectangle to decide with. Keeps the maths testable. */
export interface Box {
  top: number
  height: number
}

export interface Candidate {
  id: string
  box: Box
}

/**
 * How much of what COULD be on screen is on screen, 0..1.
 *
 * NOT `intersectionRatio`, which is a fraction of the ELEMENT — and that is
 * unusable here. A portrait flick renders around 900px tall in a 570px column;
 * on a laptop viewport its intersectionRatio can never reach 0.6 however
 * carefully it is centred, because 60% of the card is more pixels than the
 * window has. The observed symptom is a feed where no video ever plays and
 * nothing anywhere reports an error.
 *
 * Measuring against `min(element, viewport)` asks the question that actually
 * matters — "is this thing filling the screen?" — and gives the same answer as
 * intersectionRatio for anything that fits.
 *
 * It takes a plain rectangle rather than an IntersectionObserverEntry on
 * purpose: this is now computed from a live `getBoundingClientRect()` at the
 * moment of the decision, never from a number an observer recorded earlier.
 *
 * `inset` removes the parts of the window that are covered by chrome — see
 * `ViewportInset`. Both ends of the sum move: pixels behind the header are not
 * counted as visible, AND they are not counted as available to be visible, or
 * a card that exactly filled the gap below the header could never reach 1.
 */
export function visibleFraction(
  box: Box,
  viewportHeight: number,
  inset?: ViewportInset
): number {
  const band = usableBand(viewportHeight || 0, inset)
  if (band.height <= 0) return 0
  const measurable = Math.min(box.height || 0, band.height)
  if (measurable <= 0) return 0
  const visible = Math.min(box.top + box.height, band.bottom) - Math.max(box.top, band.top)
  if (visible <= 0) return 0
  return Math.min(1, visible / measurable)
}

export interface PickOptions {
  minRatio: number
  /** Whatever is playing right now, so it can be given the benefit of the doubt. */
  currentId?: string | null
  margin?: number
  /** Chrome over the window — see `ViewportInset`. */
  inset?: ViewportInset
}

/**
 * Pick the winner. Pure, so the rule can be tested without a browser.
 *
 * Highest visible fraction wins; a tie goes to whichever element's centre is
 * nearest the viewport's. Ties are common with two equal-height cards
 * straddling the middle of a tall window, and without the tiebreak the winner
 * is decided by Map insertion order — which is to say, by scroll history.
 *
 * Then hysteresis: an item that is already playing and is still showing enough
 * of itself keeps the crown unless a challenger beats it by `margin`. A
 * hand-off should happen when the reader has moved on, not when two cards are
 * a percentage point apart.
 *
 * The centre the tiebreak measures from is the centre of what can be SEEN, not
 * of the window: with a 56px header the two are 28px apart, which is enough to
 * hand a tie to the upper of two equal cards when the lower one is the one the
 * reader is looking at.
 */
export function pickActive(
  candidates: readonly Candidate[],
  viewportHeight: number,
  { minRatio, currentId = null, margin = HANDOVER_MARGIN, inset }: PickOptions
): string | null {
  const band = usableBand(viewportHeight, inset)
  const viewportCentre = (band.top + band.bottom) / 2

  let bestId: string | null = null
  let bestFraction = 0
  let bestDistance = Number.POSITIVE_INFINITY
  let incumbentFraction = 0

  for (const { id, box } of candidates) {
    const fraction = visibleFraction(box, viewportHeight, inset)
    if (id === currentId) incumbentFraction = fraction
    if (fraction < minRatio) continue

    const distance = Math.abs(box.top + box.height / 2 - viewportCentre)

    if (fraction > bestFraction + 0.001) {
      bestId = id
      bestFraction = fraction
      bestDistance = distance
    } else if (Math.abs(fraction - bestFraction) <= 0.001 && distance < bestDistance) {
      bestId = id
      bestFraction = fraction
      bestDistance = distance
    }
  }

  // An incumbent that has fallen below `minRatio` — or that unregistered, and
  // so was never measured — gets no protection at all. It has to go.
  if (
    currentId !== null &&
    bestId !== currentId &&
    incumbentFraction >= minRatio &&
    bestFraction < incumbentFraction + margin
  ) {
    return currentId
  }

  return bestId
}

export function useAutoplayCoordinator(options: AutoplayOptions = {}): AutoplayCoordinator {
  const { enabled = true, minRatio = 0.6 } = options
  /**
   * Taken apart into two numbers on purpose.
   *
   * A caller writes `viewportInset={{ top: headerHeight }}` and that object is
   * a new one on every render. If it reached a dependency array as an object,
   * `recompute` would be rebuilt every render, `schedule` with it, and the
   * effect below would disconnect and rebuild the IntersectionObserver and all
   * five listeners several times a second — the exact churn the rest of this
   * file is arranged to avoid.
   */
  const insetTop = options.viewportInset?.top ?? 0
  const insetBottom = options.viewportInset?.bottom ?? 0

  /**
   * `activeId` is the ONLY state here, and that is a deliberate constraint.
   *
   * An earlier version also published the intersection ratios and forced a
   * re-render whenever any of them moved — which is to say, on every frame of
   * every scroll, re-rendering twenty cards each time. Nothing consumed them
   * (impressions come from `useDwellTracker`, which does its own measuring),
   * and the cost was not merely wasted work: a re-render is what re-creates
   * inline callbacks, and callbacks that reach effect dependency arrays are
   * exactly how a player ends up tearing itself down mid-scroll.
   *
   * So measurement never causes a render. The one thing worth re-rendering for
   * is which item should be playing, and `setActiveId` is only ever called
   * with a value that actually changed.
   */
  const [activeId, setActiveId] = useState<string | null>(null)

  /**
   * The incumbent, readable from `recompute` without putting `activeId` in its
   * dependency array. That matters: `recompute` reaching a dependency array
   * that changes on every hand-off would rebuild the observer and every
   * listener on every hand-off.
   */
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  /**
   * The binding that makes the whole thing safe. An element resolves to the id
   * it registered with — not to a position in anything.
   */
  const elementToId = useRef(new Map<Element, string>()).current
  const idToElement = useRef(new Map<string, Element>()).current
  /**
   * The inset, reachable from `recompute` without being in its dependencies —
   * same reason as `activeIdRef`. A header is measured after mount, so this
   * value changes once, early; putting it in the deps would rebuild the
   * observer immediately after the first paint for nothing.
   */
  const insetRef = useRef<ViewportInset>({ top: insetTop, bottom: insetBottom })
  const observerRef = useRef<IntersectionObserver | null>(null)
  const resizeRef = useRef<ResizeObserver | null>(null)
  /** Set while the tab is hidden, so nothing becomes active behind our back. */
  const suspended = useRef(false)
  const frame = useRef(0)
  const settleTimer = useRef(0)

  /**
   * Measure everything registered, then pick. No cached ratios — see header.
   *
   * The cost is one `getBoundingClientRect()` per registered card, at most
   * once per painted frame, all reads with no writes between them so the
   * browser answers them from a single layout. That is the price of being
   * right about where things are, and it is a price a feed can afford.
   */
  const recompute = useCallback(() => {
    if (!enabled || suspended.current || typeof window === "undefined") {
      setActiveId((prev) => (prev === null ? prev : null))
      return
    }

    const viewportHeight = window.innerHeight
    const candidates: Candidate[] = []

    for (const [id, el] of idToElement) {
      const rect = el.getBoundingClientRect()
      // A detached or `display: none` element measures 0×0. That is not "fully
      // visible because none of its zero pixels are hidden" — it is not on
      // screen, and `visibleFraction` would otherwise be asked to divide by
      // nothing.
      if (rect.height <= 0 && rect.width <= 0) continue
      candidates.push({ id, box: { top: rect.top, height: rect.height } })
    }

    const next = pickActive(candidates, viewportHeight, {
      minRatio,
      currentId: activeIdRef.current,
      inset: insetRef.current,
    })
    setActiveId((prev) => (prev === next ? prev : next))
  }, [enabled, minRatio, idToElement])

  /**
   * Coalesce every doorbell into one measurement per painted frame, plus one
   * more once motion stops.
   *
   * A fling can deliver scroll events faster than the screen refreshes, and
   * measuring on each of them would mean laying out twenty cards several times
   * for one frame nobody sees. `requestAnimationFrame` is used here as a
   * one-shot — armed by an event, disarmed when it runs — and never as a loop.
   */
  const schedule = useCallback(() => {
    if (typeof window === "undefined") return

    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = 0
      recompute()
    }, SETTLE_MS)

    if (frame.current) return
    frame.current = window.requestAnimationFrame(() => {
      frame.current = 0
      recompute()
    })
  }, [recompute])

  /**
   * `attach` runs from a ref callback, which is before effects have run on the
   * first commit, so it reaches `schedule` through a ref rather than closing
   * over it. That also keeps `attach` — and therefore the cached per-id
   * callbacks below — stable for the life of the hook.
   */
  const scheduleRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])

  /**
   * A changed inset means every card's measurement changed, without any of
   * them moving. Nothing else here would notice — no scroll, no resize, no
   * threshold crossing — so this rings the doorbell itself.
   */
  useEffect(() => {
    insetRef.current = { top: insetTop, bottom: insetBottom }
    scheduleRef.current?.()
  }, [insetTop, insetBottom, insetRef])

  /**
   * Every way the viewport can move, wired once for the whole feed.
   *
   * Each of these is a doorbell; between them they cover the paths that have
   * no wheel event behind them:
   *
   *   · IntersectionObserver — items entering and leaving, and the initial
   *     pass that tells us what is on screen before anything has moved.
   *   · `scroll`, in the CAPTURE phase on the document — scroll events do not
   *     bubble, but they do capture, so one listener here sees a scroll of the
   *     page AND of any nested scroller. This is what covers PageDown, Space,
   *     Home/End, the arrow keys, `scrollIntoView`, anchor navigation, the
   *     position a browser restores on back/forward, "scroll to top" buttons,
   *     and the tail of a momentum scroll.
   *   · `resize` and the visual viewport — the viewport can change without the
   *     document moving at all: a phone's URL bar collapsing, the on-screen
   *     keyboard opening, pinch zoom, a rotation. `visualViewport` is the only
   *     one of these that reports the first two, and it does not exist
   *     everywhere, hence the optional wiring.
   *   · ResizeObserver — a card whose own height changed, and the document
   *     element, which catches content growing above the fold and pushing
   *     everything down. Neither of those scrolls anything.
   *
   * Nothing here depends on a value that changes per render, so the observers
   * and listeners are built once and survive every hand-off. If you add a
   * dependency to this effect, check that it is a ref or a stable callback: an
   * effect that re-runs per render would rebuild the IntersectionObserver per
   * render, and hls.js once fetched 208 playlists for 14 videos that way.
   */
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") return

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(() => schedule(), { threshold: THRESHOLDS })
      observerRef.current = observer
      // Anything registered before the observer existed.
      for (const el of elementToId.keys()) observer.observe(el)
    }

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(() => schedule())
      resizeRef.current = resizeObserver
      resizeObserver.observe(document.documentElement)
      for (const el of elementToId.keys()) resizeObserver.observe(el)
    }

    const ring = () => schedule()
    document.addEventListener("scroll", ring, { capture: true, passive: true })
    window.addEventListener("resize", ring, { passive: true })
    const visual = window.visualViewport
    visual?.addEventListener("resize", ring)
    visual?.addEventListener("scroll", ring)

    // Whatever is already on screen, before anything has had to move.
    schedule()

    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      resizeRef.current?.disconnect()
      resizeRef.current = null
      document.removeEventListener("scroll", ring, { capture: true })
      window.removeEventListener("resize", ring)
      visual?.removeEventListener("resize", ring)
      visual?.removeEventListener("scroll", ring)
      if (frame.current) {
        window.cancelAnimationFrame(frame.current)
        frame.current = 0
      }
      if (settleTimer.current) {
        window.clearTimeout(settleTimer.current)
        settleTimer.current = 0
      }
    }
  }, [enabled, elementToId, schedule])

  /**
   * A hidden tab must stop.
   *
   * Scrolling cannot fire while a tab is in the background, so nothing else
   * here learns that anything changed: without this the last active video
   * keeps playing, keeps sending heartbeats, and keeps crediting the creator
   * with watch time nobody watched. The player element also pauses itself on
   * this event, which is belt and braces, but the coordinator has to agree or
   * it will simply restart it on the next recompute.
   *
   * `pageshow` is the other half of `pagehide`: coming back from the bfcache
   * restores the scroll position without a scroll event and, in some browsers,
   * without a `visibilitychange` either, so it needs its own look.
   */
  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisibility = () => {
      suspended.current = document.visibilityState === "hidden"
      // A frame requested while visible will not run while hidden, and would
      // otherwise block every later `schedule` from arming a new one.
      if (frame.current && typeof window !== "undefined") {
        window.cancelAnimationFrame(frame.current)
        frame.current = 0
      }
      recompute()
    }
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    // A phone locking, or a tab being discarded, does not always produce a
    // visibilitychange first.
    window.addEventListener("pagehide", onVisibility)
    window.addEventListener("pageshow", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onVisibility)
      window.removeEventListener("pageshow", onVisibility)
    }
  }, [recompute])

  /**
   * One ref callback per id, cached — and this is load-bearing, not tidiness.
   *
   * React compares ref callbacks by identity: a new function on a render means
   * "detach the old ref, attach the new one", so it calls the previous one
   * with `null` and the new one with the element, EVERY RENDER. With a fresh
   * closure each time, that is a continuous unregister/re-register cycle —
   * which clears `activeId` (a card that unmounts must hand the crown back),
   * which triggers a render, which does it again. `activeId` ends up null
   * almost always, no video ever plays, and nothing errors.
   *
   * Caching by id makes the callback stable for the life of the item, so React
   * leaves the ref alone and the observer keeps its registration.
   */
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>()).current

  const attach = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      const previous = idToElement.get(id)
      if (previous && previous !== el) {
        observerRef.current?.unobserve(previous)
        resizeRef.current?.unobserve(previous)
        elementToId.delete(previous)
      }

      if (el === null) {
        idToElement.delete(id)
        // A card that unmounts while active must hand the crown back rather
        // than leave a dangling id nothing can pause.
        setActiveId((prev) => (prev === id ? null : prev))
        // …and then someone has to take it, without waiting for a scroll.
        scheduleRef.current?.()
        return
      }

      elementToId.set(el, id)
      idToElement.set(id, el)
      observerRef.current?.observe(el)
      resizeRef.current?.observe(el)
      scheduleRef.current?.()
    },
    [elementToId, idToElement]
  )

  const register = useCallback(
    (id: string) => {
      let fn = callbacks.get(id)
      if (!fn) {
        fn = attach(id)
        callbacks.set(id, fn)
      }
      return fn
    },
    [attach, callbacks]
  )

  return { activeId, register }
}
