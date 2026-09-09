"use client"

/**
 * One rail row, in the two widths the rail has — and never a link to nowhere.
 *
 * Both shapes read `isActionable()` from ./rail and branch on it, which is the
 * whole safety property: a row with no `href` cannot become an anchor, because
 * the anchor branch is the only one that touches `href` and it is unreachable
 * without one.
 *
 * ── `next/link` inside the zone, a plain `<a>` outside it ─────────────────
 * The opposite rule from @momentum/chrome's NavItem.tsx, and for the same
 * underlying arithmetic. That component links only to OTHER zones, so it uses
 * a plain `<a>` for everything. This one is Tube's own rail: Home,
 * Subscriptions and a channel are routes of THIS Next app, so a client
 * transition is both correct and the reason moving between them keeps the
 * shell mounted and feels instant. `Back to Momentum` and `Sign in` are not,
 * and `next/link` would prefix this zone's basePath and ask for
 * `/tube/social`. `item.external` is the flag that decides, and it is set in
 * the data rather than guessed from the string.
 *
 * ── `aria-disabled` and not `disabled` ────────────────────────────────────
 * Straight from packages/ui/src/RoleSwitcher.tsx, which made the decision
 * first and wrote down why: `disabled` removes the control from the focus
 * order, so the explanation is announced to nobody and the row has been
 * silently dropped again for exactly the people who most need telling. These
 * stay focusable, keep an accessible name, and carry the reason through
 * `aria-describedby`.
 */

import { useId } from "react"
import Link from "next/link"
import { isActionable, type TubeRailItem } from "./rail"

/* The one focus treatment, so a keyboard user sees the same ring on every
   row whichever branch drew it. */
const FOCUS =
  "outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"

export function RailRow({
  item,
  current,
  collapsed,
  onNavigate,
}: {
  item: TubeRailItem
  current: boolean
  /** The icon rail: a glyph with a small word under it, YouTube's mini shape. */
  collapsed?: boolean
  /** Close the drawer when a row inside it is taken. Absent in the column. */
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const reasonId = useId()
  // The short form is a VISUAL substitution only. Both branches below carry
  // the full `label` as the accessible name — through `aria-label` on the
  // disabled branch and through `title` plus the link's own text on the live
  // one — so a screen reader hears "Back to Momentum" at either width. See
  // `shortLabel` in ./rail.ts.
  const word = (collapsed && item.shortLabel) || item.label

  // Set ONLY when the visible word is the short one. An `aria-label` that
  // repeats the text it sits on is noise, and `aria-label` is the one
  // attribute that silently overrides content a sighted user can read — so it
  // is `undefined` in the ordinary case rather than a duplicate.
  //
  // Declared here, above the early return below, and not beside the anchors:
  // a `const` used before its declaration in the same function scope is a
  // ReferenceError at runtime, which TypeScript does not always catch across a
  // branch.
  const fullName = word === item.label ? undefined : item.label

  const shape = collapsed
    ? // 64px tall, centred, with the label under the glyph. The label stays —
      // an icon-only rail is a memory test, and YouTube's own mini rail keeps
      // the word for the same reason.
      "flex w-full flex-col items-center gap-1 rounded-mo px-1 py-3 text-center text-[10px] leading-tight"
    : "flex w-full items-center gap-4 rounded-mo px-3 py-2.5 text-sm"

  const base = `${shape} transition-colors duration-150 ease-mo ${FOCUS}`

  if (!isActionable(item)) {
    return (
      <li>
        <span
          role="link"
          aria-disabled="true"
          aria-label={fullName}
          tabIndex={0}
          aria-describedby={reasonId}
          className={`${base} cursor-default text-mo-body`}
        >
          <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
          {/* --mo-body and not --mo-muted-lg. The rail sits on the page
              ground where muted-lg measures 3.57 — fine for a glyph, and this
              is 13px and 10px TEXT. tokens.css is explicit that small
              secondary text is --mo-body, and WCAG's exemption for a disabled
              control's label is a licence rather than an instruction. */}
          <span className={collapsed ? "block w-full truncate" : "min-w-0 flex-1 truncate"}>
            {word}
          </span>
        </span>
        <span id={reasonId} className="sr-only">
          {item.unavailableReason}
        </span>
      </li>
    )
  }

  const href = item.href as string
  const tone = current
    ? // Cyan is the interactive colour and the raised fill is the only mark in
      // this rail that means "here".
      "bg-mo-raised font-semibold text-mo-ink"
    : "text-mo-ink hover:bg-mo-surface"

  const inner = (
    <>
      <Icon
        aria-hidden="true"
        className={`h-5 w-5 shrink-0 ${current ? "text-mo-cyan" : "text-mo-body"}`}
      />
      <span className={collapsed ? "block w-full truncate" : "min-w-0 flex-1 truncate"}>
        {word}
      </span>
    </>
  )

  return (
    <li>
      {item.external ? (
        <a
          href={href}
          aria-label={fullName}
          className={`${base} ${tone}`}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
        >
          {inner}
        </a>
      ) : (
        <Link
          href={href}
          aria-label={fullName}
          // `page` rather than `true` because these are locations, and it is
          // what a screen reader announces as "current page".
          aria-current={current ? "page" : undefined}
          className={`${base} ${tone}`}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
        >
          {inner}
        </Link>
      )}
    </li>
  )
}
