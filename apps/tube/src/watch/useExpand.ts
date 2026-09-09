"use client"

/**
 * The expand control, wired to a real element.
 *
 * Everything that can be decided without a browser is in ./expand.ts, which is
 * also where the argument for the Fullscreen API over a theatre ROUTE is
 * written down. This file is only the parts that need a DOM: asking the
 * element whether it can go fullscreen, asking it to, and — the half that is
 * easy to forget — noticing when it comes back WITHOUT being asked.
 *
 * ── The state is the browser's, not ours ──────────────────────────────────
 * `fullscreenchange` is the source of truth for the `fullscreen` mode, never
 * the click that started it. There are at least four ways out of fullscreen
 * that this component does not initiate — Escape, F11, the browser's own exit
 * control, and a tab switch on some platforms — and a mode held from the click
 * alone would leave the label reading "Exit full video" over a player that is
 * back in the page, with no way to fix it but pressing the button twice.
 *
 * ── The request can be refused, and refusal is silent ─────────────────────
 * `requestFullscreen()` returns a promise that REJECTS — it does not throw —
 * inside a cross-origin iframe without `allow="fullscreen"`, under some
 * enterprise policies, and when the call is not attributed to a user gesture.
 * Nothing appears in the console. So the rejection is caught and the theatre
 * fallback is used instead: the button that would otherwise have done nothing
 * visible still makes the video fill the window.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { collapsesOnKey, expandTarget, locksDocumentScroll, type ExpandMode } from "./expand"

/** The class app/globals.css hangs the document-scroll lock on. */
const BODY_LOCK = "tube-theatre-open"

export interface Expand {
  mode: ExpandMode
  /** Attach to the player's box. The element that is expanded, not the video. */
  ref: (el: HTMLElement | null) => void
  toggle: () => void
}

export function useExpand(): Expand {
  const [mode, setMode] = useState<ExpandMode>("inline")
  const boxRef = useRef<HTMLElement | null>(null)

  const ref = useCallback((el: HTMLElement | null) => {
    boxRef.current = el
  }, [])

  /**
   * Follow the browser out of fullscreen however it happened.
   *
   * The listener is on `document`, which is where the spec fires it — an
   * element listener works too, but only while the element is the fullscreen
   * one, so it misses the exit if anything else on the page took over. The
   * check is against `document.fullscreenElement` rather than a flag of ours,
   * because that is the only thing that is right in every one of the four exit
   * paths above.
   */
  useEffect(() => {
    const onChange = () => {
      const fs = document.fullscreenElement
      setMode((prev) => {
        if (fs && fs === boxRef.current) return "fullscreen"
        // Left fullscreen. Theatre is a state this event knows nothing about
        // and must not clear, or entering theatre would immediately undo
        // itself on browsers that fire a spurious change event.
        return prev === "fullscreen" ? "inline" : prev
      })
    }
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  /** Escape, for the theatre mode only. ./expand.ts says why not for both. */
  useEffect(() => {
    if (mode !== "theatre") return
    const onKey = (event: KeyboardEvent) => {
      if (
        !collapsesOnKey(mode, event.key, {
          ctrl: event.ctrlKey,
          meta: event.metaKey,
          alt: event.altKey,
          shift: event.shiftKey,
        })
      ) {
        return
      }
      event.preventDefault()
      setMode("inline")
    }
    // Capture, so the key is claimed before anything inside the overlay —
    // including the player's own key handling — can swallow it. Leaving a
    // full-window overlay must not be defeatable by what has focus inside it.
    document.addEventListener("keydown", onKey, true)
    return () => document.removeEventListener("keydown", onKey, true)
  }, [mode])

  /**
   * The document-scroll lock, and its cleanup.
   *
   * The cleanup is the point. A class left on <body> by a navigation away from
   * an expanded player is a page that silently cannot be scrolled, on a route
   * that has nothing to do with this one — and nothing about it looks like an
   * error.
   */
  useEffect(() => {
    if (!locksDocumentScroll(mode)) return
    document.body.classList.add(BODY_LOCK)
    return () => document.body.classList.remove(BODY_LOCK)
  }, [mode])

  const toggle = useCallback(() => {
    const box = boxRef.current
    if (!box) return

    // Collapsing.
    if (mode === "fullscreen") {
      // Guarded: exitFullscreen() rejects when nothing is fullscreen, and the
      // `fullscreenchange` handler above may already have taken us out.
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      else setMode("inline")
      return
    }
    if (mode === "theatre") {
      setMode("inline")
      return
    }

    // Expanding. The capability is read from THIS element rather than from a
    // user-agent string, because that is the thing that will or will not
    // answer the call.
    const canFullscreen = typeof box.requestFullscreen === "function"
    if (expandTarget(canFullscreen) === "theatre") {
      setMode("theatre")
      return
    }

    // `mode` is not set optimistically here: `fullscreenchange` sets it, so
    // the label can never claim a fullscreen the browser did not grant.
    void box.requestFullscreen().catch(() => {
      // Refused, silently, as it is on iOS and inside a locked-down iframe.
      // The button still has to do something visible.
      setMode("theatre")
    })
  }, [mode])

  return { mode, ref, toggle }
}
