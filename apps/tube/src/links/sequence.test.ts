import { describe, expect, it } from "vitest"
import type { SeriesEpisode } from "@/watch/api"
import { nextEpisode } from "@/watch/links"
import {
  FIRST_EPISODE_NUM,
  MAX_EPISODES,
  canRemoveSlot,
  duplicateSlots,
  episodeGaps,
  episodeNumAt,
  episodeNumbers,
  episodeRemoval,
  episodeWrites,
  moveSlot,
  slotProblems,
  slotsFromEpisodes,
  strandedEpisodes,
  type EpisodeSlot,
} from "./sequence"

/**
 * Numbering, and the two facts about these endpoints that make numbering
 * something to assert rather than assume:
 *
 *   · episode numbers start at 1, and `episode_num: 0` is rejected as MISSING
 *     rather than as invalid, so an off-by-one shows up as "you did not send
 *     an episode number";
 *   · `DELETE …/episodes/{ref}` leaves a gap and does not renumber, so after a
 *     removal the numbers on screen must be the numbers on the server, and a
 *     save must not quietly close the gap.
 */

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

function slot(key: string, postId: string, title = ""): EpisodeSlot {
  return { key, postId, videoTitle: `Video ${key}`, title }
}

function saved(num: number, postId: string, title: string | null = null): SeriesEpisode {
  return { series_id: "s", post_id: postId, episode_num: num, title }
}

describe("episode numbering", () => {
  it("starts at 1, because 0 is rejected as a missing field", () => {
    // Verified: POST …/episodes with episode_num 0 answers
    // 400 … 'EpisodeNum' failed on the 'required' tag. Go's binding:"required"
    // reads an int's zero value as absent.
    expect(FIRST_EPISODE_NUM).toBe(1)
    expect(episodeNumAt(0)).toBe(1)
    expect(episodeNumAt(2)).toBe(3)
  })

  it("caps at the founder's three", () => {
    expect(MAX_EPISODES).toBe(3)
  })
})

describe("episodeNumbers", () => {
  it("is 1, 2, 3 for a series with nothing saved", () => {
    expect(episodeNumbers([], 3)).toEqual([1, 2, 3])
    expect(episodeNumbers([], 0)).toEqual([])
  })

  it("is the saved numbers, in order, whatever order the server sent them", () => {
    expect(episodeNumbers([saved(3, C), saved(1, A), saved(2, B)], 3)).toEqual([1, 2, 3])
  })

  it("keeps a gap rather than closing it", () => {
    // Saved 1, 3 (2 was removed). The two positions are 1 and 3, not 1 and 2:
    // the server did not renumber and neither does the editor.
    expect(episodeNumbers([saved(1, A), saved(3, C)], 2)).toEqual([1, 3])
  })

  it("numbers an added slot after the highest saved number, never into the gap", () => {
    // A slot added at the bottom of the list plays last, so it is 4, not 2.
    expect(episodeNumbers([saved(1, A), saved(3, C)], 3)).toEqual([1, 3, 4])
    expect(episodeNumbers([saved(1, A), saved(3, C)], 4)).toEqual([1, 3, 4, 5])
  })

  it("answers a list shorter than what is saved with the first numbers, not a throw", () => {
    expect(episodeNumbers([saved(1, A), saved(2, B), saved(3, C)], 2)).toEqual([1, 2])
  })
})

describe("moveSlot", () => {
  it("moves rather than swaps", () => {
    // A swap would give C, B, A for "move the last to the front"; the creator
    // asked for C, A, B.
    const list = ["A", "B", "C"]
    expect(moveSlot(list, 2, 0)).toEqual(["C", "A", "B"])
    expect(moveSlot(list, 0, 2)).toEqual(["B", "C", "A"])
  })

  it("moves one step without disturbing the rest", () => {
    expect(moveSlot(["A", "B", "C"], 1, 0)).toEqual(["B", "A", "C"])
    expect(moveSlot(["A", "B", "C"], 1, 2)).toEqual(["A", "C", "B"])
  })

  it("returns a copy and never mutates", () => {
    const list = ["A", "B", "C"]
    const moved = moveSlot(list, 0, 1)
    expect(list).toEqual(["A", "B", "C"])
    expect(moved).not.toBe(list)
  })

  it("is a no-op at the ends, because the buttons can be pressed there", () => {
    expect(moveSlot(["A", "B"], 0, -1)).toEqual(["A", "B"])
    expect(moveSlot(["A", "B"], 1, 2)).toEqual(["A", "B"])
    expect(moveSlot(["A", "B"], 5, 0)).toEqual(["A", "B"])
    expect(moveSlot(["A", "B"], 1, 1)).toEqual(["A", "B"])
  })
})

