/**
 * Building the bodies. This is the file that stops a half-finished edit
 * deleting a creator's work.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVERY WRITE HERE IS A FULL REPLACE
 *
 * `POST /v1/posts/:postId/cards` and `POST /v1/posts/:postId/end-screens` do
 * not merge, do not patch, and do not append. They DELETE every row for the
 * post and INSERT what you sent. Verified on the running gateway:
 * two cards saved, then a body carrying one card, then a `GET` showing exactly
 * that one — the other is gone. `{"cards":[]}` answers `{"saved":0}` and
 * leaves none at all.
 *
 * Which makes a partial body the most destructive thing this feature can send,
 * and every function below is written to make sending one impossible:
 *
 *   · they take the WHOLE set, never a delta;
 *   · they THROW on anything invalid rather than dropping the bad row and
 *     sending the rest — dropping is exactly how a creator loses a card
 *     because its title had a typo;
 *   · they carry through rows this editor does not manage, verbatim.
 *
 * ── The last of those is not defensive, it is required ────────────────────
 * This screen manages up to three `video` cards and ONE up-next end screen.
 * The same post may already carry rows it has no control for — a `poll` card,
 * a `playlist` end screen, a second end screen written by the phone. Those are
 * in the same table and the same replace. So they are read, held, and written
 * back untouched inside the same body. A payload builder that only knew about
 * the fields on screen would quietly delete them on the first save.
 *
 * Pure: no React, no network. ./payload.test.ts.
 */

import type { EndScreen, VideoCard } from "@/watch/api"
import {
  isCardType,
  isEndScreenType,
  MAX_ALTERNATES,
  alternateProblems,
  type AlternateDraft,
} from "./model"
import {
  UP_NEXT_POSITION,
  hasUpNext,
  upNextWindow,
  type UpNextDraft,
} from "./upnext"

/* ── Wire shapes, write side ────────────────────────────────────────────── */

/** One element of `{"cards":[…]}`. */
export interface WireCard {
  type: string
  target_id?: string
  target_url?: string
  title: string
  teaser_text?: string
  appear_at_ms: number
}

/** One element of `{"screens":[…]}`. */
export interface WireEndScreen {
  type: string
  target_id?: string
  target_url?: string
  title?: string
  /** NOT NULL on the table with no default. Omitting it is a 500. */
  position: unknown
  start_ms: number
  end_ms: number
}

/**
 * Thrown when a set is not whole.
 *
 * A distinct error type rather than a bare `Error` because the save path has
 * to tell two failures apart and treat them very differently: this one never
 * reached the network and nothing changed, while an axios failure may have
 * left the server mid-way through a multi-request series save. The UI says
 * different things for each.
 */
export class IncompleteLinkSet extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IncompleteLinkSet"
  }
}

/* ── Cards ──────────────────────────────────────────────────────────────── */

/**
 * An existing card row as a body element — the round trip for rows this editor
 * does not manage.
 *
 * `id`, `post_id` and `created_at` are dropped: they are the server's, and the
 * replace mints new ones. Everything else goes back exactly as it came, with
 * `null` normalised away — the handler binds optional strings and a JSON
 * `null` where it expects an absent field is a needless difference between
 * what was stored and what is stored again.
 */
export function cardPassthrough(card: VideoCard): WireCard {
  if (!isCardType(card.type)) {
    // Only a database CHECK constraint enforces this enum, so a row already in
    // the table is proof its type is valid — reaching here means the server
    // grew a fifth type. Refusing to echo it is right: sending it back
    // unchanged is safe, but sending it back is not what has failed; the
    // failure is that this editor cannot know whether it is still managing the
    // right rows. Better a visible refusal than a silent deletion.
    throw new IncompleteLinkSet(
      `This video carries a card of an unknown kind ("${String(card.type)}"), which this ` +
        `editor cannot safely rewrite. Nothing was saved.`
    )
  }
  return {
    type: card.type,
    ...(card.target_id ? { target_id: card.target_id } : {}),
    ...(card.target_url ? { target_url: card.target_url } : {}),
    title: card.title ?? "",
    ...(card.teaser_text ? { teaser_text: card.teaser_text } : {}),
    appear_at_ms: Math.round(card.appear_at_ms) || 0,
  }
}

