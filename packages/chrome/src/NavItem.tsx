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

/**
 * A SOLID, pressable fill whose label is legal as small text in BOTH scopes.
 *
 * ── Why this is not simply `bg-mo-primary text-mo-on-primary` ─────────────
 * Because this package is mounted in one light zone (apps/social) and two dark
 * ones (apps/reels, apps/kwit), and `--mo-primary` is a different colour in
 * each: #0B6B37 green under `.mo-light`, #DC2626 ember red in `:root`. The ink
 * that goes on it flips too — #FFFFFF there, #0D0C14 here — and the dark pair
 * measures **4.03**, which tokens.css states in as many words is
 * LARGE-TEXT-ONLY (>=18.66px bold). A nav row's label is 14px. Writing the
 * obvious two classes would ship an accessibility failure in two zones to buy
 * a filled pill in a third.
 *
 * So the fill is scope-aware. The dark scope keeps the treatment it already
 * had — a raised wash carrying the interactive colour — and the light scope
 * gets the founder's solid green pill with white type:
 *
 *   light:  #FFFFFF on #0B6B37 ............ 6.53   (AA at any size)
 *   dark:   #06B6D4 on #2A2745 ............ 5.86   (AA at any size)
 *
 * `[.mo-light_&]` is an arbitrary Tailwind variant, compiled into whichever
 * zone's stylesheet scans this file — the same mechanism ./AppHeader.tsx uses
 * for the scrollbar, and for the same reason: a package that ships source
 * cannot declare a class in a zone's globals.css. `.mo-light` is a SCOPE and
 * tokens.css documents three places it may sit (html, body, or a section), so
 * a descendant selector is the form that survives all three.
 *
 * Hover is stated twice for the same reason the fill is: a green pill darkens
 * to `--mo-primary-hover`, and a raised wash must not try to.
 */
export const SOLID_ACTION_FILL = [
  "bg-mo-raised text-brand-accent",
  "[.mo-light_&]:bg-mo-primary [.mo-light_&]:text-mo-on-primary",
  "[.mo-light_&]:hover:bg-mo-primary-hover",
].join(" ")

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

/**
 * The trailing mark on a rail row — a pill, a count, or a dot.
 *
 * ── It is a SLOT, and it is empty until something real fills it ───────────
 * The reference the founder supplied carries three of these: a "LIVE" pill on
 * one destination, a count bubble on Messages and a dot on Notifications.
 * Every one of them is a claim about the world, and this client cannot make
 * two of the three today:
 *
 *   · LIVE — live-service has no web client and nothing on the wire tells a
 *     rail which destination is broadcasting.
 *   · Messages — the destination has no web zone at all (see ./destinations),
 *     and there is no unread-conversation count on any route this client can
 *     reach. A bubble there would be a number nobody computed.
 *   · Notifications — real, and the only one of the three that is: the inbox
 *     is `@momentum/notifications` and its unread count is a live number. It
 *     is not a rail ROW though; it is the bell in ./AppHeader, which already
 *     wears the count. Adding a second copy on a row that navigates nowhere
 *     would be one number with two homes.
 *
 * So the mechanism exists and the rail passes what it has. That is the same
 * bargain ./RightRail keeps about invented people: the shape is ready, and
 * nothing is put in it to fill the space.
 *
 * `tone` decides the colour, and the two are not interchangeable:
 *   · "attention" is --mo-accent as a FILL under --mo-on-accent, which is the
 *     one form legal at any size in both scopes (4.72 light, 8.01 dark).
 *     Orange as TEXT is 3.77 on white and is barred below 19px/700.
 *   · "quiet" is a fact rather than an alert — the phone glyph on an app-only
 *     row is one — and takes --mo-muted-lg, which is non-text-only and legal
 *     on the page ground this rail sits on (3.93 light, 3.56 dark).
 */
export interface NavMark {
  kind: "pill" | "count" | "dot"
  /** The pill's word, or the count. Ignored by "dot". */
  text?: string
  tone: "attention" | "quiet"
  /** What a screen reader is told, when the glyph alone would say nothing. */
  srLabel?: string
}