describe("episodeWrites", () => {
  it("numbers by position, 1-based", () => {
    const writes = episodeWrites([], [slot("1", A), slot("2", B), slot("3", C)])
    expect(writes.map((w) => w.episodeNum)).toEqual([1, 2, 3])
    expect(writes.map((w) => w.postId)).toEqual([A, B, C])
    expect(writes.every((w) => w.episodeNum >= 1)).toBe(true)
  })

  it("sends nothing when nothing changed", () => {
    const current = [saved(1, A), saved(2, B)]
    expect(episodeWrites(current, [slot("1", A), slot("2", B)])).toEqual([])
  })

  it("renumbers correctly after a reorder", () => {
    // [A, B, C] -> [C, A, B]. Every slot now holds a different post, so all
    // three are rewritten, and each number is its new position.
    const current = [saved(1, A), saved(2, B), saved(3, C)]
    const next = moveSlot([slot("1", A), slot("2", B), slot("3", C)], 2, 0)
    expect(episodeWrites(current, next)).toEqual([
      { postId: C, episodeNum: 1, title: null },
      { postId: A, episodeNum: 2, title: null },
      { postId: B, episodeNum: 3, title: null },
    ])
  })

  it("only rewrites the slots a reorder actually disturbed", () => {
    // Swapping the last two leaves episode 1 alone. Two requests, not three.
    const current = [saved(1, A), saved(2, B), saved(3, C)]
    const next = moveSlot([slot("1", A), slot("2", B), slot("3", C)], 1, 2)
    expect(episodeWrites(current, next)).toEqual([
      { postId: C, episodeNum: 2, title: null },
      { postId: B, episodeNum: 3, title: null },
    ])
  })

  it("rewrites a slot whose title changed even though its post did not", () => {
    const current = [saved(1, A, "Old name")]
    expect(episodeWrites(current, [slot("1", A, "New name")])).toEqual([
      { postId: A, episodeNum: 1, title: "New name" },
    ])
  })

  it("treats a blank title and an absent one as the same", () => {
    const current = [saved(1, A, null)]
    expect(episodeWrites(current, [slot("1", A, "   ")])).toEqual([])
  })

  it("never writes a slot with no video, so a half-filled row is not saved", () => {
    const writes = episodeWrites([], [slot("1", A), slot("2", "")])
    expect(writes).toEqual([{ postId: A, episodeNum: 1, title: null }])
  })

  it("writes a gapped series to its own numbers, not to 1, 2, 3", () => {
    // Saved 1, 2, 4. Moving the last to the front rewrites every position,
    // and the positions are 1, 2, 4: nothing is written to 3.
    const current = [saved(1, A), saved(2, B), saved(4, C)]
    const next = moveSlot([slot("1", A), slot("2", B), slot("3", C)], 2, 0)
    expect(episodeWrites(current, next)).toEqual([
      { postId: C, episodeNum: 1, title: null },
      { postId: A, episodeNum: 2, title: null },
      { postId: B, episodeNum: 4, title: null },
    ])
  })
})

