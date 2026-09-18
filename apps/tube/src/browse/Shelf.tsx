"use client"

/**
 * A shelf: a heading, a row that scrolls sideways, and a way to see all of it.
 *
 * ── Why a shelf and not another grid ──────────────────────────────────────
 * The grid is the page's CONTENT — an unbounded, ranked, paged list of
 * everything. A shelf is a bounded aside about one thing: what you were
 * watching, what is short. Drawing either as a grid would make the page three
 * grids stacked, and nothing on it would say which of the three is the answer
 * to "what should I watch". YouTube's Shorts shelf and RUTUBE's "Watching" row
 * are both this shape, and both for that reason.
 *
 * ── It scrolls, and the scroll is reachable without a mouse ───────────────
 * `overflow-x-auto` alone is a trap: a trackpad and a touchscreen can push it,
 * a keyboard cannot, and a scroll container with no focusable child is not in
 * the tab order at all. Two things fix that here, and both are needed:
 *
 *   · every tile is a link, so Tab walks the row and the browser scrolls the
 *     focused tile into view by itself.
 *   · the two chevron buttons, which are `aria-hidden` and `tabIndex={-1}`
 *     BECAUSE of the point above — they are a mouse affordance for a scroll a
 *     keyboard already has a better way to drive, and putting them in the tab
 *     order would mean two stops before the first video on every shelf.
 *
 * `scroll-smooth` is paired with `motion-reduce:scroll-auto`. tokens.css
 * already forces `scroll-behavior: auto` under `prefers-reduced-motion` for
 * everything inside `.mo-root`, and the utility is kept anyway: this component
 * should not depend on being mounted inside that class to respect the setting.
 *
 * ── "View all" is a real destination or it is absent ──────────────────────
 * Never a disabled pill and never a `#`. The Shorts shelf's goes to the reels
 * zone; continue-watching's goes to /history, which is the full list of the
 * same rows. A shelf with no honest "all" simply has no pill.
 */

import { useCallback, useRef } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * How far a chevron press moves the row: most of the visible width, not all of
 * it. A full-width jump leaves nothing on screen that was there before, which
 * is how somebody loses their place in a row of pictures.
 */
const SCROLL_FRACTION = 0.8

export function Shelf({
  title,
  /** Said under the heading, when the shelf needs a sentence. */
  note,
  /** Where "View all" goes, or null for no pill. Zone-relative unless external. */
  allHref,
  allLabel = "View all",
  allExternal = false,
  children,
}: {
  title: string
  note?: string
  allHref?: string | null
  allLabel?: string
  /** True for a cross-zone href, which must be a plain `<a>`. */
  allExternal?: boolean
  children: React.ReactNode
}) {
  const scroller = useRef<HTMLUListElement | null>(null)

  const nudge = useCallback((direction: -1 | 1) => {
    const node = scroller.current
    if (!node) return
    node.scrollBy({ left: direction * node.clientWidth * SCROLL_FRACTION, behavior: "smooth" })
  }, [])

  const chevron =
    "grid h-8 w-8 place-items-center rounded-mo-pill border border-mo text-mo-body " +
    "transition-colors duration-150 ease-mo hover:border-mo-strong hover:text-mo-ink"

  return (
    // A section with an accessible name, so the shelf is a landmark a screen
    // reader can jump to rather than an unlabelled run of links in the page.
    <section aria-labelledby={`shelf-${slug(title)}`} className="mb-8">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`shelf-${slug(title)}`}
            className="font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink"
          >
            {title}
          </h2>
          {note && <p className="mt-0.5 text-xs text-mo-body">{note}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {allHref &&
            (allExternal ? (
              /* A plain <a>: the reels zone is a different Next app behind the
                 shell's rewrite table, and next/link would ask for
                 /tube/reels. ../chrome/links.ts has the rule. */
              <a href={allHref} className={PILL}>
                {allLabel}
              </a>
            ) : (
              /* Inside the zone, so a client transition is right and Next adds
                 the basePath itself — a literal "/tube/history" here would ask
                 for "/tube/tube/history". */
              <Link href={allHref} className={PILL}>
                {allLabel}
              </Link>
            ))}
          {/* Hidden from assistive tech on purpose — see the header. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => nudge(-1)}
            className={`hidden sm:grid ${chevron}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => nudge(1)}
            className={`hidden sm:grid ${chevron}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <ul
        ref={scroller}
        // `-mx-1 px-1` so a focus ring on the first and last tile is not
        // clipped by the scroll container's own edge, which is the commonest
        // way a horizontal row loses its visible focus state.
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 motion-reduce:scroll-auto"
      >
        {children}
      </ul>
    </section>
  )
}

/** The pill "View all" wears. One string, so the two branches cannot drift. */
const PILL =
  "rounded-mo-pill border border-mo-strong px-3 py-1.5 text-xs font-semibold text-mo-cyan " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"

/** A heading's id, so `aria-labelledby` does not carry spaces or punctuation. */
function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

/**
 * The loading state: tiles of the right shape, so nothing below jumps.
 *
 * `ratio` is the aspect class rather than a number, because the two shelves
 * on Home are different shapes — 16:9 for a long video, 9:16 for a short —
 * and a skeleton whose shape disagrees with what arrives is worse than none.
 */
export function ShelfSkeleton({
  count = 6,
  ratio = "aspect-video",
  width = "w-[260px]",
}: {
  count?: number
  ratio?: string
  width?: string
}) {
  return (
    <ul aria-hidden="true" className="-mx-1 flex gap-4 overflow-hidden px-1 pb-2">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`${width} shrink-0 animate-pulse motion-reduce:animate-none`}>
          <div className={`${ratio} w-full rounded-mo bg-mo-raised`} />
          <div className="mt-2 h-3.5 w-4/5 rounded bg-mo-raised" />
          <div className="mt-2 h-3 w-2/5 rounded bg-mo-raised" />
        </li>
      ))}
    </ul>
  )
}
