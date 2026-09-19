"use client"

/**
 * "For You | Following" — the strip at the top of the centre column.
 *
 * ── Two tabs, and the third thing that used to be one ─────────────────────
 * The founder's third change. HashTag was never a third timeline — it is the
 * day's trending tags, each opening its own post list — and it now lives
 * behind the sliders control at the right of this strip rather than pretending
 * to be a section of the feed. Its URL is untouched (`?tab=hashtag`), so every
 * link anybody has already sent still lands where it did; ./tabs.ts carries
 * the split between "what a URL may say" and "what the strip draws".
 *
 * ── The shape is the reference's: one rounded container ───────────────────
 * A card holding two pills and, pushed to the far right inside the same
 * container, two small round icon buttons. The selected tab is a SOLID green
 * pill with white type and the other is plain text — the founder's first
 * change applied to the one mark on this page that used to be orange.
 * tokens.css lists "the active tab's indicator or underline" among
 * --mo-accent's jobs, and that is still true of an UNDERLINE; this is not an
 * underline any more, it is a filled, pressable pill, and the same file is
 * emphatic that nothing orange may be pressable.
 *
 * ── The real tab pattern, not two buttons ─────────────────────────────────
 * `role="tablist"` over `role="tab"` over a `role="tabpanel"`, with a roving
 * tabindex. That is a specific bargain with the reader and it is worth naming,
 * because "two buttons that swap a list" looks identical on screen and is a
 * different thing to use:
 *
 *   · The strip is ONE tab stop, not two. Tab moves past the whole thing to
 *     the first post; the arrow keys move between sections.
 *   · A screen reader says "Following, tab, 2 of 2, selected", so the shape of
 *     the choice is audible before anything is pressed.
 *   · `aria-controls` ties each tab to the panel below it, so the relationship
 *     survives being read out of order.
 *
 * The two icon buttons are deliberately OUTSIDE the `tablist`: they are not
 * tabs, they select no panel, and putting them inside would make a screen
 * reader count four tabs and let an arrow key land on one.
 *
 * Activation is AUTOMATIC — an arrow key selects as it moves rather than only
 * moving focus and waiting for Enter. The APG's caution about automatic
 * activation is aimed at panels that are slow to display; these are not. A tab
 * that has been opened before replays its cached posts with no request at all,
 * and one that has not shows its skeleton immediately.
 *
 * ── Sticky, and what that costs the player ────────────────────────────────
 * The strip pins under the header, which means it occludes the top of the feed
 * exactly as the header does. `top` is passed in rather than written here as
 * `top-14`: the header measures at 56.67px on the live page, `top-14` is 56px,
 * and the difference is a sliver of a scrolling post visible above a bar that
 * is meant to cover it. `onHeightChange` reports what this strip itself adds,
 * which the caller owes the autoplay coordinator — see the note on
 * `useTopChromeInset` in HomeFeed.tsx.
 */

import { useCallback, useEffect, useRef } from "react"
import { Bookmark, SlidersHorizontal } from "lucide-react"
import { SOLID_ACTION_FILL } from "@momentum/chrome"
import { FEED_TABS, type FeedTabId } from "./tabs"

export function tabId(id: FeedTabId): string {
  return `feed-tab-${id}`
}

export function panelId(id: FeedTabId): string {
  return `feed-panel-${id}`
}

/**
 * Why the bookmark control says something rather than doing something.
 *
 * ── Saved posts exist on the wire and have no page on the web ─────────────
 * `POST`/`DELETE /v1/posts/{id}/bookmark` is what the action bar's Save writes
 * and it works — every card in this feed can be saved today. The LIST is a
 * different route, `GET /v1/saved`, and it answers rows of
 * `{id, target_type, target_id, collection_name}`: ids, with no post hydrated
 * on any of them. Turning that into a readable list means one
 * `GET /v1/posts/{id}` per row and a whole second timeline surface on top of
 * it, which is a page and not a button.
 *
 * The three options were a dead button, a link to a page that does not exist,
 * and this. The rule this codebase keeps — @momentum/chrome's destinations,
 * @atpost/ui's RoleSwitcher — is that an unavailable thing stays present,
 * keeps its name and its place in the focus order, and SAYS why.
 */
export const SAVED_REASON =
  "Saving works on every post here. The list of what you have saved is only in the Momentum app so far."

export interface FeedTabsProps {
  selected: FeedTabId
  onSelect: (id: FeedTabId) => void
  /** Opens the trending-tag browser — the view that used to be the third tab. */
  onBrowseTags: () => void
  /** Puts a sentence in the feed's live region. See `SAVED_REASON`. */
  onSay: (text: string) => void
  /** Pixels of chrome above this strip. The header's measured bottom edge. */
  top: number
  /** Called with this strip's own height whenever it changes, including 0 on unmount. */
  onHeightChange: (height: number) => void
}

