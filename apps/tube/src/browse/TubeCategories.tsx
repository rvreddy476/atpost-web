"use client"

/**
 * The chip rail across the top of the home grid.
 *
 *     [ All ] [ Subscriptions ] [ Comedy ] [ Music ] [ Dance ] [ Food ] …
 *
 * ── The vocabulary is the server's, and it is the phone's too ─────────────
 * `GET /v1/posts/categories` answers `[{id,label}]` and the ids are what
 * `?category=` on the video feed takes. It is the SAME call the Android
 * client's chip rail makes (`categories()` in `core/feed/data/VideoFeedApi.kt`
 * behind `tubeChips`), so the two clients cannot drift about what a category
 * is called or which ones exist. Nothing here invents, hardcodes or
 * prettifies a label.
 *
 * ── All and Subscriptions are not categories ──────────────────────────────
 * They are the two NARROWINGS the feed endpoint understands that the taxonomy
 * does not describe, and they sit in the same rail because to a person they
 * are the same act. They are constructed rather than fetched, they are always
 * present, and "Subscriptions" is only offered to a signed-in viewer — for an
 * anonymous browser the page is reading the public shelf, which has no
 * subscription graph to narrow by, so the chip would be a control that could
 * not work. It asks for the same list the Subscriptions page in the left rail
 * shows (`subscribed_only=true`), under the same word; ./chips.ts has the
 * note on why it stopped being "Following".
 *
 * ── The rail scrolls; it never wraps and it never shrinks ─────────────────
 * `overflow-x-auto` with `shrink-0` on every chip. A wrapping rail is two and
 * then three rows tall as the taxonomy grows, which pushes the grid down the
 * page by a different amount at every window width. Shrinking chips is worse:
 * measured on @momentum/chrome's icon strip at 375px, flex items with the
 * default `min-width: auto` were squeezed from 40px to 33px — under the
 * pointer-target guidance to begin with, and smallest exactly where fingers
 * are biggest.
 *
 * ── A failed taxonomy is not a failed page ────────────────────────────────
 * An empty list and a failed list are treated identically: the rail renders
 * All (and Subscriptions) alone. A chip rail is a narrowing of something already
 * on screen, so its absence costs a filter and not the videos.
 */

import { useEffect, useState } from "react"
import { fetchCategories, type TubeCategory } from "@/tube/channelApi"
// The chip vocabulary and its translation to wire parameters are in
// ./chips.ts, which is pure and therefore testable without a DOM. This file is
// the rail's rendering.
import { ALL_CHIP, SUBSCRIPTIONS_CHIP, chipKey, chipLabel, type TubeChip } from "./chips"

export { ALL_CHIP, SUBSCRIPTIONS_CHIP, chipKey, chipLabel }
export type { TubeChip }

export function useCategories(): TubeCategory[] {
  const [categories, setCategories] = useState<TubeCategory[]>([])

  useEffect(() => {
    let live = true
    fetchCategories()
      .then((rows) => {
        if (live) setCategories(rows)
      })
      .catch(() => {
        // The rail renders All alone. See the header — a filter that could
        // not be offered is not a page that could not be drawn.
      })
    return () => {
      live = false
    }
  }, [])

  return categories
}

export function TubeCategories({
  categories,
  selected,
  signedIn,
  onSelect,
}: {
  categories: readonly TubeCategory[]
  selected: TubeChip
  signedIn: boolean
  onSelect: (chip: TubeChip) => void
}) {
  const chips: TubeChip[] = [
    ALL_CHIP,
    ...(signedIn ? [SUBSCRIPTIONS_CHIP] : []),
    ...categories.map((category) => ({ kind: "category", id: category.id }) as TubeChip),
  ]
  const currentKey = chipKey(selected)

  return (
    <div
      // A group of related controls rather than a landmark: this narrows the
      // list below it, it does not navigate.
      role="group"
      aria-label="Filter videos"
      // ── Sticky, under the 56px top bar ─────────────────────────────────
      // `top-14` is that bar's height, so the rail parks directly beneath it
      // instead of scrolling away — which is what YouTube does and what makes
      // the filter reachable from row twelve of an infinite grid rather than
      // only from the top of the page.
      //
      // The opaque background is not decoration: a sticky element over a
      // scrolling grid with a transparent ground shows the posters sliding
      // through the chips. `-mx-4 px-4` (and `sm:-mx-6 sm:px-6`) makes that
      // ground reach the edges of the content track, whose padding the shell
      // applies outside this component — without it the chips sit on a band
      // narrower than the page and the gap either side shows the grid moving.
      //
      // `z-20` is below the top bar's `z-40` and below the card menu's `z-30`,
      // so this rail can cover neither. A sticky filter that painted over an
      // open menu in the first row would be a control eating the control it
      // just opened.
      className="sticky top-14 z-20 -mx-4 mb-5 flex gap-2 overflow-x-auto bg-mo-bg px-4 pb-2 pt-1 sm:-mx-6 sm:px-6"
    >
      {chips.map((chip) => {
        const key = chipKey(chip)
        const current = key === currentKey
        return (
          <button
            key={key}
            type="button"
            // `aria-pressed` and not `aria-current`: these are toggles over
            // one list, not places you are at. A screen reader announces
            // "Comedy, pressed", which is what has actually happened.
            aria-pressed={current}
            onClick={() => onSelect(chip)}
            className={[
              "h-9 shrink-0 whitespace-nowrap rounded-mo-pill px-4 text-sm font-semibold",
              "transition-colors duration-150 ease-mo",
              "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
              current
                ? // The selected chip inverts, YouTube's own treatment, and
                  // the one that survives at a glance across a scrolling rail
                  // where a border alone does not.
                  "bg-mo-ink text-mo-bg"
                : "bg-mo-surface text-mo-ink hover:bg-mo-raised",
            ].join(" ")}
          >
            {chipLabel(chip, categories)}
          </button>
        )
      })}
    </div>
  )
}
