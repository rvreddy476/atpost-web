/**
 * The sequence — a video series, as an ordered list a creator can rearrange.
 *
 * The founder's "one to three sequence of videos". A series is the only
 * mechanism on this platform that has an ORDER: `video_series_episodes` is
 * keyed `(series_id, episode_num)`, the watch page's `nextEpisode` walks it,
 * and `SeriesNext` is the rail that offers episode 2 at the end of episode 1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE THING THAT SHAPES THIS WHOLE FILE: A NUMBER BELONGS TO A POSITION,
 * AND A REMOVED NUMBER STAYS REMOVED
 *
 * When this file was written (2026-09-10) the server had no delete at all,
 * and every refusal in the first version was designed for a world without
 * one: a series could grow and be rearranged but never shrink. As of
 * 2026-09-12 the server has `DELETE /v1/video-series/{id}/episodes/{ref}`
 * (`ref` is an episode number or a post id, 204) and this editor calls it,
 * from `removeSeriesEpisode` in ./api.ts. That changed the rule the numbers
 * follow, and the rule is the server's:
 *
 *   A DELETE LEAVES A GAP. IT DOES NOT RENUMBER.
 *
 * Remove episode 2 of three and the series is episodes 1 and 3. Nothing
 * becomes episode 2 until a creator puts something there. The watch page's
 * `nextEpisode` already treats a gap as "keep going", so a viewer at the end
 * of episode 1 is offered episode 3, which is the right thing to be offered.
 *
 * So the numbering here is NOT "index plus one" any more. It is the SAVED
 * numbers, in order, one per position, and then the next unused number for
 * every position past what is saved — `episodeNumbers`. Reordering still
 * cannot leave a number behind (a slot carries no number of its own; the
 * positions do), and a gap the server has is a gap this editor shows,
 * because an editor that silently closed it would write episode 3 to episode
 * 2 on the next save and disagree with the server about which video is
 * which.
 *
 * The one refusal that survives is the loop: THE SAME POST CAN OCCUPY TWO
 * EPISODE NUMBERS, and that is not hypothetical — it was reproduced:
 * upserting post C at episode 1 while it was already episode 3 answered 201
 * and left it at both. The damage is on the WATCH page, not here:
 * `nextEpisode` finds the FIRST index of a post and offers the one after it,
 * so a video that is both episode 1 and episode 3 offers episode 2 at its
 * end — and episode 2 offers episode 3, which is the same video again. A
 * loop. `duplicateSlots` refuses it before it can be written.
 *
 * Pure: no React, no network. ./sequence.test.ts.
 */

import type { SeriesEpisode } from "@/watch/api"
import { isUuid } from "./model"

/**
 * How many episodes this editor will write.
 *
 * The founder's number, "one to three sequence of videos". The server's own
 * cap is far above it (`SERIES_MAX_EPISODES` in ../watch/api.ts, fifty, a
 * 409 SERIES_FULL past that), so this one is ours to impose. It is imposed on
 * what this screen can ADD; a series that already has more episodes than
 * this (written by the phone, by the upload studio, or by a contract probe)
 * is loaded and shown in full rather than truncated: a truncation would be a
 * removal the creator did not ask for, and removal here is a deliberate,
 * confirmed act on one episode at a time. The upload studio's "Series" card
 * keeps to the same number so it cannot make a series this screen then
 * refuses to touch.
 */
export const MAX_EPISODES = 3

/** Episode numbers are 1-based. `episode_num: 0` is a 400 — see below. */
export const FIRST_EPISODE_NUM = 1

/**
 * One position in the sequence, as the creator is editing it.
 *
 * There is no `episodeNum` on the slot. That is the whole design: a slot's
 * number is the number of its POSITION (`episodeNumbers`), computed at the
 * moment it is needed, so reordering cannot leave a number behind. A slot
 * that carried its own number would need every reorder to remember to
 * renumber, and the one that forgets is the one that writes episode 2 twice.
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

/**
 * The episode number of a position in a series that has nothing saved.
 *
 * Its place in the list, 1-based. This is the FRESH case only; once a series
 * has saved rows the numbers come from them — see `episodeNumbers`, which is
 * what every caller with a saved list should ask.
 */
export function episodeNumAt(index: number): number {
  return index + FIRST_EPISODE_NUM
}

/** The saved episode numbers, ascending, with anything unreadable dropped. */
export function savedEpisodeNums(saved: readonly SeriesEpisode[]): number[] {
  return saved
    .map((e) => e.episode_num)
    .filter((num) => Number.isFinite(num))
    .sort((a, b) => a - b)
}

/**
 * The episode number of every position, for a list of `slotCount` slots.
 *
 * ── The saved numbers first, in order, gaps and all ───────────────────────
 * A series saved as 1, 3, 4 has three positions numbered 1, 3, 4 — not 1, 2,
 * 3. The server does not renumber on a delete and neither does this editor,
 * so the number a position shows is the number the row on the server has,
 * and a reorder writes the moved video to THAT number. Closing the gap here
 * would mean the next save rewrote episode 3 as episode 2, which is a change
 * nobody asked for and a disagreement with the server about which video is
 * which until it lands.
 *
 * ── Then the next unused number for every position past the saved ones ───
 * A slot the creator has added goes after the highest saved number, never
 * into a gap. The list on screen reads top to bottom as playing order, and a
 * video added at the bottom of the list is a video that plays last; filling
 * the gap at 2 would make it play second while sitting third on screen.
 *
 * Fewer slots than saved rows is not a shape this editor produces (a removal
 * drops the saved row and the slot together), but it is answered rather than
 * thrown on: the first `slotCount` saved numbers. `strandedEpisodes` is what
 * names the rest.
 */
