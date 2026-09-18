"use client"

/**
 * Videos · Shorts · Playlists · About — a real tab strip, made of real links.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO THINGS THAT USUALLY FIGHT, AND HOW THEY ARE BOTH KEPT
 *
 * A channel's Shorts tab has to be a URL. `?tab=shorts` is what makes it
 * linkable, bookmarkable, openable in a new tab and reachable with the back
 * button, and it is what lets the rail's own "Playlists" row point straight
 * at `/@you?tab=playlists`. That wants anchors.
 *
 * It also has to be a tab strip in the sense a screen-reader user means: one
 * tab stop for the whole group, arrow keys between the tabs inside it, and a
 * panel that announces which tab it belongs to. That wants `role="tab"`, and
 * `role="tab"` is a PROMISE about the keyboard — which is exactly why the
 * first version of this page refused the role and used `aria-current="page"`
 * on a `<nav>` instead. That was honest and it was less than the founder
 * asked for.
 *
 * So both: anchors with real hrefs, wearing the tab roles, with the keyboard
 * behaviour implemented rather than implied.
 *
 *   · ROVING TABINDEX. The selected tab is `tabIndex=0` and the rest are -1,
 *     so Tab lands on the strip once and moves past it, instead of costing
 *     four tab stops on the way to the grid.
 *   · ARROW KEYS MOVE AND ACTIVATE. Automatic activation, the WAI-ARIA
 *     default for a small strip whose panels are cheap: the next tab is
 *     focused and navigated to in the same keystroke. Manual activation
 *     (arrow to move, Enter to open) exists for strips whose panels are
 *     expensive to build, and would here mean a focused tab that is not the
 *     selected tab — two highlights, and a person who arrows away and never
 *     presses Enter looking at a page that disagrees with itself.
 *   · `preventDefault` ONLY on keys the strip claims. `tabAfterKey` in
 *     ./tabs.ts answers null for everything else, so Tab, Enter and type-ahead
 *     are never swallowed.
 *
 * ── Focus is moved by hand, and it has to be ──────────────────────────────
 * `router.push` re-renders this component with a new `current`, but React
 * does not move the caret for a navigation — so without the explicit
 * `.focus()` the keyboard user would activate a tab and then find focus still
 * sitting on the one they left. The element is focused FIRST and navigated
 * second, so focus lands even if the transition is slow.
 *
 * ── `next/link`, because these are routes of this same app ────────────────
 * The transition is client-side and the header above does not re-fetch — the
 * one thing that makes tab switching feel like a tab strip rather than four
 * page loads. Cross-zone links would have to be plain `<a>`; none of these are.
 */

import { useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CHANNEL_TABS,
  CHANNEL_TAB_LABEL,
  channelTabHref,
  tabAfterKey,
  tabId,
  tabPanelId,
  type ChannelTab,
} from "./tabs"

/**
 * A tab's count, drawn beside its label, or nothing.
 *
 * Nothing for null, which is "we could not read it" and never zero — the rule
 * ../tube/channels.ts sets for `subscriber_count` and the same reason: a
 * "Shorts 0" produced by a failed side request is a false statement about
 * somebody's channel, while a bare "Shorts" has only said less. Zero itself
 * IS drawn, because a channel that genuinely has no shorts is a fact the tab
 * may as well tell you before you press it.
 *
 * `aria-hidden` on the number and the true count folded into the tab's own
 * accessible name, so a screen reader announces "Shorts, 4, tab" once rather
 * than reading a bare numeral after the label.
 */
function tabName(tab: ChannelTab, count: number | null): string {
  return count === null ? CHANNEL_TAB_LABEL[tab] : `${CHANNEL_TAB_LABEL[tab]}, ${count}`
}

export function ChannelTabs({
  base,
  current,
  counts,
}: {
  /** The channel's own URL, zone-relative. `channelTabHref` builds from it. */
  base: string
  current: ChannelTab
  /** A number per tab, or null where there is none to state. */
  counts?: Partial<Record<ChannelTab, number | null>>
}) {
  const router = useRouter()
  const refs = useRef<Partial<Record<ChannelTab, HTMLAnchorElement | null>>>({})

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLAnchorElement>) => {
      const next = tabAfterKey(current, event.key)
      // Null means this strip does not claim the key. Leave it entirely alone
      // — swallowing Tab here would trap focus in the tab strip.
      if (!next || next === current) {
        if (next === current) event.preventDefault()
        return
      }
      event.preventDefault()
      // Focus first: the navigation may take a beat, and a keyboard user must
      // never be left with focus on the tab they just moved away from.
      refs.current[next]?.focus()
      router.push(channelTabHref(base, next))
    },
    [base, current, router]
  )

  return (
    <div
      role="tablist"
      aria-label="Channel sections"
      className="mo-hscroll mb-6 flex gap-1 overflow-x-auto border-b border-mo"
    >
      {CHANNEL_TABS.map((tab) => {
        const active = tab === current
        const count = counts?.[tab] ?? null
        return (
          <Link
            key={tab}
            ref={(node) => {
              refs.current[tab] = node
            }}
            id={tabId(tab)}
            role="tab"
            aria-selected={active}
            aria-controls={tabPanelId(tab)}
            // The whole strip is ONE tab stop. See the header.
            tabIndex={active ? 0 : -1}
            // The count is in the name rather than read as a stray numeral.
            aria-label={tabName(tab, count)}
            href={channelTabHref(base, tab)}
            onKeyDown={onKeyDown}
            className={[
              "inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-semibold",
              "transition-colors duration-150 ease-mo",
              "outline-offset-[-2px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo",
              active ? "text-mo-ink" : "border-transparent text-mo-body hover:text-mo-ink",
            ].join(" ")}
            // The underline is cyan — the palette's interactive colour — and
            // there is no `border-mo-cyan` utility: @momentum/tokens names
            // cyan under `colors`, not under `borderColor`, whose four entries
            // are line / line-strong / focus / gold. An inline style reaches
            // the variable honestly rather than adding a fifth border token
            // for one underline. Unchanged from the strip this replaced.
            style={active ? { borderBottomColor: "rgb(var(--mo-cyan))" } : undefined}
          >
            <span aria-hidden="true">{CHANNEL_TAB_LABEL[tab]}</span>
            {count !== null && (
              <span aria-hidden="true" className="text-xs tabular-nums text-mo-body">
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

/**
 * The panel the selected tab controls.
 *
 * `tabIndex={0}` because the panel holds a grid whose own contents are
 * focusable but whose first element may be far down: the ARIA pattern makes
 * the panel itself focusable so that Tab out of the strip lands IN the
 * section rather than skipping to whatever comes after it.
 *
 * One panel is rendered, not four with three hidden, because three hidden
 * panels would be three tabs' worth of fetching for a person looking at one.
 */
export function ChannelTabPanel({
  tab,
  children,
}: {
  tab: ChannelTab
  children: React.ReactNode
}) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(tab)}
      aria-labelledby={tabId(tab)}
      tabIndex={0}
      className="outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
    >
      {children}
    </div>
  )
}
