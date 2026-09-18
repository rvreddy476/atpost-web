"use client"

/**
 * The action row a visitor with no account sees.
 *
 * ── Why not `ActionBar` with disabled buttons ─────────────────────────────
 * Because every control on it is a WRITE that the gateway will refuse.
 * `POST /v1/posts/{id}/like` and the bookmark routes both parse `X-User-Id`
 * and answer 401 without one, and `ActionBar` is built around
 * `useOptimisticToggle` — so a press would fill the heart, bump the number,
 * fire a request, and then put both back with "Could not save that like." That
 * is a worse answer than no button: it teaches somebody that the site is
 * broken rather than that they need an account.
 *
 * So the counts stay — they are facts about the video and a stranger is
 * entitled to them — and the controls are replaced by the one thing that
 * actually helps, which is a way to get an account. The same absent-not-
 * disabled rule the rest of this page follows (@momentum/content's
 * postMenu.ts states it), applied to a viewer rather than to a post's
 * switches.
 *
 * ── Share is a real control and it stays ──────────────────────────────────
 * It needs no session at all: it is `navigator.share` or the clipboard, and
 * the URL is this page. A stranger who wants to send a video to somebody is
 * exactly the person a share button is for, and removing it would be gating
 * something that costs nothing. `hide_share` still hides it — that is the
 * author's switch, and it outranks everything here.
 */

import { Bookmark, Heart, MessageCircle, Share2 } from "lucide-react"
import { formatCount } from "@momentum/content"
import { signInHref } from "@momentum/chrome"
import { ZONE } from "@/zone"

export interface SignedOutActionsProps {
  likes: number
  comments: number
  /** The author turned comments off; there is no count to show. */
  noComments?: boolean
  hideShare?: boolean
  /** Scrolls to the thread, which a signed-out viewer can still READ. */
  onComment: () => void
  onShare: () => void
}

const CHIP =
  "inline-flex items-center gap-1.5 rounded-mo-pill px-2.5 py-1.5 text-sm text-mo-body"

const BUTTON = `${CHIP} transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo-cyan`

export function SignedOutActions({
  likes,
  comments,
  noComments = false,
  hideShare = false,
  onComment,
  onShare,
}: SignedOutActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* Read-only, and marked as such for a screen reader: these are not
          controls and must not be announced as if they were. */}
      <span className={CHIP}>
        <Heart aria-hidden className="h-4 w-4" />
        <span className="tabular-nums">{formatCount(likes)}</span>
        <span className="sr-only">likes</span>
      </span>

      {!noComments && (
        <button type="button" onClick={onComment} className={BUTTON}>
          <MessageCircle aria-hidden className="h-4 w-4" />
          <span className="tabular-nums">{formatCount(comments)}</span>
          <span className="sr-only">comments — read the thread</span>
        </button>
      )}

      {!hideShare && (
        <button type="button" onClick={onShare} className={BUTTON}>
          <Share2 aria-hidden className="h-4 w-4" />
          Share
        </button>
      )}

      {/* The one control that does something for this viewer. The Bookmark
          glyph is there because "save" is the capability most people come
          looking for on a video page they cannot act on. */}
      <a
        href={signInHref(ZONE)}
        className="ml-auto inline-flex items-center gap-1.5 rounded-mo-pill border border-mo-strong px-4 py-1.5 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
      >
        <Bookmark aria-hidden className="h-4 w-4" />
        Sign in to like or save
      </a>
    </div>
  )
}
