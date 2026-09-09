/**
 * The sequence — a video series, as an ordered list a creator can rearrange.
 *
 * The founder's "one to three sequence of videos". A series is the only
 * mechanism on this platform that has an ORDER: `video_series_episodes` is
 * keyed `(series_id, episode_num)`, the watch page's `nextEpisode` walks it,
 * and `SeriesNext` is the rail that offers episode 2 at the end of episode 1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE THING THAT SHAPES THIS WHOLE FILE: AN EPISODE CANNOT BE REMOVED
 *
 * There is no delete. Not "we have not wired it up" — it does not exist. The
 * route table in post-service's handler.go registers exactly four:
 *
 *     vseries.POST("",                     h.CreateVideoSeries)
 *     vseries.GET ("/:seriesId",           h.GetVideoSeries)
 *     vseries.GET ("/:seriesId/episodes",  h.GetVideoSeriesEpisodes)
 *     vseries.POST("/:seriesId/episodes",  h.AddVideoSeriesEpisode)
 *
 * and nothing else. Verified against the running gateway on 2026-09-10:
 * `DELETE /v1/video-series/{id}/episodes/3`, `…/episodes/{postId}`,
 * `…/episodes`, and `PATCH`/`PUT`/`DELETE` on the series itself all answer
 * gin's bare `404 page not found` — which is what an UNROUTED path looks like,
 * as opposed to the service's own enveloped `{"error":{"code":"NOT_FOUND"}}`
 * that `GET /v1/video-series/{a real-shaped id that does not exist}` returns.
 * The playlists group immediately below it in the same file DOES have
 * `DELETE /:playlistId` and `DELETE /:playlistId/items/:postId`. Series were
 * simply never given them.
 *
 * Two consequences, and both are user-visible rather than internal:
 *
 *   1. A SERIES CAN GROW AND BE REARRANGED BUT NEVER SHRINK. Once episode 3
 *      exists, some video is episode 3 for ever; the only thing a creator can
 *      change is WHICH one. So this editor refuses to shorten a saved series
 *      and says why, rather than appearing to shorten it and leaving a
 *      stranded row on the server. `strandedEpisodes` is what that refusal is
 *      computed from.
 *
 *   2. THE SAME POST CAN OCCUPY TWO EPISODE NUMBERS, and that is not
 *      hypothetical — it was reproduced: upserting post C at episode 1 while
 *      it was already episode 3 answered 201 and left it at both. The damage
 *      is on the WATCH page, not here: `nextEpisode` finds the FIRST index of
 *      a post and offers the one after it, so a video that is both episode 1
 *      and episode 3 offers episode 2 at its end — and episode 2 offers
 *      episode 3, which is the same video again. A loop. `duplicateSlots`
 *      refuses it before it can be written.
 *
 * Pure: no React, no network. ./sequence.test.ts.
 */

import type { SeriesEpisode } from "@/watch/api"
import { isUuid } from "./model"

/**
 * How many episodes this editor will write.
 *
 * The founder's number — "one to three sequence of videos" — and, as with
 * `MAX_ALTERNATES`, there is no server maximum, so it is ours to impose. It is
 * imposed on what this screen can ADD; a series that already has more episodes
 * than this (written by the phone, or by a contract probe) is loaded and shown
 * in full rather than truncated, because truncating it here is exactly the
 * shrink the server cannot perform.
 */
export const MAX_EPISODES = 3

/** Episode numbers are 1-based. `episode_num: 0` is a 400 — see below. */
export const FIRST_EPISODE_NUM = 1

/**
 * One position in the sequence, as the creator is editing it.
 *
 * There is no `episodeNum` on the slot. That is the whole design: a slot's
 * number is its INDEX + 1, computed at the moment it is needed, so reordering
 * cannot leave a number behind. A slot that carried its own number would need
 * every reorder to remember to renumber, and the one that forgets is the one
 * that writes episode 2 twice.
 *
 * `key` is local and stable across renders, like `AlternateDraft.key` and for
 * the same reason.
 */
