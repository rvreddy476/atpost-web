"use client"

/**
 * How long each item was actually on screen.
 *
 * This is what an `impression` is: not "was rendered", which is true of things
 * three screens below the fold, but "was visible, and for how long". A feed
 * that reported an impression per rendered card would inflate every creator's
 * reach by whatever the page size happens to be, and the number would get
 * worse the more aggressively the list prefetched.
 *
 * ── Bound to ids, like everything else here ───────────────────────────────
 * Same discipline as the autoplay coordinator, for the same reason: an element
 * is bound to its stable id when it registers and every measurement reads the
 * id off the element that was measured. Nothing in this file indexes a list.
 *
 * ── Reported on the way OUT ───────────────────────────────────────────────
 * The duration is only known when viewing stops, so the callback fires when an
 * item leaves the screen — and on `pagehide`, because closing the tab is the
 * commonest way a view of the last post ends and it would otherwise never be
 * counted at all.
 *
 * A hidden tab is not viewing. The accumulator stops on `visibilitychange`
 * exactly as playback does, or every backgrounded tab would report hours.
 *
 * ── Why this measures rectangles instead of reading `intersectionRatio` ───
 * It used to compare `entry.intersectionRatio` against 0.5, and that was two
 * bugs, both of which under-count impressions — which is worse than it sounds,
 * because impressions are the DENOMINATOR of CQS and CQS sets the creator
 * fund's quality multiplier. A missing impression inflates every per-impression
 * rate computed from it.
 *
 *   1. `intersectionRatio` is a fraction of the ELEMENT. A card taller than
 *      the window can never reach 0.5 of ITSELF however it is scrolled — a
 *      1200px flick in a 900px window tops out at 0.75, and one in a 570px
 *      column tops out at 0.475 and so NEVER registered an impression at all.
 *      Measured live at 1440×900: a 1200px card walked through every scroll
 *      offset reached a maximum intersectionRatio of 0.750, and a 2000px one
 *      reached 0.450 — under the bar at every single offset. The same
 *      correction @momentum/player made for autoplay applies here, so this
 *      imports the SAME function rather than growing a second answer to it:
 *      normalise against `min(element, visible band)`.
 *   2. The viewport is not all visible. A sticky header covers the top of it,
 *      and pixels behind chrome were being counted as seen. See `ViewportInset`
 *      in @momentum/player.
 *
 * Changing the metric means the observer's thresholds no longer bracket the
 * decision — for a tall card the 0.5 crossing happens at an element ratio the
 * observer was never asked about, which is precisely the silent gap the
 * coordinator's header describes at length. So the observer stops being a
 * measurement and becomes a DOORBELL, alongside scroll, resize and the visual
 * viewport, and every decision is made from a live `getBoundingClientRect()`.
 * All of them coalesce into one measurement per painted frame plus one more
 * when motion stops; there is no loop and no interval here, and there must not
 * be one — an idle feed has to cost nothing.
 */

import { useCallback, useEffect, useRef } from "react"
import { visibleFraction, type ViewportInset } from "@momentum/player"

/** Below this an impression is noise, and the server's own floor. */
const MIN_REPORTABLE_MS = 1_000
/** The server rejects anything above ten minutes. */
const MAX_REPORTABLE_MS = 600_000
/**
 * Half on screen is "seen". Lower than the autoplay bar, deliberately.
 *
 * Half of what CAN be seen — `visibleFraction`, normalised against
 * `min(card, visible band)` — and not half of the card, which is a different
 * number for anything taller than the window and an unreachable one for
 * anything twice as tall. Exported so the test binds to the real bar.
 */
export const VISIBLE_RATIO = 0.5

/**
 * Wake-up points, not decision points — the same spread the coordinator uses
 * and for the same reason. Nothing is decided from these numbers.
 */
const THRESHOLDS = [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1]

/**
 * One more look this long after the last doorbell, in ms.
 *
 * A smooth scroll or a fling can come to rest between two frames, and the
 * resting position is the one someone actually reads from. Re-armed by every
 * doorbell, so it never fires during motion and fires exactly once after it.
 */
const SETTLE_MS = 150

interface Dwell {
  since: number | null
  accumulated: number
  reported: boolean
}

export interface DwellTracker {
  register: (id: string) => (el: HTMLElement | null) => void
  /** Report everything still open — call before navigating away. */
  flushAll: () => void
}

export interface DwellOptions {
  /**
   * The parts of the window covered by chrome, in layout pixels. Pixels behind
   * a sticky header are not on screen and must not earn an impression.
   */
  viewportInset?: ViewportInset
}

