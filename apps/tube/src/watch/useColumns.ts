"use client"

/**
 * The measured half of ./columns.ts. Read that file first — it is where the
 * argument for measuring the container instead of the viewport is written down.
 */

import { useEffect, useState } from "react"
import { watchColumns, type WatchColumns } from "./columns"

/**
 * Watch an element's width and say how the page should be laid out in it.
 *
 * ── "stacked" until measured, and never the other way round ───────────────
 * The first render — on the server and in the browser — has no element and no
 * width, so it is stacked. A page that guessed "split" and corrected would draw
 * a recommendations rail beside a 200px player for one frame, which on a page
 * whose subject is a picture is the visible kind of wrong.
 *
 * ── Only the DECISION is state, not the width ─────────────────────────────
 * Storing the pixel width would re-render this page on every frame of a window
 * drag. The layout has two values; that is all anything downstream can use.
 *
 * ── ResizeObserver, not a window listener ─────────────────────────────────
 * The container can change width without the window doing anything — the frame
 * around it gains a rail at its own breakpoints, a scrollbar appears, the shell
 * is rebuilt to a different track. A `resize` listener misses all of those, and
 * a page that only re-lays-out when the window moves is one that is wrong until
 * you jiggle it.
 */
export function useColumns(element: HTMLElement | null): WatchColumns {
  const [columns, setColumns] = useState<WatchColumns>("stacked")

  useEffect(() => {
    if (!element) {
      setColumns("stacked")
      return
    }
    // Old Safari and some embedded webviews have no ResizeObserver. One
    // measurement is better than none: the layout is then decided at mount and
    // simply does not follow later changes.
    if (typeof ResizeObserver === "undefined") {
      setColumns(watchColumns(element.getBoundingClientRect().width))
      return
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (typeof width !== "number") return
      const next = watchColumns(width)
      setColumns((prev) => (prev === next ? prev : next))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])

  return columns
}