export interface EpisodeSlot {
  key: string
  postId: string
  /** The video's own title, for the row. Never sent. */
  videoTitle: string
  /** The episode's title — `title` on the wire. Optional there and here. */
  title: string
}

/** The slot's episode number: its place in the list, 1-based. */
export function episodeNumAt(index: number): number {
  return index + FIRST_EPISODE_NUM
}

/**
 * Move a slot, keeping every other slot's relative order.
 *
 * A plain splice pair rather than a swap. A swap is what "move up" looks like
 * for a list of two and stops being right at three: moving slot 3 to position
 * 1 by swapping leaves 3, 2, 1 when the creator asked for 3, 1, 2.
 *
 * Out-of-range indices return the list unchanged rather than throwing — the
 * caller is a button that can be pressed at either end.
 */
export function moveSlot<T>(slots: readonly T[], from: number, to: number): T[] {
  if (from === to) return slots.slice()
  if (from < 0 || from >= slots.length) return slots.slice()
  if (to < 0 || to >= slots.length) return slots.slice()
  const next = slots.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/** The slots that name the same video as another slot, by key. Symmetric. */
export function duplicateSlots(slots: readonly EpisodeSlot[]): Set<string> {
  const byPost = new Map<string, string[]>()
  for (const slot of slots) {
    if (!slot.postId) continue
    const keys = byPost.get(slot.postId) ?? []
    keys.push(slot.key)
    byPost.set(slot.postId, keys)
  }
  const hit = new Set<string>()
  for (const keys of byPost.values()) {
    if (keys.length > 1) for (const key of keys) hit.add(key)
  }
  return hit
}

/** What is wrong with one slot, or null. */
export function slotProblem(slot: EpisodeSlot): string | null {
  if (!slot.postId) return "Pick a video for this episode."
  if (!isUuid(slot.postId)) return "That video id is not a valid id."
  if (slot.title.trim().length > 120) return "Episode titles are at most 120 characters."
  return null
}

/** Every problem in the sequence, by slot key. */
export function slotProblems(slots: readonly EpisodeSlot[]): Map<string, string> {
  const problems = new Map<string, string>()
  for (const slot of slots) {
    const problem = slotProblem(slot)
    if (problem) problems.set(slot.key, problem)
  }
  const duplicated = duplicateSlots(slots)
  for (const slot of slots) {
    if (problems.has(slot.key)) continue
    if (duplicated.has(slot.key)) {
      // See the file header: this is the case that makes the watch page's
      // "next episode" point at the video you are already watching.
      problems.set(slot.key, "This video is already another episode of this series.")
    }
  }
  return problems
}

/* ── Turning saved episodes into slots, and back ────────────────────────── */

/**
 * The saved episodes as slots, in playing order.
 *
 * Ordered by `episode_num` and NOT by the array the server sent — it does
 * order them, but this list is about to be renumbered by position and an
 * ordering assumption inherited from a response is the kind that holds until
 * the day it does not.
 *
 * A GAP in the saved numbering (1, 2, 4 — which happens because 3 can never be
 * deleted but CAN be overwritten, and because nothing stops the phone writing
 * 4 first) is CLOSED by this: the slots come back 1, 2, 3. That is a real
 * change to the data and it is the right one — `nextEpisode` on the watch page
 * already treats a gap as "keep going", so closing it changes nothing a viewer
 * sees, and leaving it would mean the editor's numbers and the server's
 * numbers disagree on screen.
 */
export function slotsFromEpisodes(
  episodes: readonly SeriesEpisode[],
  titleOf: (postId: string) => string,
  mintKey: (postId: string, index: number) => string
): EpisodeSlot[] {
  return episodes
    .filter((e) => Number.isFinite(e.episode_num))
    .slice()
    .sort((a, b) => a.episode_num - b.episode_num)
    .map((episode, index) => ({
      key: mintKey(episode.post_id, index),
      postId: episode.post_id,
      videoTitle: titleOf(episode.post_id),
      title: episode.title?.trim() || "",
    }))
}

/** One upsert against `POST /v1/video-series/:seriesId/episodes`. */
export interface EpisodeWrite {
  postId: string
  /** 1-based. `episode_num: 0` fails the handler's `required` binding tag. */
  episodeNum: number
  title: string | null
}

/**
 * The upserts needed to make the server's episode list match `slots`.
 *
 * ── Only what CHANGED ─────────────────────────────────────────────────────
 * Unlike cards and end screens, this endpoint is not a full replace: it
 * upserts ONE episode per call on `(series_id, episode_num)` and recomputes
 * the count. So a reorder of three episodes that only moved the last two is
 * two requests, not three, and a save with nothing changed is zero requests
 * and no `updated_at` churn on the series.
 *
 * ── `episode_num` starts at 1, and 0 is not "the first one" ───────────────
 * `POST …/episodes` with `episode_num: 0` answers
 * `400 … 'EpisodeNum' failed on the 'required' tag` — verified. Go's
 * `binding:"required"` treats the zero value of an int as absent, so a 0-based
 * client does not get "invalid episode number", it gets "you did not send
 * one", which is the single most misleading error on this endpoint. `1` is the
 * first episode. That is what `episodeNumAt` is for and why nothing here
 * writes an index straight to the wire.
 *
 * A slot with no post id produces no write. An incomplete row must never be
 * half-saved — the whole point of validating before building.
 */
export function episodeWrites(
  saved: readonly SeriesEpisode[],
  slots: readonly EpisodeSlot[]
): EpisodeWrite[] {
  const byNum = new Map<number, SeriesEpisode>()
  for (const episode of saved) byNum.set(episode.episode_num, episode)

  const writes: EpisodeWrite[] = []
  slots.forEach((slot, index) => {
    if (!slot.postId) return
    const episodeNum = episodeNumAt(index)
    const title = slot.title.trim() || null
    const current = byNum.get(episodeNum)
    const unchanged =
      current !== undefined &&
      current.post_id === slot.postId &&
      (current.title?.trim() || null) === title
    if (!unchanged) writes.push({ postId: slot.postId, episodeNum, title })
  })
  return writes
}

/**
 * The saved episode numbers this arrangement would abandon — and cannot.
 *
 * Empty is the good case and is what the save path requires. A non-empty
 * answer means the creator has removed a slot from a series that already had
 * that many episodes, and there is no route that would delete the leftover.
 * Saving anyway would leave a series whose `episode_count` still says 3 and
 * whose third episode is whatever it was before, silently, while the editor
 * showed two.
 *
 * So this is a REFUSAL and not a warning-and-proceed. The section says what it
 * would take to make it possible — a delete route — rather than pretending the
 * limit is a design choice.
 */
export function strandedEpisodes(
  saved: readonly SeriesEpisode[],
  slots: readonly EpisodeSlot[]
): number[] {
  const kept = new Set(slots.map((_, index) => episodeNumAt(index)))
  return saved
    .map((e) => e.episode_num)
    .filter((num) => Number.isFinite(num) && !kept.has(num))
    .sort((a, b) => a - b)
}

/**
 * Is the slot at this index one the creator may remove?
 *
 * Only the tail beyond what is already saved. Removing slot 2 of three saved
 * episodes is a shrink of the whole list — every later slot moves up and the
 * last saved number is stranded — so the answer for anything but the trailing
 * unsaved slots is no. See `strandedEpisodes`.
 */
export function canRemoveSlot(
  savedCount: number,
  index: number,
  slotCount: number
): boolean {
  if (slotCount <= 0) return false
  // Only the last slot is ever removable, and only when dropping it still
  // leaves room for every episode the server already has.
  return index === slotCount - 1 && slotCount - 1 >= savedCount
}
