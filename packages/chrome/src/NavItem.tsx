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
  // 44px box, 20px glyph. It was 40, which is under the pointer-target
  // guidance it was already citing two lines down — the box was sized to let
  // seven of them sit in the bar rather than to be hit, and below 1024 this
  // strip is the ONLY navigation on the page, so it is the phone case that
  // governs. Seven 44px targets are 308px; the strip scrolls at 360 and fits
  // outright from about 480 up, which is the trade the `overflow-x-auto` on
  // the nav was always there to make.
  //
  // `shrink-0` is not tidiness, and it is what makes the 44 above real. These
  // are flex items, and a flex item's default `min-width: auto` lets the width
  // be overruled by the container: measured at 375px they had been squeezed
  // from 40px to 33px each — under the pointer-target guidance to begin with,
  // and shrinking further exactly where the fingers are biggest. With this, the
  // strip scrolls (the nav owns `overflow-x-auto`) instead of quietly
  // compressing every target.
  const box =
    "grid h-11 w-11 shrink-0 place-items-center rounded-mo-sm transition-colors duration-150 ease-mo"

  if (!isActionable(destination)) {
    return (
      <>
        <span
          role="link"
          aria-disabled="true"
          tabIndex={0}
          aria-label={destination.label}
          aria-describedby={reasonId}
          // --mo-muted-lg on the page ground, which is the one ground it is
          // allowed on in EITHER scope: #6B658A on #0D0C14 is 3.56 and #74847C
          // on #FFFFFF is 3.93, both over the 3.0 a non-text mark needs, and
          // the header is the one surface in this layout that IS --mo-bg.
          // The dark value collapses to 2.61 on --mo-raised and is barred
          // there; the light value would survive it at 3.55. This branch keeps
          // no hover fill either way — one rule, and it is the stricter
          // scope's.
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
      // Two token swaps, and each fixes something that was invisible in one
      // scope rather than merely off-palette.
      //
      // FILL: `bg-mo-surface` -> `bg-mo-raised`. --mo-surface is 1.19 against
      // the dark ground, which was a faint but real "here"; in a light zone it
      // is #FFFFFF, the same white as the header, so the selected destination
      // had no fill AT ALL. --mo-raised is the token whose documented job is
      // exactly this — a hover or a nested step — and it reads on both:
      // #2A2745 is 1.36 against #0D0C14 and #F1F4F2 is 1.10 against #FFFFFF.
      // Small numbers, because a selected-tab wash is meant to be; the
      // difference is that neither of them is 1.00.
      //
      // MARK: `text-mo-cyan` -> `text-brand-accent`, which is --mo-cyan in
      // :root and --mo-primary (green) under `.mo-light` — i.e. "the
      // interactive colour of whichever scope this is". tokens.css moves that
      // role off cyan in a light zone and onto green, and an active NAV item
      // is named in the list of jobs green takes. Cyan there means --mo-info.
      //   dark:  #06B6D4 on #2A2745 ... 5.86
      //   light: #0B6B37 on #F1F4F2 ... 5.97
      className={`${box} ${
        current
          ? "bg-mo-raised text-brand-accent"
          : "text-mo-body hover:bg-mo-raised hover:text-mo-ink"
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
  // `min-h-[44px]`: a rail row is two lines of text and already taller than
  // that at the default font, but a destination whose description is empty is
  // one line and was 38px. The floor makes the row height independent of the
  // copy, which is also what keeps the list's rhythm even.
  const row =
    "flex min-h-[44px] items-center gap-3 rounded-mo px-3 py-2.5 text-sm transition-colors duration-150 ease-mo"

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
              the one job tokens.css lists for this colour by name. The rail
              sits on the page ground in both scopes, which is where this
              colour is legal: 3.56 dark, 3.93 light. */}
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
        // Same two swaps as the header strip above, for the same two reasons:
        // --mo-surface is the page's own white in a light zone, so the "here"
        // row had no fill; and cyan is not the interactive colour there.
        // --brand-accent is #06B6D4 in :root and #0B6B37 under `.mo-light`.
        //   dark:  #06B6D4 on #2A2745 raised ... 5.86
        //   light: #0B6B37 on #F1F4F2 raised ... 5.97
        className={`${row} ${
          current
            ? "bg-mo-raised font-semibold text-brand-accent"
            : "font-semibold text-mo-ink hover:bg-mo-raised"
        }`}
      >
        <Icon
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 ${current ? "text-brand-accent" : "text-mo-body"}`}
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