export function useDwellTracker(
  onDwell: (id: string, visibleMs: number) => void,
  options: DwellOptions = {}
): DwellTracker {
  // Two numbers, not the object: an inset written inline at the call site is a
  // new object on every render, and an object in a dependency array here would
  // rebuild the observer and every listener several times a second.
  const insetTop = options.viewportInset?.top ?? 0
  const insetBottom = options.viewportInset?.bottom ?? 0

  const elementToId = useRef(new Map<Element, string>()).current
  const idToElement = useRef(new Map<string, Element>()).current
  const dwells = useRef(new Map<string, Dwell>()).current
  const observerRef = useRef<IntersectionObserver | null>(null)
  const resizeRef = useRef<ResizeObserver | null>(null)
  /** Set while the tab is hidden, so nothing accumulates behind our back. */
  const suspended = useRef(false)
  const frame = useRef(0)
  const settleTimer = useRef(0)
  const insetRef = useRef<ViewportInset>({ top: insetTop, bottom: insetBottom })

  // Held in a ref so a caller passing an inline arrow does not rebuild the
  // observer on every render and lose every part-finished measurement.
  const onDwellRef = useRef(onDwell)
  onDwellRef.current = onDwell

  const stateFor = useCallback(
    (id: string): Dwell => {
      let d = dwells.get(id)
      if (!d) {
        d = { since: null, accumulated: 0, reported: false }
        dwells.set(id, d)
      }
      return d
    },
    [dwells]
  )

  const stop = useCallback(
    (id: string, report: boolean) => {
      const d = dwells.get(id)
      if (!d) return
      if (d.since !== null) {
        d.accumulated += performance.now() - d.since
        d.since = null
      }
      if (!report || d.reported) return
      const ms = Math.round(Math.min(d.accumulated, MAX_REPORTABLE_MS))
      if (ms >= MIN_REPORTABLE_MS) {
        d.reported = true
        onDwellRef.current(id, ms)
      }
    },
    [dwells]
  )

  /**
   * Measure every registered card and start or stop its clock.
   *
   * One `getBoundingClientRect()` per card, reads only and no writes between
   * them, so the browser answers the lot from a single layout.
   */
  const recompute = useCallback(() => {
    if (typeof window === "undefined") return
    if (suspended.current) return

    const viewportHeight = window.innerHeight
    for (const [id, el] of idToElement) {
      const rect = el.getBoundingClientRect()
      // A detached or `display: none` element measures 0×0. That is not
      // "entirely visible because none of its zero pixels are hidden".
      const fraction =
        rect.height <= 0 && rect.width <= 0
          ? 0
          : visibleFraction({ top: rect.top, height: rect.height }, viewportHeight, insetRef.current)

      const d = stateFor(id)
      if (fraction >= VISIBLE_RATIO) {
        if (d.since === null && !d.reported) d.since = performance.now()
      } else if (d.since !== null) {
        stop(id, true)
      }
    }
  }, [idToElement, stateFor, stop])

  /** Coalesce every doorbell into one measurement per painted frame. */
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
   * Reached through a ref because `attach` runs from a ref callback, which is
   * before effects have run on the first commit.
   */
  const scheduleRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    scheduleRef.current = schedule
  }, [schedule])

  /** A changed inset changes every measurement without anything moving. */
  useEffect(() => {
    insetRef.current = { top: insetTop, bottom: insetBottom }
    scheduleRef.current?.()
  }, [insetTop, insetBottom, insetRef])

  /**
   * The doorbells. Same set as the coordinator's, for the same reason: none of
   * them is trusted to say what the geometry is, so no single one has to be
   * complete. `scroll` is in the capture phase on the document because scroll
   * events do not bubble but do capture, which is what catches PageDown, an
   * anchor jump, a restored scroll position and a nested scroller with one
   * listener for the whole feed.
   */
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(() => schedule(), { threshold: THRESHOLDS })
      observerRef.current = observer
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
  }, [elementToId, schedule])

  /** A tab nobody is looking at is not viewing anything. */
  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden"
      suspended.current = hidden
      if (hidden) {
        // A frame requested while visible will not run while hidden, and would
        // otherwise block every later `schedule` from arming a new one.
        if (typeof window !== "undefined" && frame.current) {
          window.cancelAnimationFrame(frame.current)
          frame.current = 0
        }
        for (const id of dwells.keys()) stop(id, true)
      } else {
        // Coming back does not resume a reported view; a fresh one starts only
        // if the card is still there and still unreported.
        scheduleRef.current?.()
      }
    }
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [dwells, stop])

  const flushAll = useCallback(() => {
    for (const id of dwells.keys()) stop(id, true)
  }, [dwells, stop])

  useEffect(() => {
    if (typeof window === "undefined") return
    const onLeave = () => flushAll()
    window.addEventListener("pagehide", onLeave)
    return () => window.removeEventListener("pagehide", onLeave)
  }, [flushAll])

  /**
   * Cached per id, for the reason spelled out in @momentum/player's
   * coordinator: React re-attaches a ref whose callback identity changed, so
   * an uncached closure detaches and re-attaches every element on every
   * render. Here that would end a dwell measurement (an unmount is a view
   * ending) and start a fresh one several times a second, so no item would
   * ever accumulate the one second an impression needs.
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
        // Unmounting mid-view is still a view. Report it before losing it.
        stop(id, true)
        idToElement.delete(id)
        return
      }
      elementToId.set(el, id)
      idToElement.set(id, el)
      observerRef.current?.observe(el)
      resizeRef.current?.observe(el)
      scheduleRef.current?.()
    },
    [elementToId, idToElement, stop]
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

  return { register, flushAll }
}
