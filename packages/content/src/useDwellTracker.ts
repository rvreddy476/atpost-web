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
 */

import { useCallback, useEffect, useRef } from "react"

/** Below this an impression is noise, and the server's own floor. */
const MIN_REPORTABLE_MS = 1_000
/** The server rejects anything above ten minutes. */
const MAX_REPORTABLE_MS = 600_000
/** Half on screen is "seen". Lower than the autoplay bar, deliberately. */
const VISIBLE_RATIO = 0.5

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

export function useDwellTracker(
  onDwell: (id: string, visibleMs: number) => void
): DwellTracker {
  const elementToId = useRef(new Map<Element, string>()).current
  const idToElement = useRef(new Map<string, Element>()).current
  const dwells = useRef(new Map<string, Dwell>()).current
  const observerRef = useRef<IntersectionObserver | null>(null)

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

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = elementToId.get(entry.target)
          if (!id) continue
          const d = stateFor(id)
          const visible = entry.intersectionRatio >= VISIBLE_RATIO

          if (visible && d.since === null) {
            d.since = performance.now()
          } else if (!visible && d.since !== null) {
            stop(id, true)
          }
        }
      },
      { threshold: [0, VISIBLE_RATIO, 1] }
    )
    observerRef.current = observer
    for (const el of elementToId.keys()) observer.observe(el)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [elementToId, stateFor, stop])

  /** A tab nobody is looking at is not viewing anything. */
  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden"
      for (const [id, d] of dwells) {
        if (hidden) {
          stop(id, true)
        } else if (d.since === null && !d.reported && idToElement.has(id)) {
          // Coming back does not resume a reported view; a fresh one starts
          // when the observer next says it is visible.
          d.since = null
        }
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [dwells, idToElement, stop])

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