/**
 * The complete `{"cards":[…]}` body.
 *
 * @param drafts the alternates on screen, in the order they are listed.
 * @param passthrough rows loaded from the server that this editor does not
 *        manage. Written back unchanged — see the file header.
 * @param subjectPostId the video being edited, so a card cannot target it.
 * @param durationMs 0 when unknown, which skips the past-the-end check only.
 *
 * @throws IncompleteLinkSet if ANY draft is invalid. The whole point: a body
 *         that silently omits the row somebody was halfway through typing is a
 *         body that deletes it.
 */
export function buildCardsPayload(
  drafts: readonly AlternateDraft[],
  passthrough: readonly VideoCard[],
  subjectPostId: string,
  durationMs: number
): { cards: WireCard[] } {
  if (drafts.length > MAX_ALTERNATES) {
    throw new IncompleteLinkSet(
      `At most ${MAX_ALTERNATES} alternate videos. Remove one before saving.`
    )
  }
  const problems = alternateProblems(drafts, subjectPostId, durationMs)
  if (problems.size > 0) {
    throw new IncompleteLinkSet(
      "Some alternates are not finished. Saving replaces every card on this " +
        "video at once, so nothing was sent."
    )
  }

  const authored: WireCard[] = drafts.map((draft) => ({
    type: "video",
    target_id: draft.targetId,
    title: draft.title.trim(),
    ...(draft.teaser.trim() ? { teaser_text: draft.teaser.trim() } : {}),
    // Clamped rather than trusted. The server stores a negative verbatim and
    // `activeCard` then reads it as 0, so a mis-typed timestamp becomes an
    // opening card that the editor would go on showing at its typed position.
    appear_at_ms: Math.max(0, Math.round(draft.atMs)),
  }))

  // Authored rows first, then the ones being carried. The endpoint sorts by
  // `appear_at_ms` on the way out, so the order in the body is not meaningful
  // to the reader — but it is meaningful to a person reading a request in the
  // network tab, and "what I edited, then what I did not" is the readable one.
  return { cards: [...authored, ...passthrough.map(cardPassthrough)] }
}

/* ── End screens ────────────────────────────────────────────────────────── */

/** An existing end-screen row as a body element. See `cardPassthrough`. */
export function endScreenPassthrough(screen: EndScreen): WireEndScreen {
  if (!isEndScreenType(screen.type)) {
    throw new IncompleteLinkSet(
      `This video carries an end screen of an unknown kind ("${String(screen.type)}"), ` +
        `which this editor cannot safely rewrite. Nothing was saved.`
    )
  }
  return {
    type: screen.type,
    ...(screen.target_id ? { target_id: screen.target_id } : {}),
    ...(screen.target_url ? { target_url: screen.target_url } : {}),
    ...(screen.title ? { title: screen.title } : {}),
    // A stored row always has one — the column is NOT NULL — but it may be any
    // JSON at all, including `{}`. Echoed exactly; `endScreenSlot` on the
    // watch page is what copes with a shape it cannot read.
    position: screen.position ?? {},
    start_ms: Math.round(screen.start_ms) || 0,
    end_ms: Math.round(screen.end_ms) || 0,
  }
}

/**
 * The complete `{"screens":[…]}` body.
 *
 * @param draft the up-next tile, or one with no target for "there is none".
 * @param passthrough end screens this editor does not manage, written back.
 * @param durationMs the video's length. Required for a tile: there is no
 *        honest window without it.
 *
 * @throws IncompleteLinkSet when a tile was asked for and cannot be placed.
 */
export function buildEndScreensPayload(
  draft: UpNextDraft,
  passthrough: readonly EndScreen[],
  durationMs: number
): { screens: WireEndScreen[] } {
  const carried = passthrough.map(endScreenPassthrough)
  if (!hasUpNext(draft)) return { screens: carried }

  const window = upNextWindow(durationMs, draft.leadMs)
  if (!window) {
    throw new IncompleteLinkSet(
      "An up-next tile needs to know how long the video is, and this one does not say."
    )
  }
  if (window.endMs <= window.startMs) {
    // `activeEndScreens` drops a row whose end is not after its start, so this
    // would be a tile that is written and never drawn.
    throw new IncompleteLinkSet("That up-next window is empty.")
  }

  const tile: WireEndScreen = {
    type: "video",
    target_id: draft.targetId,
    ...(draft.title.trim() ? { title: draft.title.trim() } : {}),
    // Always sent. `position` is NOT NULL with no default and omitting it is a
    // 500, not a row with no position. See ./upnext.ts.
    position: { ...UP_NEXT_POSITION },
    start_ms: window.startMs,
    end_ms: window.endMs,
  }
  return { screens: [tile, ...carried] }
}