function RailMark({ mark }: { mark: NavMark }) {
  const attention = mark.tone === "attention"

  if (mark.kind === "dot") {
    return (
      <>
        <span
          aria-hidden="true"
          className={[
            "h-2 w-2 shrink-0 rounded-mo-pill",
            attention ? "bg-mo-accent" : "bg-mo-muted-lg",
          ].join(" ")}
        />
        {mark.srLabel && <span className="sr-only">{mark.srLabel}</span>}
      </>
    )
  }

  return (
    <>
      <span
        aria-hidden="true"
        className={[
          "shrink-0 rounded-mo-pill px-1.5 py-0.5 text-[11px] font-bold leading-none",
          mark.kind === "count" ? "tabular-nums" : "uppercase tracking-mo-eyebrow",
          attention
            ? // The FILL form. See the note on NavMark: orange may not carry
              // small text, and this is small text — so it is the ground.
              "bg-mo-accent text-mo-on-accent"
            : "bg-mo-raised text-mo-body",
        ].join(" ")}
      >
        {mark.text}
      </span>
      {mark.srLabel && <span className="sr-only">{mark.srLabel}</span>}
    </>
  )
}

export function RailNavItem({
  destination,
  current,
  mark,
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
  /** The trailing mark, when there is a real one. See `NavMark`. */
  mark?: NavMark
  reasonId?: string
}) {
  const Icon = destination.icon
  /**
   * A full-width pill — ONE LINE, an icon and a label, and nothing else.
   *
   * ── The description under each label is gone ──────────────────────────
   * "Your feed", "Short video", "Long video", "Questions and answers". Each
   * row was two lines and about 75px tall, so eight destinations came to 600px
   * of rail. The founder's word for them is the right one: in a rail, beside a
   * labelled icon, they are noise. "Reels / Short video" tells somebody who
   * does not already know almost nothing, and somebody who does know reads the
   * label alone.
   *
   * `AppDestination.description` STAYS in ./destinations.ts rather than being
   * deleted with the markup that drew it. It is real copy about what each zone
   * is, the mini-app launcher and a future empty state are plausible homes for
   * it, and a data file is where it costs nothing to keep.
   *
   * `min-h-[44px]` is the pointer floor and now also the height: one line of
   * 14px text at `py-2.5` lands there exactly, which is what makes eight rows
   * read as a list rather than as eight cards.
   *
   * `rounded-mo-pill` rather than `rounded-mo`: the reference makes every
   * control fully rounded and keeps the card radius for cards, so a row and a
   * card are told apart by their corners rather than by a border.
   */
  const row =
    "flex min-h-[44px] items-center gap-3 rounded-mo-pill px-3 py-2.5 text-sm transition-colors duration-150 ease-mo"

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
          {mark ? (
            <RailMark mark={mark} />
          ) : (
            <Smartphone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-mo-muted-lg" />
          )}
        </span>
      </li>
    )
  }

  return (
    <li>
      <a
        href={destination.href as string}
        aria-current={current ? "page" : undefined}
        // The row you are on is a SOLID pill now, not a wash — the founder's
        // one correction to the reference is that every filled thing is green,
        // and the selected destination is one of them. `SOLID_ACTION_FILL`
        // carries the whole argument, including why the dark zones keep the
        // wash rather than taking a red fill a 14px label cannot sit on.
        className={`${row} ${
          current
            ? `${SOLID_ACTION_FILL} font-semibold`
            : "font-semibold text-mo-ink hover:bg-mo-raised"
        }`}
      >
        <Icon
          aria-hidden="true"
          // On the solid pill the glyph is the label's own colour — white in a
          // light zone — so `currentColor` rather than a second token, which
          // is also what stops the two disagreeing when the scope changes.
          className={`h-5 w-5 shrink-0 ${current ? "" : "text-mo-body"}`}
        />
        <span className="min-w-0 flex-1 truncate">{destination.label}</span>
        {mark && <RailMark mark={mark} />}
      </a>
    </li>
  )
}