describe("removing an episode", () => {
  it("leaves a gap and does not renumber the rest", () => {
    // The server's rule, and the sequence this editor now follows: saved
    // 1:A, 2:B, 3:C; the creator confirms Remove on episode 2. What remains is
    // 1:A and 3:C, shown as episodes 1 and 3, and a save has nothing to write
    // because nobody moved. An earlier editor would have shown 1 and 2 and
    // then refused to save because 3 was "stranded".
    const before = [saved(1, A), saved(2, B), saved(3, C)]
    const slots = [slot("1", A), slot("2", B), slot("3", C)]
    const plan = episodeRemoval(before, slots, 1)!
    expect(plan.episodeNum).toBe(2)

    const after = before.filter((e) => e !== plan.savedRow)
    const remaining = slots.filter((_, i) => i !== 1)
    expect(episodeNumbers(after, remaining.length)).toEqual([1, 3])
    expect(episodeWrites(after, remaining)).toEqual([])
    expect(strandedEpisodes(after, remaining)).toEqual([])
    expect(episodeGaps(after)).toEqual([2])
  })

  it("removes from the front and the back the same way", () => {
    const before = [saved(1, A), saved(2, B), saved(3, C)]
    const slots = [slot("1", A), slot("2", B), slot("3", C)]

    const first = episodeRemoval(before, slots, 0)!
    const afterFirst = before.filter((e) => e !== first.savedRow)
    expect(episodeNumbers(afterFirst, 2)).toEqual([2, 3])
    expect(episodeGaps(afterFirst)).toEqual([1])

    const last = episodeRemoval(before, slots, 2)!
    const afterLast = before.filter((e) => e !== last.savedRow)
    expect(episodeNumbers(afterLast, 2)).toEqual([1, 2])
    expect(episodeGaps(afterLast)).toEqual([])
  })

  it("costs a viewer nothing, because the watch page steps over the gap", () => {
    // What a viewer sees after the removal above: episode 1 offers episode 3.
    expect(nextEpisode([saved(1, A), saved(3, C)], A)?.post_id).toBe(C)
  })
})

describe("episodeRemoval", () => {
  it("deletes by post id when that video is saved in the series", () => {
    const current = [saved(1, A), saved(2, B)]
    const plan = episodeRemoval(current, [slot("1", A), slot("2", B)], 1)!
    expect(plan).toEqual({ episodeNum: 2, ref: B, savedRow: current[1] })
  })

  it("follows the video, not the position, across an unsaved reorder", () => {
    // Saved 1:A, 2:B; the creator drags to B, A (unsaved) and removes A, now
    // at position 2. Deleting "episode 2" would delete B, the one they kept.
    const current = [saved(1, A), saved(2, B)]
    const reordered = moveSlot([slot("1", A), slot("2", B)], 1, 0)
    const plan = episodeRemoval(current, reordered, 1)!
    expect(plan.ref).toBe(A)
    expect(plan.savedRow).toBe(current[0])
  })

  it("deletes by number when the position's saved video was replaced on screen", () => {
    // Episode 2 is B on the server; the creator put C there without saving,
    // then removes it. C is on no row, so the number is what names the row.
    const current = [saved(1, A), saved(2, B)]
    const plan = episodeRemoval(current, [slot("1", A), slot("2", C)], 1)!
    expect(plan).toEqual({ episodeNum: 2, ref: 2, savedRow: current[1] })
  })

  it("owes no request for a slot added this session", () => {
    const current = [saved(1, A)]
    const plan = episodeRemoval(current, [slot("1", A), slot("2", C)], 1)!
    expect(plan).toEqual({ episodeNum: 2, ref: null, savedRow: null })
  })

  it("answers null out of range, so a stray click deletes nothing", () => {
    expect(episodeRemoval([saved(1, A)], [slot("1", A)], 1)).toBeNull()
    expect(episodeRemoval([], [], 0)).toBeNull()
  })
})

