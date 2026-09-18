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
 * ── Colour, in TWO scopes ─────────────────────────────────────────────────
 * This bar is mounted on a violet-black card in MShorts and MTube and on a
 * white one in the feed, so every figure below is given for both. The old note
 * gave one column and called it the measurement.
 *
 * Idle icons are `text-mo-body`: 6.21 on a dark card, 7.87 on a white one.
 * They sit beside small numeric labels, which are small text, so AA at 4.5 is
 * the bar and both clear it.
 *
 *   liked   `text-mo-primary` — the PRIMARY colour of whichever scope this
 *           is, which is the red end of the ember ramp in the dark one and
 *           the deep forest green in the light one.
 *
 *             dark   #DC2626 on #1F1D33 card ... 3.39  non-text only
 *             light  #0B6B37 on #FFFFFF card ... 6.61
 *
 *           3.39 clears the 3.0 an icon needs and nothing more, which is why
 *           the heart is a FILLED SHAPE and never a word, and why the count
 *           beside it stays --mo-body rather than turning red with it. The old
 *           note said 3.36; the difference is rounding in the old script, and
 *           the figure above came out of the same one that produced tokens.css.
 *
 *           A green heart is not an accident of tokens. Green is what "on,
 *           chosen, yours" means in a light zone and red is what it means in a
 *           dark one; the alternative — pinning the heart to a literal red —
 *           would be the one mark on a light page painted a colour with no
 *           role in that scope, and `--mo-bad` (the only red there) means
 *           ERROR. It still does not create a second primary action, because a
 *           mark is not a fill and there is no primary button on a feed card.
 *
 *   saved   `text-mo-cyan` — and this one deliberately does NOT follow the
 *           primary. #06B6D4 is 6.74 on a dark card and #0C6E86 is 5.84 on a
 *           white one, both fine; the reason it stays cyan is that liked and
 *           saved must not be the same colour, and in a light zone anything
 *           that tracked "interactive" would be green — the colour the heart
 *           beside it has just taken. Two adjacent state marks that agree on
 *           colour say nothing. Cyan is --mo-info in a light zone rather than
 *           the interactive hue, and a bookmark IS informational: it reports a
 *           state, it does not invite one. Repost is cyan for the same reason.
 *
 * Nothing here is gold. Gold is the storefront's money colour and does not
 * appear outside `.mo-commerce`.
 *
 * ── The targets are 44px ──────────────────────────────────────────────────
 * Not padding for its own sake: this row is the densest cluster of controls in
 * the product and on a 360px screen it holds five of them. `min-h-[44px]` with
 * `min-w-[44px]` is the floor under each, and the gap between them is what
 * stops a thumb aimed at Comment landing on Like.
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
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 " +
  "rounded-mo-pill px-2.5 text-sm " +
  "text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  // Not `opacity-60`. --mo-body at 60% over a white card measures 2.92, which
  // is worse than the dark scope's equivalent and below anything legible;
  // --mo-muted-lg is the colour this palette actually has for a recessed
  // label (3.93 on white, 3.56 on the dark ground) and it is honest at both
  // ends. A disabled control's label is exempt under WCAG 1.4.3, but the
  // exemption is a licence rather than an instruction.
  "disabled:cursor-not-allowed disabled:text-mo-muted-lg"

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

        {/*
          Two reasons not to draw this, held in one condition — the second of
          which this bar was missing, and PostCard's own note flagged.

          The author's `hide_share` switch is the first. The second is that
          nothing is wired to share anything: apps/social rendered this glyph
          with no `onShare` at all, so the control was focusable, pressable,
          announced as "Share", and did nothing on any press. That is the same
          dead glyph the comment control used to be, and the rule the header
          states applies to it identically — absent says "not here", which is
          true; present-and-inert says nothing and is a promise the bar cannot
          keep. Repost has always followed this rule; share does now.
        */}
        {!hideShare && onShare && (
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
