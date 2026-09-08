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
 *   · scrolled away        — the observer stops seeing enough of it
 *   · the tab went away    — `visibilitychange`, which scrolling never fires,
 *                            so a video in a background tab would otherwise
 *                            play to nobody and bill the creator for it
 *   · reduced motion       — nothing ever becomes active
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
}

const THRESHOLDS = [0, 0.1, 0.25, 0.4, 0.6, 0.75, 0.9, 1]

/**
 * How much of what COULD be on screen is on screen, 0..1.
 *
 * NOT `entry.intersectionRatio`, which is a fraction of the ELEMENT — and that
 * is unusable here. A portrait flick renders around 900px tall in a 570px
 * column; on a laptop viewport its intersectionRatio can never reach 0.6
 * however carefully it is centred, because 60% of the card is more pixels than
 * the window has. The observed symptom is a feed where no video ever plays and
 * nothing anywhere reports an error.
 *
 * Measuring against `min(element, viewport)` asks the question that actually
 * matters — "is this thing filling the screen?" — and gives the same answer as
 * intersectionRatio for anything that fits.
 */
function visibleFraction(entry: IntersectionObserverEntry): number {
  const elementHeight = entry.boundingClientRect.height
  const viewportHeight =
    entry.rootBounds?.height ?? (typeof window === "undefined" ? 0 : window.innerHeight)
  const measurable = Math.min(elementHeight || 0, viewportHeight || 0)
  if (measurable <= 0) return entry.intersectionRatio
  return Math.min(1, entry.intersectionRect.height / measurable)
}

export function useAutoplayCoordinator(options: AutoplayOptions = {}): AutoplayCoordinator {
  const { enabled = true, minRatio = 0.6 } = options

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
   * So the ratios live in a ref and never cause a render. The one thing worth
   * re-rendering for is which item should be playing.
   */
  const [activeId, setActiveId] = useState<string | null>(null)

  /**
   * The binding that makes the whole thing safe. An element resolves to the id
   * it registered with — not to a position in anything.
   */
  const elementToId = useRef(new Map<Element, string>()).current
  const idToElement = useRef(new Map<string, Element>()).current
  const ratios = useRef(new Map<string, number>()).current
  const observerRef = useRef<IntersectionObserver | null>(null)
  /** Set while the tab is hidden, so nothing becomes active behind our back. */
  const suspended = useRef(false)

  /**
   * Pick the winner from the ratios we currently hold.
   *
   * Highest ratio wins; a tie goes to whichever element's centre is nearest
   * the viewport's. Ties are common with two equal-height cards straddling the
   * middle of a tall window, and without the tiebreak the winner is decided by
   * Map insertion order — which is to say, by scroll history.
   */
  const recompute = useCallback(() => {
    if (!enabled || suspended.current) {
      setActiveId((prev) => (prev === null ? prev : null))
      return
    }

    let bestId: string | null = null
    let bestRatio = 0
    let bestDistance = Number.POSITIVE_INFINITY
    const viewportCentre =
      typeof window === "undefined" ? 0 : window.innerHeight / 2

    for (const [id, ratio] of ratios) {
      if (ratio < minRatio) continue
      const el = idToElement.get(id)
      if (!el) continue
      const box = el.getBoundingClientRect()
      const distance = Math.abs(box.top + box.height / 2 - viewportCentre)

      if (ratio > bestRatio + 0.001) {
        bestId = id
        bestRatio = ratio
        bestDistance = distance
      } else if (Math.abs(ratio - bestRatio) <= 0.001 && distance < bestDistance) {
        bestId = id
        bestRatio = ratio
        bestDistance = distance
      }
    }

    setActiveId((prev) => (prev === bestId ? prev : bestId))
  }, [enabled, minRatio, idToElement, ratios])

  useEffect(() => {
    if (!enabled || typeof IntersectionObserver === "undefined") return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Read the id off the measured element. Never an index.
          const id = elementToId.get(entry.target)
          if (!id) continue
          ratios.set(id, visibleFraction(entry))
        }
        recompute()
      },
      { threshold: THRESHOLDS }
    )
    observerRef.current = observer

    // Anything registered before the observer existed.
    for (const el of elementToId.keys()) observer.observe(el)

    return () => {
      observer.disconnect()
      observerRef.current = null
    }
  }, [enabled, elementToId, ratios, recompute])

  /**
   * A hidden tab must stop.
   *
   * Scrolling cannot fire while a tab is in the background, so the observer
   * never learns anything changed: without this the last active video keeps
   * playing, keeps sending heartbeats, and keeps crediting the creator with
   * watch time nobody watched. The player element also pauses itself on this
   * event, which is belt and braces, but the coordinator has to agree or it
   * will simply restart it on the next recompute.
   */
  useEffect(() => {
    if (typeof document === "undefined") return
    const onVisibility = () => {
      suspended.current = document.visibilityState === "hidden"
      recompute()
    }
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    // A phone locking, or a tab being discarded, does not always produce a
    // visibilitychange first.
    window.addEventListener("pagehide", onVisibility)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("pagehide", onVisibility)
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
        elementToId.delete(previous)
      }

      if (el === null) {
        idToElement.delete(id)
        ratios.delete(id)
        // A card that unmounts while active must hand the crown back rather
        // than leave a dangling id nothing can pause.
        setActiveId((prev) => (prev === id ? null : prev))
        return
      }

      elementToId.set(el, id)
      idToElement.set(id, el)
      observerRef.current?.observe(el)
    },
    [elementToId, idToElement, ratios]
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
