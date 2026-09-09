"use client"

/**
 * "For You | Following | HashTag" — the strip under the Home heading.
 *
 * ── The real tab pattern, not three buttons ───────────────────────────────
 * `role="tablist"` over `role="tab"` over a `role="tabpanel"`, with a roving
 * tabindex. That is a specific bargain with the reader and it is worth naming,
 * because "three buttons that swap a list" looks identical on screen and is a
 * different thing to use:
 *
 *   · The strip is ONE tab stop, not three. Tab moves past the whole thing to
 *     the first post; the arrow keys move between sections. That is the point
 *     of a roving tabindex — a nav bar that costs three presses to skip is a
 *     nav bar every keyboard reader pays for on every visit.
 *   · A screen reader says "Following, tab, 2 of 3, selected", so the shape of
 *     the choice is audible before anything is pressed.
 *   · `aria-controls` ties each tab to the panel below it, so the relationship
 *     survives being read out of order.
 *
 * Activation is AUTOMATIC — an arrow key selects as it moves, rather than only
 * moving focus and waiting for Enter. The APG's caution about automatic
 * activation is aimed at panels that are slow to display; these are not. A tab
 * that has been opened before replays its cached posts with no request at all,
 * and one that has not shows its skeleton immediately, so arrowing across the
 * strip is never a wait. Passing THROUGH Following on the way to HashTag does
 * start Following's first fetch — which is a page the reader is one keystroke
 * from wanting, already warm if they come back.
 *
 * ── The underline is the label's width, not the column's ──────────────────
 * Same decision Android made, and for the same reason its file gives: a bar
 * spanning the full third under a short word reads as a border rather than as
 * a selection. It is always laid out and merely transparent when inactive, so
 * the label does not shift by two pixels as the selection moves.
 *
 * ── Sticky, and what that costs the player ────────────────────────────────
 * The strip pins under the header, which means it occludes the top of the feed
 * exactly as the header does. `top` is passed in rather than written here as
 * `top-14`: the header measures at 56.67px on the live page, `top-14` is 56px,
 * and the difference is a sliver of a scrolling post visible above a bar that
 * is meant to cover it. The caller already measures the header for the autoplay
 * coordinator; this uses that same number, so there is one measurement and not
 * a constant that can drift from it. `onHeightChange` reports back what this
 * strip itself adds, which the caller owes the coordinator — see the note on
 * `useTopChromeInset` in HomeFeed.tsx.
 */

import { useCallback, useEffect, useRef } from "react"
import { FEED_TABS, type FeedTabId } from "./tabs"

export function tabId(id: FeedTabId): string {
  return `feed-tab-${id}`
}

export function panelId(id: FeedTabId): string {
  return `feed-panel-${id}`
}

export interface FeedTabsProps {
  selected: FeedTabId
  onSelect: (id: FeedTabId) => void
  /** Pixels of chrome above this strip. The header's measured bottom edge. */
  top: number
  /** Called with this strip's own height whenever it changes, including 0 on unmount. */
  onHeightChange: (height: number) => void
}

export function FeedTabs({ selected, onSelect, top, onHeightChange }: FeedTabsProps) {
  const buttons = useRef(new Map<FeedTabId, HTMLButtonElement | null>()).current
  const strip = useRef<HTMLDivElement | null>(null)

  /**
   * Measured, not assumed — the same discipline the header inset is held to.
   * A `ResizeObserver` rather than one reading on mount, because the strip's
   * height moves with the font (a fallback face is a different cap height) and
   * with the breakpoint, and the coordinator's inset has to move with it or
   * videos start playing behind a bar.
   */
  useEffect(() => {
    const el = strip.current
    if (!el) return
    const report = () => onHeightChange(el.getBoundingClientRect().height)
    report()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => {
      observer.disconnect()
      // Unmounted: this strip no longer covers anything, and leaving a stale
      // height behind would keep insetting the player for chrome that is gone.
      onHeightChange(0)
    }
  }, [onHeightChange])

  const focusTab = useCallback(
    (id: FeedTabId) => {
      buttons.get(id)?.focus()
      onSelect(id)
    },
    [buttons, onSelect]
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const index = FEED_TABS.findIndex((t) => t.id === selected)
      if (index === -1) return

      let next: number | null = null
      switch (event.key) {
        // Wrapping, which the APG specifies as optional and which is the right
        // option here: three tabs is short enough that the end of the strip is
        // a place you arrive at rather than a wall you meant to stop against.
        case "ArrowRight":
          next = (index + 1) % FEED_TABS.length
          break
        case "ArrowLeft":
          next = (index - 1 + FEED_TABS.length) % FEED_TABS.length
          break
        case "Home":
          next = 0
          break
        case "End":
          next = FEED_TABS.length - 1
          break
        default:
          return
      }

      // Only after a key we handled: `preventDefault` on Home/End otherwise
      // takes the page's scroll-to-top away from someone who was not aiming at
      // the tabs at all.
      event.preventDefault()
      focusTab(FEED_TABS[next].id)
    },
    [selected, focusTab]
  )

  return (
    <div
      ref={strip}
      // `bg-mo-bg` is not decoration: a transparent strip pinned over a
      // scrolling column shows the posts sliding underneath the labels.
      // z-30 sits below the header's z-40, so the two overlap in the right
      // order during the frame before `top` has been measured.
      className="sticky z-30 mb-5 bg-mo-bg"
      style={{ top }}
    >
      <div
        role="tablist"
        aria-label="Feed sections"
        onKeyDown={onKeyDown}
        className="flex border-b border-mo"
      >
        {FEED_TABS.map((tab) => {
          const active = tab.id === selected
          return (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.set(tab.id, el)
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-controls={panelId(tab.id)}
              aria-selected={active}
              aria-label={tab.accessibleLabel}
              // The roving half: exactly one tab is reachable by Tab, and it is
              // the selected one, so returning to the strip returns to where
              // the reader left it.
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(tab.id)}
              className="flex flex-1 cursor-default justify-center py-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mo"
            >
              <span className="inline-flex flex-col items-center">
                <span
                  className={[
                    "text-sm font-semibold transition-colors duration-150 ease-mo",
                    active ? "text-mo-ink" : "text-mo-body",
                  ].join(" ")}
                >
                  {tab.label}
                </span>
                {/*
                  Cyan is this product's interactive colour and an underline is
                  not text, so it is safe at any size here (7.9 on the ground).
                  Always present, transparent when inactive — see the note above.
                */}
                <span
                  aria-hidden="true"
                  className={[
                    "mt-1.5 h-0.5 w-full rounded-mo-pill",
                    active ? "bg-mo-cyan" : "bg-transparent",
                  ].join(" ")}
                />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
