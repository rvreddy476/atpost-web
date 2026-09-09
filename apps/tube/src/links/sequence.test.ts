import { describe, expect, it } from "vitest"
import type { SeriesEpisode } from "@/watch/api"
import { nextEpisode } from "@/watch/links"
import {
  FIRST_EPISODE_NUM,
  MAX_EPISODES,
  canRemoveSlot,
  duplicateSlots,
  episodeNumAt,
  episodeWrites,
  moveSlot,
  slotProblems,
  slotsFromEpisodes,
  strandedEpisodes,
  type EpisodeSlot,
} from "./sequence"

/**
 * Renumbering, and the two facts about this endpoint that make renumbering
 * dangerous rather than routine:
 *
 *   · episode numbers start at 1, and `episode_num: 0` is rejected as MISSING
 *     rather than as invalid, so an off-by-one shows up as "you did not send
 *     an episode number";
 *   · there is no delete, so a rearrangement that shortens a series leaves a
 *     row behind that nothing can remove.
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
})

describe("strandedEpisodes", () => {
  it("is empty when the list is the same length or longer", () => {
    const current = [saved(1, A), saved(2, B)]
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B)])).toEqual([])
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B), slot("3", C)])).toEqual([])
  })

  it("names the episodes a shorter list would abandon", () => {
    // There is NO delete route for an episode — verified, the group registers
    // only POST "", GET /:id, GET /:id/episodes and POST /:id/episodes. So a
    // list of two over a saved three leaves episode 3 pointing at whatever it
    // pointed at, while the editor shows two.
    const current = [saved(1, A), saved(2, B), saved(3, C)]
    expect(strandedEpisodes(current, [slot("1", A), slot("2", B)])).toEqual([3])
    expect(strandedEpisodes(current, [])).toEqual([1, 2, 3])
  })

  it("closes a gap in the saved numbering rather than reporting it", () => {
    // Saved 1, 2, 4 renumbers to 1, 2, 3 — and 4 is stranded, which is true
    // and is exactly what the creator has to be told.
    const current = [saved(1, A), saved(2, B), saved(4, C)]
    const slots = [slot("1", A), slot("2", B), slot("3", C)]
    expect(strandedEpisodes(current, slots)).toEqual([4])
  })
})

describe("canRemoveSlot", () => {
  it("allows removing a slot the server has never seen", () => {
    expect(canRemoveSlot(2, 2, 3)).toBe(true)
  })

  it("refuses to remove anything the server already has", () => {
    expect(canRemoveSlot(3, 2, 3)).toBe(false)
    expect(canRemoveSlot(3, 0, 3)).toBe(false)
  })

  it("refuses to remove from the middle even when the tail is unsaved", () => {
    // Removing slot 2 of three moves slot 3 up, which strands the last saved
    // number just as surely as dropping the tail would.
    expect(canRemoveSlot(1, 1, 3)).toBe(false)
    expect(canRemoveSlot(1, 2, 3)).toBe(true)
  })

  it("refuses on an empty list", () => {
    expect(canRemoveSlot(0, 0, 0)).toBe(false)
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

  it("closes a gap, so the editor and the server cannot show different numbers", () => {
    const episodes = [saved(1, A), saved(4, C)]
    const slots = slotsFromEpisodes(episodes, titleOf, mintKey)
    expect(slots.map((s) => s.postId)).toEqual([A, C])
    expect(slots.map((_, i) => episodeNumAt(i))).toEqual([1, 2])
  })

  it("carries the episode title and normalises a blank one", () => {
    const slots = slotsFromEpisodes([saved(1, A, "  Pilot  ")], titleOf, mintKey)
    expect(slots[0]!.title).toBe("Pilot")
    expect(slotsFromEpisodes([saved(1, A, "   ")], titleOf, mintKey)[0]!.title).toBe("")
  })
})