export function episodeNumbers(saved: readonly SeriesEpisode[], slotCount: number): number[] {
  const nums = savedEpisodeNums(saved).slice(0, Math.max(0, slotCount))
  let next = nums.length > 0 ? nums[nums.length - 1]! + 1 : FIRST_EPISODE_NUM
  while (nums.length < slotCount) {
    nums.push(next)
    next += 1
  }
  return nums
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
 * order them, but the position of a slot is what `episodeNumbers` pairs with
 * a saved number, and an ordering assumption inherited from a response is the
 * kind that holds until the day it does not.
 *
 * A GAP in the saved numbering (1, 2, 4 — from a removal, or because nothing
 * stops the phone writing 4 first) is KEPT. The slots come back in that
 * order and `episodeNumbers` labels them 1, 2, 4. An earlier version closed
 * the gap to 1, 2, 3 and then could not save, because the renumber stranded
 * episode 4 and there was no delete to un-strand it. Now that a delete
 * exists the honest thing is to show the numbers the server has.
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
 * ── A removed episode is not a write ──────────────────────────────────────
 * Removal goes through `removeSeriesEpisode` the moment it is confirmed, not
 * through here, and the numbers come from `episodeNumbers`, so a series saved
 * as 1, 3 with two untouched slots produces NO writes: nothing is renumbered
 * to fill the 2.
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

  const numbers = episodeNumbers(saved, slots.length)
  const writes: EpisodeWrite[] = []
  slots.forEach((slot, index) => {
    if (!slot.postId) return
    const episodeNum = numbers[index]!
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
 * The saved episode numbers this arrangement has no position for.
 *
 * Empty is the normal case and is what the save path requires. It used to be
 * the everyday refusal — "a shorter list strands the tail and nothing can
 * delete it" — and it is now a consistency guard: removal drops the saved row
 * and the slot together (`episodeRemoval`, then `removeSeriesEpisode`), so a
 * list shorter than what is saved means the two have come apart, which is a
 * reason to reload rather than to write. A save that went ahead would leave
 * episode 3 on the server while the editor showed two, silently.
 */
export function strandedEpisodes(
  saved: readonly SeriesEpisode[],
  slots: readonly EpisodeSlot[]
): number[] {
  const kept = new Set(episodeNumbers(saved, slots.length))
  return savedEpisodeNums(saved).filter((num) => !kept.has(num))
}

/**
 * Is the slot at this index one the creator may remove?
 *
 * Any slot that exists. This used to be "only the unsaved tail", because
 * removing a saved episode had nowhere to go on the server; now it goes to
 * `DELETE …/episodes/{ref}`, and removing from the middle is exactly the case
 * the gap rule exists for. What is left is the bounds check, so a button that
 * is pressed on an empty list does nothing rather than deleting `undefined`.
 */
export function canRemoveSlot(index: number, slotCount: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < slotCount
}

/**
 * The episode numbers between 1 and the highest saved one that nothing holds.
 *
 * For the panel to SAY, not to fix. A gap is what a removal leaves and the
 * server's rule is that it stays; a creator looking at "Episode 1, Episode
 * 3" deserves one sentence about why there is no 2 rather than a list that
 * looks like a bug.
 */
export function episodeGaps(saved: readonly SeriesEpisode[]): number[] {
  const nums = savedEpisodeNums(saved)
  if (nums.length === 0) return []
  const held = new Set(nums)
  const gaps: number[] = []
  for (let num = FIRST_EPISODE_NUM; num < nums[nums.length - 1]!; num += 1) {
    if (!held.has(num)) gaps.push(num)
  }
  return gaps
}

/** What removing one slot means for the server. */
export interface EpisodeRemoval {
  /** The number the position shows, whether or not the server has it. */
  episodeNum: number
  /**
   * What to send as `{ref}` — or null when nothing on the server needs
   * deleting, because the slot was never saved.
   */
  ref: string | number | null
  /** The saved row `ref` names, for the optimistic drop and the rollback. */
  savedRow: SeriesEpisode | null
}

/**
 * How to remove the slot at `index`, given what is saved.
 *
 * ── By post id when the video is saved in this series ─────────────────────
 * The route takes either, and the choice matters when there is an UNSAVED
 * reorder on screen. Saved 1:A, 2:B; the creator drags to B, A and then
 * removes A, which now sits at position 2. Deleting "episode 2" would delete
 * B — the video they kept — and a Discard right after would show them A, the
 * one they removed. Deleting by A's post id removes A, whatever number it
 * holds today, and the remaining slot B is then written to whichever number
 * survives on the next save.
 *
 * ── By number when the video at that position is not saved ────────────────
 * The creator replaced episode 2's video with D and has not saved, then
 * removes it. D is on no row, so deleting by its id would 404 while B sat on
 * the server at 2 with nothing on screen to remove it. What they are removing
 * is "episode 2", so the number is the ref, and B's row is what goes.
 *
 * ── Null when the slot was never saved and its number is free ─────────────
 * A slot added this session past the saved rows. Dropping it is a local edit
 * and no request is owed.
 */
export function episodeRemoval(
  saved: readonly SeriesEpisode[],
  slots: readonly EpisodeSlot[],
  index: number
): EpisodeRemoval | null {
  if (!canRemoveSlot(index, slots.length)) return null
  const slot = slots[index]!
  const episodeNum = episodeNumbers(saved, slots.length)[index]!

  const byPost = slot.postId ? (saved.find((e) => e.post_id === slot.postId) ?? null) : null
  if (byPost) return { episodeNum, ref: slot.postId, savedRow: byPost }

  const byNum = saved.find((e) => e.episode_num === episodeNum) ?? null
  if (byNum) return { episodeNum, ref: episodeNum, savedRow: byNum }

  return { episodeNum, ref: null, savedRow: null }
}