export function FeedTabs({
  selected,
  onSelect,
  onBrowseTags,
  onSay,
  top,
  onHeightChange,
}: FeedTabsProps) {
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
      // -1 is the tag browser, which is not in the strip. Arrowing from there
      // has no "next" to move to, and silently selecting For You would be the
      // strip navigating on its own.
      if (index === -1) return

      let next: number | null = null
      switch (event.key) {
        // Wrapping, which the APG specifies as optional and which is the right
        // option here: two tabs is short enough that the end of the strip is a
        // place you arrive at rather than a wall you meant to stop against.
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

  /**
   * ── This strip ALWAYS has exactly one tab marked ──────────────────────
   * It did not, and the founder caught it: at `?tab=hashtag` both tabs were
   * plain text and neither was selected, so the page looked like a tab control
   * that had lost its state. That is fixed in the CALLER rather than here —
   * the tag browser is no longer rendered under this strip at all (see
   * HomeFeed's `browsingTags` branch, which replaces it with a heading and a
   * way back). This component is therefore only ever rendered for one of the
   * two real tabs, and the assertion below says so.
   *
   * A defensive fallback rather than a crash: an id that is not in the strip
   * would otherwise mark nothing, which is precisely the state this is
   * closing. `DEFAULT_TAB` is what `readRoute` falls back to for an unknown
   * `tab=` and it is what this falls back to for the same reason.
   */
  const marked: FeedTabId = FEED_TABS.some((t) => t.id === selected) ? selected : FEED_TABS[0].id

  // One class for both trailing controls, so they cannot drift apart. 44px
  // square: the pointer floor, and the same box the header's own icons use.
  const iconButton =
    "grid h-11 w-11 shrink-0 cursor-default place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mo"

  return (
    <div
      ref={strip}
      // `bg-mo-bg` is not decoration: a transparent strip pinned over a
      // scrolling column shows the posts sliding underneath the labels. It is
      // the PAGE colour on purpose — this zone is light, so the strip is white
      // over a white feed and the container below carries the whole boundary.
      //
      // z-30 sits below the header's z-40, so the two overlap in the right
      // order during the frame before `top` has been measured.
      className="sticky z-30 mb-5 bg-mo-bg py-1"
      style={{ top }}
    >
      {/*
        The reference's container: one rounded card holding the tabs on the
        left and the two controls pushed to the right inside it. `rounded-mo-lg`
        is 22px — the top of the band the reference rounds a card to — and it
        is what makes the pills read as sitting IN something rather than
        floating over the column.
      */}
      <div className="flex items-center gap-1 rounded-mo-lg border border-mo bg-mo-surface p-1.5 shadow-mo-sm">
        <div
          role="tablist"
          aria-label="Feed sections"
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          {FEED_TABS.map((tab) => {
            const active = tab.id === marked
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
                // The roving half: exactly one tab is reachable by Tab, and it
                // is the selected one, so returning to the strip returns to
                // where the reader left it.
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                // `min-h-[44px]`: the pointer floor, on the axis that is
                // actually hard to hit.
                //
                // NOT `flex-1`. The reference sizes each pill to its own label
                // and pushes the two icon buttons to the far right of the same
                // container — two pills stretched across 600px would fill the
                // row and leave the controls nothing to be pushed away from.
                // The TABLIST carries the `flex-1`, so what grows is the gap
                // between the labels and the buttons. `shrink` keeps them able
                // to give way at 360px rather than forcing the row wider than
                // the column, which is how a strip like this overflows.
                className={[
                  "flex min-h-[44px] min-w-0 shrink cursor-default items-center justify-center rounded-mo-pill px-5 text-sm font-semibold transition-colors duration-150 ease-mo",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mo",
                  active
                    ? // A SOLID pill. The whole argument for why this is not
                      // `bg-mo-primary text-mo-on-primary` is on the constant.
                      `${SOLID_ACTION_FILL} shadow-mo-sm`
                    : "text-mo-body hover:bg-mo-raised hover:text-mo-ink",
                ].join(" ")}
              >
                <span className="truncate">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/*
          Browse tags — where the third tab went, and a real control with a
          real URL behind it: `?tab=hashtag` opens the day's trending tags and
          each row opens that tag's posts.

          `aria-pressed` rather than `aria-selected`: it is a toggle button,
          not a tab, which is also why it sits outside the tablist.
        */}
        {/* Not `aria-pressed` any more: this strip is never rendered while the
            tag browser is open, so the control has no "on" state to announce —
            it is a plain way in, and the way back is the heading's own. */}
        <button
          type="button"
          onClick={onBrowseTags}
          aria-label="Browse trending tags"
          title="Browse trending tags"
          className={iconButton}
        >
          <SlidersHorizontal aria-hidden="true" className="h-[18px] w-[18px]" />
        </button>

        {/* Saved. See `SAVED_REASON` — `aria-disabled`, not `disabled`, so it
            keeps its place in the focus order and the explanation reaches
            somebody rather than nobody. */}
        <button
          type="button"
          aria-disabled="true"
          onClick={() => onSay(SAVED_REASON)}
          aria-label="Saved posts"
          title={SAVED_REASON}
          className={iconButton}
        >
          <Bookmark aria-hidden="true" className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  )
}
