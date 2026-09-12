"use client"

/**
 * The countdown, wired to a clock, a tab and a keyboard.
 *
 * Everything that can be decided without a browser is in ./autoplayNext.ts.
 * This file is the parts that need one: a one-second interval while counting,
 * `visibilitychange` so a hidden tab pauses the count, Escape to cancel, and
 * the navigation when the count reaches zero.
 *
 * ── Escape is claimed at the WINDOW, in the capture phase ─────────────────
 * ./useExpand.ts also listens for Escape, on `document` in capture, to leave
 * theatre mode. Two capture listeners on the same node run in registration
 * order and `stopPropagation` does not stop the second one; only
 * `stopImmediatePropagation` does, and only if this one registered first,
 * which it cannot promise (theatre is entered before the video ends). The
 * window is one hop ABOVE the document in the capture path, so a listener
 * there runs before any document listener regardless of order, and stopping
 * propagation there is enough. One press of Escape while counting cancels
 * the countdown and leaves the theatre where it was; a second press leaves
 * the theatre. Two different things, two presses.
 *
 * ── The navigation is `router.push`, not a Link ───────────────────────────
 * Because nothing was clicked. The path is zone-relative (`watchHref`), which
 * `next/navigation` prefixes with the basePath exactly as `next/link` would;
 * an absolute "/tube/{id}" here would ask for "/tube/tube/{id}".
 */

import { useCallback, useEffect, useReducer, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  AUTOPLAY_IDLE,
  reduceAutoplay,
  shouldOfferCountdown,
  type AutoplayState,
  type AutoplayTarget,
} from "./autoplayNext"
import { watchHref } from "./links"

export interface AutoplayNextInput {
  /** `playhead.ended`: true from the element's `ended` until it plays or seeks. */
  ended: boolean
  /** The episode after this one, or null. From `nextEpisode` in ./links.ts. */
  next: AutoplayTarget | null
  /** The viewer's "Autoplay next episode" preference. */
  enabled: boolean
  /** `prefers-reduced-motion`, as read once on mount by the page. */
  reducedMotion: boolean
}

export interface AutoplayNext {
  state: AutoplayState
  /** Stop the count. Sticky for this view; see ./autoplayNext.ts. */
  cancel: () => void
  /** Go to the next episode now, without waiting. */
  playNow: () => void
}

export function useAutoplayNext(input: AutoplayNextInput): AutoplayNext {
  const { ended, next, enabled, reducedMotion } = input
  const router = useRouter()
  const [state, dispatch] = useReducer(reduceAutoplay, AUTOPLAY_IDLE)

  /**
   * The inputs, readable at event time.
   *
   * The `ended` effect below must not depend on `next` or `enabled`: a rail
   * that finishes loading while the video is already ended would otherwise
   * re-run it and start a countdown for a video that ended a minute ago.
   * `ended` is the one edge that means "the video just finished", so it is
   * the one dependency, and the rest is read through a ref.
   */
  const latest = useRef({ next, enabled, reducedMotion })
  latest.current = { next, enabled, reducedMotion }

  useEffect(() => {
    if (!ended) {
      dispatch({ type: "playing" })
      return
    }
    const { next: target, enabled: on, reducedMotion: less } = latest.current
    dispatch({
      type: "ended",
      next: target,
      enabled: shouldOfferCountdown({ next: target, enabled: on, reducedMotion: less }),
      visible: typeof document === "undefined" || document.visibilityState !== "hidden",
    })
  }, [ended])

  /** The preference switched off mid-count is a cancel, and it is sticky too. */
  useEffect(() => {
    if (!enabled && state.kind === "counting") dispatch({ type: "cancel" })
  }, [enabled, state.kind])

  const counting = state.kind === "counting"

  /** The clock. One tick a second, only while counting. */
  useEffect(() => {
    if (!counting) return
    const id = window.setInterval(() => dispatch({ type: "tick" }), 1_000)
    return () => window.clearInterval(id)
  }, [counting])

  /** The tab. */
  useEffect(() => {
    if (!counting) return
    const onChange = () => {
      dispatch({ type: document.visibilityState === "hidden" ? "hidden" : "visible" })
    }
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [counting])

  /** The keyboard. See the header for why the window and why capture. */
  useEffect(() => {
    if (!counting) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      event.preventDefault()
      event.stopPropagation()
      dispatch({ type: "cancel" })
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [counting])

  /**
   * Zero. Navigate, once.
   *
   * `fired` is terminal in the reducer, so this effect runs exactly once per
   * view even if the element reports `ended` again while the route changes.
   */
  useEffect(() => {
    if (state.kind !== "fired") return
    router.push(watchHref(state.target.post_id))
  }, [state, router])

  const cancel = useCallback(() => dispatch({ type: "cancel" }), [])

  const playNow = useCallback(() => {
    const target = state.kind === "counting" ? state.target : latest.current.next
    if (!target) return
    // Cancel first so the interval cannot fire a second push while the first
    // navigation is in flight; `cancelled` ignores every later event.
    dispatch({ type: "cancel" })
    router.push(watchHref(target.post_id))
  }, [router, state])

  return { state, cancel, playNow }
}
