"use client"

/**
 * The social graph, as one row of controls.
 *
 * ── The boundary ──────────────────────────────────────────────────────────
 * No network. Every action arrives as a handler and every current value as a
 * prop. That is not ceremony: the feed, reels and tube each reach the same
 * endpoints through a different zone proxy and with different analytics, and
 * the ONE thing they must not each reimplement is what a like does to a count
 * while the request is in the air. This file is that behaviour; the wiring is
 * the zone's.
 *
 * ── Author switches are permissions, not preferences ──────────────────────
 * `no_comments` and `hide_share` are enforced server-side — posting to a
 * `no_comments` post returns 403 COMMENTS_DISABLED. A bar that showed the
 * control anyway would be offering something the server will refuse, so the
 * control is not rendered at all rather than rendered-and-disabled. A disabled
 * button says "not yet"; an absent one says "not here", which is the truth.
 *
 * ── Colour ────────────────────────────────────────────────────────────────
 * Idle icons are `text-mo-body` — 6.22 on a card, AA, and these sit beside
 * small numeric labels which are small text. Active states:
 *
 *   liked      `text-mo-primary`, the red end of the ember ramp. Measured
 *              3.36 against #1F1D33: it clears the 3.0 non-text bar as an
 *              icon, and it does not create a second primary action on the
 *              screen because it is a MARK and not a fill — there is no ember
 *              button on a feed card for it to compete with.
 *   saved      `text-mo-cyan`, 6.75 on a card. Cyan is the interactive colour
 *              and a save is a selected state, which is exactly its job.
 *
 * Nothing here is gold. Gold is the storefront's money colour and does not
 * appear outside `.mo-commerce`.
 */

import { Bookmark, Heart, MessageCircle, Repeat2, Share2 } from "lucide-react"
import { useOptimisticToggle } from "./useOptimisticToggle"
import type { ToggleResult } from "./useOptimisticToggle"

export interface ActionBarProps {
  likes: number
  comments: number
  reposts?: number
  hasLiked: boolean
  isSaved: boolean
  hasReposted?: boolean

  /** Author switches, straight off the post. */
  noComments?: boolean
  hideShare?: boolean
  isRepostable?: boolean

  onLike: (next: boolean) => Promise<ToggleResult>
  onSave: (next: boolean) => Promise<ToggleResult>
  onRepost?: (next: boolean) => Promise<ToggleResult>
  onComment?: () => void
  onShare?: () => void

  /** For the accessible names, so a screen reader hears which post. */
  label?: string
}

const BUTTON =
  "inline-flex items-center gap-1.5 rounded-mo-pill px-2.5 py-1.5 text-sm " +
  "text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  "disabled:cursor-not-allowed disabled:opacity-60"

/** Counts are omitted at zero: "0" is noise, and the icon already says what it is. */
function Count({ n }: { n: number }) {
  if (!n) return null
  return <span className="tabular-nums">{n > 999 ? `${(n / 1000).toFixed(1)}k` : n}</span>
}

export function ActionBar({
  likes,
  comments,
  reposts = 0,
  hasLiked,
  isSaved,
  hasReposted = false,
  noComments = false,
  hideShare = false,
  isRepostable = true,
  onLike,
  onSave,
  onRepost,
  onComment,
  onShare,
  label,
}: ActionBarProps) {
  const like = useOptimisticToggle(
    { on: hasLiked, count: likes },
    onLike,
    { errorMessage: "Could not save that like." }
  )
  const save = useOptimisticToggle(
    { on: isSaved, count: 0 },
    onSave,
    { errorMessage: "Could not save that post." }
  )
  const repost = useOptimisticToggle(
    { on: hasReposted, count: reposts },
    onRepost ?? (async (next) => ({ on: next })),
    { errorMessage: "Could not repost." }
  )

  const suffix = label ? ` on ${label}` : ""
  // One line, not three: two failures at once is a rare case and stacking
  // messages under a card pushes the next post around.
  const error = like.error ?? save.error ?? repost.error

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={BUTTON}
          onClick={like.toggle}
          disabled={like.pending}
          aria-pressed={like.on}
          aria-label={`${like.on ? "Unlike" : "Like"}${suffix}`}
        >
          <Heart
            aria-hidden="true"
            className={`h-5 w-5 ${like.on ? "fill-current text-mo-primary" : ""}`}
          />
          <Count n={like.count} />
        </button>

        {/* Absent, not disabled — see the header note. */}
        {!noComments && (
          <button
            type="button"
            className={BUTTON}
            onClick={onComment}
            aria-label={`Comments${suffix}`}
          >
            <MessageCircle aria-hidden="true" className="h-5 w-5" />
            <Count n={comments} />
          </button>
        )}

        {isRepostable && onRepost && (
          <button
            type="button"
            className={BUTTON}
            onClick={repost.toggle}
            disabled={repost.pending}
            aria-pressed={repost.on}
            aria-label={`${repost.on ? "Undo repost" : "Repost"}${suffix}`}
          >
            <Repeat2
              aria-hidden="true"
              className={`h-5 w-5 ${repost.on ? "text-mo-cyan" : ""}`}
            />
            <Count n={repost.count} />
          </button>
        )}

        {!hideShare && (
          <button type="button" className={BUTTON} onClick={onShare} aria-label={`Share${suffix}`}>
            <Share2 aria-hidden="true" className="h-5 w-5" />
          </button>
        )}

        <button
          type="button"
          className={`${BUTTON} ml-auto`}
          onClick={save.toggle}
          disabled={save.pending}
          aria-pressed={save.on}
          aria-label={`${save.on ? "Remove from saved" : "Save"}${suffix}`}
        >
          <Bookmark
            aria-hidden="true"
            className={`h-5 w-5 ${save.on ? "fill-current text-mo-cyan" : ""}`}
          />
        </button>
      </div>

      {/*
        The visible half of "optimistic". A rollback nobody is told about is a
        lie the interface told and then quietly retracted.
        `role="status"` rather than `alert`: it is worth hearing, but it must
        not interrupt what a screen reader is already saying about the post.
      */}
      {error && (
        <p role="status" className="mt-1 px-2.5 text-xs text-mo-bad">
          {error}
        </p>
      )}
    </div>
  )
}