describe("strandedEpisodes", () => {
  it("is empty when every saved number has a position", () => {
    const current = [saved(1, A), saved(2, B)]
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B)])).toEqual([])
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B), slot("3", C)])).toEqual([])
  })

  it("is empty for a gapped series, because the gap is not an abandoned row", () => {
    // Saved 1, 2, 4 used to strand 4 by renumbering to 1, 2, 3. Now the
    // positions ARE 1, 2, 4.
    const current = [saved(1, A), saved(2, B), saved(4, C)]
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B), slot("3", C)])).toEqual([])
  })

  it("still names a saved row with no position, which is now a reload-me", () => {
    // Not a shape removal produces (the row and the slot go together), but
    // the save path refuses it rather than leaving episode 3 behind silently.
    const current = [saved(1, A), saved(2, B), saved(3, C)]
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B)])).toEqual([3])
    expect(strandedEpisodes(current, [])).toEqual([1, 2, 3])
  })
})

describe("canRemoveSlot", () => {
  it("allows any slot that exists, saved or not, first or middle or last", () => {
    expect(canRemoveSlot(0, 3)).toBe(true)
    expect(canRemoveSlot(1, 3)).toBe(true)
    expect(canRemoveSlot(2, 3)).toBe(true)
  })

  it("refuses only what is out of range", () => {
    expect(canRemoveSlot(0, 0)).toBe(false)
    expect(canRemoveSlot(3, 3)).toBe(false)
    expect(canRemoveSlot(-1, 3)).toBe(false)
  })
})

describe("episodeGaps", () => {
  it("names the numbers below the highest saved one that nothing holds", () => {
    expect(episodeGaps([saved(1, A), saved(3, C)])).toEqual([2])
    expect(episodeGaps([saved(2, B), saved(5, C)])).toEqual([1, 3, 4])
  })

  it("is empty for a contiguous series and for an empty one", () => {
    expect(episodeGaps([saved(1, A), saved(2, B)])).toEqual([])
    expect(episodeGaps([])).toEqual([])
  })
})

describe("duplicateSlots and slotProblems", () => {
  it("refuses one video at two episode numbers", () => {
    // Reproduced against the server: upserting post C at episode 1 while it
    // was episode 3 answered 201 and left it at both. `nextEpisode` then finds
    // the FIRST index and offers episode 2 after it, which offers episode 3,
    // which is the same video — a loop.
    const slots = [slot("1", C), slot("2", B), slot("3", C)]
    expect(duplicateSlots(slots)).toEqual(new Set(["1", "3"]))
    expect(slotProblems(slots).get("1")).toMatch(/already another episode/i)
  })

  it("demonstrates the loop the refusal prevents", () => {
    const episodes = [saved(1, C), saved(2, B), saved(3, C)]
    // Watching C, the watch page offers episode 2 (B); watching B it offers
    // episode 3, which is C again.
    expect(nextEpisode(episodes, C)?.post_id).toBe(B)
    expect(nextEpisode(episodes, B)?.post_id).toBe(C)
  })

  it("says nothing about a clean sequence", () => {
    expect(slotProblems([slot("1", A), slot("2", B)]).size).toBe(0)
  })

  it("names an empty slot", () => {
    expect(slotProblems([slot("1", "")]).get("1")).toMatch(/pick a video/i)
  })
})

describe("slotsFromEpisodes", () => {
  const titleOf = (postId: string) => `Title of ${postId.slice(0, 1)}`
  const mintKey = (postId: string, index: number) => `${index}:${postId}`

  it("orders by episode_num rather than trusting the response order", () => {
    const episodes = [saved(3, C), saved(1, A), saved(2, B)]
    expect(slotsFromEpisodes(episodes, titleOf, mintKey).map((s) => s.postId)).toEqual([A, B, C])
  })

  it("keeps a gap, so the editor and the server show the same numbers", () => {
    const episodes = [saved(1, A), saved(4, C)]
    const slots = slotsFromEpisodes(episodes, titleOf, mintKey)
    expect(slots.map((s) => s.postId)).toEqual([A, C])
    expect(episodeNumbers(episodes, slots.length)).toEqual([1, 4])
  })

  it("carries the episode title and normalises a blank one", () => {
    const slots = slotsFromEpisodes([saved(1, A, "  Pilot  ")], titleOf, mintKey)
    expect(slots[0]!.title).toBe("Pilot")
    expect(slotsFromEpisodes([saved(1, A, "   ")], titleOf, mintKey)[0]!.title).toBe("")
  })
})
