"use client"

/**
 * The grid every page in this zone draws, with the card menu already wired.
 *
 * ── Why this exists, having not existed before ────────────────────────────
 * There used to be five copies of `<ul className={VIDEO_GRID}>{items.map(…)}`
 * — home, subscriptions, the channel page, history, saved — and adding a
 * three-dot menu to a card would have meant wiring it five times, then six
 * when /trending landed, then nine by the end of this change. The fifth copy
 * is where they stop agreeing: one page passes `hideCreator`, another forgets
 * the feedback handler, and the menu quietly has a different row set depending
 * on which list you are looking at.
 *
 * So the grid is a component. What it owns is exactly the two things that are
 * the same on every page and that a page has no business re-deciding:
 *
 *   · the column count and the gaps, from ./grid.ts, which the skeleton also
 *     reads so the first page landing does not re-flow anything.
 *   · WHAT HAPPENS WHEN SOMEBODY PRESSES "Not interested". See below.
 *
 * Everything genuinely per-page stays a prop: the footer under a row (the
 * history page's resume line, the saved page's Remove), whether the channel
 * line is drawn, and the `actions` object — which is absent for a signed-out
 * visitor, and then no card has a menu at all.
 *
 * ── The hide is LOCAL, optimistic, undoable, and rolled back ──────────────
 * `POST /v1/feed/feedback {signal:"not_interested"}` removes a video from
 * every surface on the NEXT fetch. That leaves a gap: between the press and
 * the next fetch the card is still on screen, and a menu that appeared to do
 * nothing is a menu people press twice. So the row goes immediately.
 *
 * It goes from a set held HERE and not from the page's own item list, and that
 * is deliberate. The list belongs to the feed hook, which pages against a
 * cursor and a seen-set; splicing a row out of it would make `items.length`
 * disagree with what the server thinks it has sent, and that number is what
 * the end-of-feed sentence and the analytics `position` are computed from.
 * Filtering at the draw is the smaller lie: the hook's list is still the
 * truth about what the server sent, and this is the truth about what is on
 * screen.
 *
 * The notice carries an Undo, which sends `signal:"interested"` — the positive
 * signal is the UNDO for the negative one rather than a standalone act, which
 * is why ../menu/cardMenu.ts does not offer "Interested" as a menu row. And a
 * hide the server REFUSED is put back, because a card that vanished over a
 * failed request is a video somebody cannot find again.
 */

import { useCallback, useState } from "react"
import type { FeedItem } from "@atpost/types/feed"
import { sendFeedback } from "@/tube/discoverApi"
import { feedbackNotice } from "@/menu/cardMenu"
import type { CardActions } from "@/menu/useCardActions"
import { VideoCard } from "./VideoCard"
import { VIDEO_GRID } from "./grid"

export interface VideoGridProps {
  items: readonly FeedItem[]
  /** Absent for a signed-out visitor: then no card carries a menu. */
  actions?: CardActions
  /** Drop the channel line — for a grid that is already ABOUT one channel. */
  hideCreator?: boolean
  /** A row's own line under the card. See `footer` on ./VideoCard.tsx. */
  footerFor?: (item: FeedItem) => React.ReactNode
  /**
   * The accessible name of the list.
   *
   * Required rather than defaulted, because a page with a shelf AND a grid has
   * two lists in it and "list" twice tells a screen-reader user nothing about
   * which one they are in.
   */
  label: string
}

export function VideoGrid({ items, actions, hideCreator, footerFor, label }: VideoGridProps) {
  /** Rows hidden by a feedback press, until the next fetch. See the header. */
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{
    text: string
    tone: "good" | "bad"
    undo?: () => void
  } | null>(null)

  const unhide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const hide = useCallback(
    async (item: FeedItem, target: "post" | "author") => {
      setHidden((prev) => new Set(prev).add(item.id))
      setNotice(null)

      const ok = await sendFeedback(
        { kind: target, id: target === "post" ? item.id : item.author_id },
        "not_interested"
      )

      if (!ok) {
        // Put it back. A card that vanished over a failed request is a video
        // somebody cannot find again.
        unhide(item.id)
        setNotice({ ...feedbackNotice(target, false) })
        return
      }

      setNotice({
        ...feedbackNotice(target, true),
        undo: () => {
          unhide(item.id)
          setNotice(null)
          // "interested" is the documented undo for "not_interested" on the
          // same target. Fire and forget: the row is already back, and a
          // failed undo would be a second notice about a video the person has
          // stopped thinking about.
          void sendFeedback(
            { kind: target, id: target === "post" ? item.id : item.author_id },
            "interested"
          )
        },
      })
    },
    [unhide]
  )

  const shown = items.filter((item) => !hidden.has(item.id))

  return (
    <>
      {/* `role="status"` so the outcome is announced without focus moving,
          and ABOVE the grid rather than floating: a toast over the bottom of
          an infinite grid is a toast over the next row of videos. */}
      {notice && (
        <p
          role="status"
          className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-mo border px-4 py-3 text-sm ${
            notice.tone === "bad"
              ? "border-mo bg-mo-surface text-mo-bad"
              : "border-mo bg-mo-surface text-mo-body"
          }`}
        >
          <span className="min-w-0 flex-1">{notice.text}</span>
          {notice.undo && (
            <button
              type="button"
              onClick={notice.undo}
              className="shrink-0 font-semibold text-mo-cyan underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
            >
              Undo
            </button>
          )}
        </p>
      )}

      <ul aria-label={label} className={VIDEO_GRID}>
        {shown.map((item, at) => (
          <VideoCard
            key={item.id}
            item={item}
            // 1-based rank within what is ON SCREEN, which is what the
            // accessible name claims ("video 3 of 11"). Counting hidden rows
            // would make the name disagree with the list a screen reader is
            // walking.
            position={at + 1}
            total={shown.length}
            hideCreator={hideCreator}
            actions={actions}
            // Only offered when there is a session to attribute the signal to.
            // feed-service reads the viewer from the request and 401s without
            // one, so a row here for an anonymous browser would exist to fail.
            onFeedback={actions?.signedIn ? (target) => void hide(item, target) : undefined}
            footer={footerFor?.(item)}
          />
        ))}
      </ul>
    </>
  )
}
