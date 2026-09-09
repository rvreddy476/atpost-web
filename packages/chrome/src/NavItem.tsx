"use client"

/**
 * One destination, rendered two ways — and never as a link to nowhere.
 *
 * Both shapes read `isActionable()` from ./destinations and branch on it. That
 * is the whole safety property: an entry with no `href` cannot become an
 * anchor, because the anchor branch is the only one that touches `href` and it
 * is unreachable without one.
 *
 * ── Why a real <a> and never next/link ────────────────────────────────────
 * Every destination that exists lives in a DIFFERENT Next zone behind the
 * shell's rewrite table (/shop on :3001, /apps on :3010, this zone on :3004).
 * A client-side transition to one of those does not merely fail, it resolves
 * the path against this zone's basePath and asks for `/social/shop`. Anchors
 * also keep middle-click and open-in-new-tab working, which navigation
 * between places should.
 *
 * ── Why `aria-disabled` and not `disabled` ────────────────────────────────
 * Straight from packages/ui/src/RoleSwitcher.tsx, which made this decision
 * first and wrote down why: `disabled` removes the control from the focus
 * order, so the explanation is announced to nobody and the entry has been
 * silently dropped again for exactly the people who most need telling. These
 * stay focusable, keep an accessible name, and carry the reason as text a
 * screen reader reaches through `aria-describedby`.
 */

import { useId } from "react"
import { Smartphone } from "lucide-react"
import { isActionable, type AppDestination } from "./destinations"

/* ── The header strip: glyph only, name in the tooltip and the a11y tree ──── */

export function HeaderNavIcon({
  destination,
  current,
}: {
  destination: AppDestination
  current: boolean
}) {
  const Icon = destination.icon
  const reasonId = useId()
  // 40px box, 20px glyph — a comfortable pointer target that still lets seven
  // of them sit in a 56px bar without crowding the wordmark.
  //
  // `shrink-0` is not tidiness. These are flex items, and a flex item's default
  // `min-width: auto` lets `w-10` be overruled by the container: measured at
  // 375px they had been squeezed from 40px to 33px each — under the 44px
  // pointer-target guidance to begin with, and shrinking further exactly where
  // the fingers are biggest. With this, the strip scrolls (the nav owns
  // `overflow-x-auto`) instead of quietly compressing every target.
  const box =
    "grid h-10 w-10 shrink-0 place-items-center rounded-mo-sm transition-colors duration-150 ease-mo"

  if (!isActionable(destination)) {
    return (
      <>
        <span
          role="link"
          aria-disabled="true"
          tabIndex={0}
          aria-label={destination.label}
          aria-describedby={reasonId}
          // #6B658A is 3.57 on #0D0C14 — over the 3.0 non-text bar, and the
          // header is the one surface in this layout that IS #0D0C14. It must
          // not be used on a raised surface (2.61), so this branch has no
          // hover fill.
          className={`${box} cursor-default text-mo-muted-lg`}
        >
          <Icon aria-hidden="true" className="h-5 w-5" />
        </span>
        <span id={reasonId} className="sr-only">
          {destination.unavailableReason}
        </span>
      </>
    )
  }

  return (
    <a
      href={destination.href as string}
      aria-label={destination.label}
      // The page you are on is not a place you can go. `page` rather than
      // `true` because these are locations, and it is what a screen reader
      // announces as "current page".
      aria-current={current ? "page" : undefined}
      className={`${box} ${
        current
          ? // Cyan is the interactive colour, 8.01 on the ground, and this is
            // the only mark in the bar that means "here".
            "bg-mo-surface text-mo-cyan"
          : "text-mo-body hover:bg-mo-surface hover:text-mo-ink"
      }`}
    >
      <Icon aria-hidden="true" className="h-5 w-5" />
    </a>
  )
}

/* ── The left rail: glyph and word, with the reason visible ───────────────── */

export function RailNavItem({
  destination,
  current,
  /**
   * The id of the rail's one shared "these live in the app" note.
   *
   * Straight from RoleSwitcher, which faced the same thing: FOUR destinations
   * here have no web zone, and printing the identical sentence under each of
   * them turns half the rail into the same paragraph repeated. So the row
   * carries a phone glyph — the same `Smartphone` mark, for the same meaning —
   * and points `aria-describedby` at one note below the list. A screen-reader
   * user hears the reason on every row; a sighted one reads it once and
   * recognises the glyph after that. Nobody is left guessing either way.
   */
  reasonId,
}: {
  destination: AppDestination
  current: boolean
  reasonId?: string
}) {
  const Icon = destination.icon
  const row = "flex items-center gap-3 rounded-mo px-3 py-2.5 text-sm transition-colors duration-150 ease-mo"

  if (!isActionable(destination)) {
    return (
      <li>
        <span
          role="link"
          aria-disabled="true"
          tabIndex={0}
          aria-describedby={reasonId}
          className={`${row} cursor-default`}
        >
          <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-mo-muted-lg" />
          {/* The label of a disabled control, which WCAG 1.4.3 exempts — and
              the one job tokens.css lists for this colour by name. */}
          <span className="min-w-0 flex-1 truncate font-semibold text-mo-muted-lg">
            {destination.label}
          </span>
          <Smartphone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-mo-muted-lg" />
        </span>
      </li>
    )
  }

  return (
    <li>
      <a
        href={destination.href as string}
        aria-current={current ? "page" : undefined}
        className={`${row} ${
          current
            ? "bg-mo-surface font-semibold text-mo-cyan"
            : "font-semibold text-mo-ink hover:bg-mo-surface"
        }`}
      >
        <Icon
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 ${current ? "text-mo-cyan" : "text-mo-body"}`}
        />
        <span className="min-w-0">
          <span className="block truncate">{destination.label}</span>
          <span className="block truncate text-xs font-normal text-mo-body">
            {destination.description}
          </span>
        </span>
      </a>
    </li>
  )
}
