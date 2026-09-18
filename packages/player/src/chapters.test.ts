import { describe, expect, it } from "vitest"
import {
  activePlayerChapter,
  chapterMarks,
  currentChapterTitle,
  orderedPlayerChapters,
  type PlayerChapter,
} from "./chapters"

const CHAPTERS: PlayerChapter[] = [
  { startMs: 0, title: "Intro" },
  { startMs: 60_000, title: "The build" },
  { startMs: 180_000, title: "Wrap up" },
]

describe("orderedPlayerChapters", () => {
  it("sorts on the start time, not on the order they arrived", () => {
    const shuffled = [CHAPTERS[2]!, CHAPTERS[0]!, CHAPTERS[1]!]
    expect(orderedPlayerChapters(shuffled).map((c) => c.title)).toEqual([
      "Intro",
      "The build",
      "Wrap up",
    ])
  })

  it("drops a negative start rather than clamping two rows onto zero", () => {
    const rows = orderedPlayerChapters([{ startMs: -1, title: "bad" }, ...CHAPTERS])
    expect(rows).toHaveLength(3)
  })

  it("drops a non-finite start", () => {
    expect(orderedPlayerChapters([{ startMs: Number.NaN, title: "bad" }])).toEqual([])
  })

  it("does not mutate the list it was given", () => {
    const input = [CHAPTERS[2]!, CHAPTERS[0]!]
    orderedPlayerChapters(input)
    expect(input[0]!.title).toBe("Wrap up")
  })
})

describe("activePlayerChapter", () => {
  it("is the LAST chapter starting at or before the playhead, not the nearest", () => {
    expect(activePlayerChapter(CHAPTERS, 61_000)).toBe(1)
    expect(activePlayerChapter(CHAPTERS, 179_999)).toBe(1)
  })

  it("changes exactly on the boundary", () => {
    expect(activePlayerChapter(CHAPTERS, 180_000)).toBe(2)
  })

  it("is -1 before the first chapter — a cold open is a real state", () => {
    expect(activePlayerChapter([{ startMs: 12_000, title: "Topic" }], 5_000)).toBe(-1)
  })

  it("is -1 for an empty list and for a playhead that is not a number", () => {
    expect(activePlayerChapter([], 1_000)).toBe(-1)
    expect(activePlayerChapter(CHAPTERS, Number.NaN)).toBe(-1)
  })
})

describe("currentChapterTitle", () => {
  it("names the chapter the playhead is in", () => {
    expect(currentChapterTitle(CHAPTERS, 70_000)).toBe("The build")
  })

  it("is null before the first chapter, so nothing is claimed", () => {
    expect(currentChapterTitle([{ startMs: 12_000, title: "Topic" }], 0)).toBeNull()
  })

  it("is null for a chapter whose title is only whitespace", () => {
    expect(currentChapterTitle([{ startMs: 0, title: "   " }], 1_000)).toBeNull()
  })
})

describe("chapterMarks", () => {
  it("places a tick at each start, as a fraction of the bar", () => {
    expect(chapterMarks(CHAPTERS, 240)).toEqual([0.25, 0.75])
  })

  it("never draws a tick at zero — it sits under the end cap and marks nothing", () => {
    expect(chapterMarks([{ startMs: 0, title: "Intro" }], 240)).toEqual([])
  })

  it("drops a chapter past the end, which is what a re-edit leaves behind", () => {
    expect(chapterMarks([{ startMs: 500_000, title: "Stale" }], 240)).toEqual([])
    expect(chapterMarks([{ startMs: 240_000, title: "Exactly the end" }], 240)).toEqual([])
  })

  it("draws nothing before the duration is known", () => {
    expect(chapterMarks(CHAPTERS, 0)).toEqual([])
    expect(chapterMarks(CHAPTERS, Number.NaN)).toEqual([])
  })
})
