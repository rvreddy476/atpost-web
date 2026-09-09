import { describe, expect, it } from "vitest"
import type { Chapter, EndScreen, VideoCard } from "./api"
import {
  CARD_VISIBLE_MS,
  END_SCREEN_TAIL_MS,
  activeCard,
  activeChapterIndex,
  activeEndScreens,
  chapterClock,
  chapterEndMs,
  chapterSeekMs,
  endScreenSlot,
  inEndScreenWindow,
  orderedChapters,
} from "./timeline"

/**
 * The playhead arithmetic, asserted without a browser.
 *
 * Everything here ships silently when it is wrong. A chapter list that seeks
 * backwards, a card that reappears after somebody closed it, an end screen over
 * the middle of a video, a tile positioned at NaN% — none of them throws, none
 * of them logs, and all of them are the kind of thing a person notices once and
 * cannot reproduce.
 */

function chapter(index: number, startMs: number, title = `Chapter ${index}`): Chapter {
  return { post_id: "p", chapter_index: index, title, start_ms: startMs }
}

function card(id: string, appearAtMs: number): VideoCard {
  return { id, post_id: "p", type: "video", title: `Card ${id}`, appear_at_ms: appearAtMs }
}

function screen(id: string, startMs: number, endMs: number): EndScreen {
  return { id, post_id: "p", type: "video", start_ms: startMs, end_ms: endMs, position: {} }
}

describe("orderedChapters", () => {
  it("orders by start_ms and NOT by the author's numbering", () => {
    // chapter_index is the author's numbering and nothing forces it to ascend
    // with time. A list that jumps backwards leaves somebody who clicked the
    // third row landing before the second with no way to tell what happened.
    const out = orderedChapters([chapter(0, 60_000), chapter(1, 10_000), chapter(2, 30_000)])
    expect(out.map((c) => c.start_ms)).toEqual([10_000, 30_000, 60_000])
  })

  it("drops a chapter that claims to start before the video does", () => {
    // Clamping it to 0 would create a second chapter at 0 and make
    // activeChapterIndex pick between them arbitrarily.
    const out = orderedChapters([chapter(0, -5_000), chapter(1, 0)])
    expect(out).toHaveLength(1)
    expect(out[0]!.chapter_index).toBe(1)
  })

  it("drops a non-finite start rather than sorting NaN into the middle", () => {
    expect(orderedChapters([chapter(0, Number.NaN), chapter(1, 5)])).toHaveLength(1)
  })

  it("breaks a tie on the lower index, so the order is stable across renders", () => {
    const out = orderedChapters([chapter(3, 1_000), chapter(1, 1_000)])
    expect(out.map((c) => c.chapter_index)).toEqual([1, 3])
  })

  it("does not mutate the list it was given", () => {
    const input = [chapter(0, 60_000), chapter(1, 10_000)]
    orderedChapters(input)
    expect(input.map((c) => c.start_ms)).toEqual([60_000, 10_000])
  })
})

describe("activeChapterIndex", () => {
  const chapters = orderedChapters([chapter(0, 0), chapter(1, 60_000), chapter(2, 120_000)])

  it("is the LAST chapter that has started, not the nearest one", () => {
    // A chapter is a span running until the next one begins. At 61s the answer
    // is the second and stays the second for the whole minute.
    expect(activeChapterIndex(chapters, 61_000)).toBe(1)
    expect(activeChapterIndex(chapters, 119_999)).toBe(1)
  })

  it("changes exactly at the boundary", () => {
    expect(activeChapterIndex(chapters, 59_999)).toBe(0)
    expect(activeChapterIndex(chapters, 60_000)).toBe(1)
  })

  it("is -1 before the first chapter, which is a real state", () => {
    // An author whose list starts after a cold open: highlighting chapter one
    // during the cold open is a small lie about where you are.
    const late = orderedChapters([chapter(0, 12_000)])
    expect(activeChapterIndex(late, 0)).toBe(-1)
    expect(activeChapterIndex(late, 11_999)).toBe(-1)
    expect(activeChapterIndex(late, 12_000)).toBe(0)
  })

  it("is -1 for an empty list and for a nonsense playhead", () => {
    expect(activeChapterIndex([], 5_000)).toBe(-1)
    expect(activeChapterIndex(chapters, Number.NaN)).toBe(-1)
  })
})

describe("chapterEndMs", () => {
  const chapters = orderedChapters([chapter(0, 0), chapter(1, 60_000)])

  it("ends where the next one starts", () => {
    expect(chapterEndMs(chapters, 0, 180_000)).toBe(60_000)
  })

  it("ends with the video for the last chapter", () => {
    expect(chapterEndMs(chapters, 1, 180_000)).toBe(180_000)
  })

  it("is Infinity for the last chapter while the duration is unknown", () => {
    // 0 would make a progress bar draw the last chapter as complete the instant
    // it started.
    expect(chapterEndMs(chapters, 1, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("chapterSeekMs", () => {
  it("seeks to the chapter's own start in the ordinary case", () => {
    expect(chapterSeekMs(60_000, 180_000)).toBe(60_000)
  })

  it("keeps a seek INSIDE the video rather than exactly at its end", () => {
    // currentTime === duration fires `ended` on most browsers, so a chapter
    // written against a longer cut would end the video instead of seeking.
    expect(chapterSeekMs(300_000, 180_000)).toBe(179_000)
  })

  it("passes the start through untouched while the duration is unknown", () => {
    expect(chapterSeekMs(60_000, 0)).toBe(60_000)
  })

  it("never returns a negative time", () => {
    expect(chapterSeekMs(-5_000, 180_000)).toBe(0)
    expect(chapterSeekMs(5_000, 500)).toBe(0)
  })
})

describe("chapterClock", () => {
  it("drops the hour until there is one", () => {
    expect(chapterClock(0)).toBe("0:00")
    expect(chapterClock(64_000)).toBe("1:04")
    expect(chapterClock(3_723_000)).toBe("1:02:03")
  })

  it("pads the minutes only once there is an hour in front of them", () => {
    expect(chapterClock(9 * 60_000)).toBe("9:00")
    expect(chapterClock(3_600_000 + 9 * 60_000)).toBe("1:09:00")
  })

  it("never shows a negative clock", () => {
    expect(chapterClock(-1_000)).toBe("0:00")
  })
})

describe("activeCard", () => {
  const none: ReadonlySet<string> = new Set()

  it("shows a card from its moment for the length of its window", () => {
    const cards = [card("a", 15_000)]
    expect(activeCard(cards, 14_999, none)).toBeNull()
    expect(activeCard(cards, 15_000, none)!.id).toBe("a")
    expect(activeCard(cards, 15_000 + CARD_VISIBLE_MS - 1, none)!.id).toBe("a")
    expect(activeCard(cards, 15_000 + CARD_VISIBLE_MS, none)).toBeNull()
  })

  it("shows the LATEST of two overlapping cards, never both", () => {
    // Two prompts stacked in one corner is how both become unreadable, and the
    // newest is the one whose moment the video has just reached.
    const cards = [card("older", 10_000), card("newer", 12_000)]
    expect(activeCard(cards, 13_000, none)!.id).toBe("newer")
  })

  it("stays dismissed, including after a seek back over its window", () => {
    // Re-showing a card somebody closed because the playhead moved is the
    // single most annoying thing an overlay can do.
    const cards = [card("a", 15_000)]
    const dismissed = new Set(["a"])
    expect(activeCard(cards, 16_000, dismissed)).toBeNull()
    expect(activeCard(cards, 15_000, dismissed)).toBeNull()
  })

  it("falls back to the next card when the newest one is dismissed", () => {
    const cards = [card("older", 10_000), card("newer", 12_000)]
    expect(activeCard(cards, 13_000, new Set(["newer"]))!.id).toBe("older")
  })

  it("treats a negative appear_at as zero rather than dropping the card", () => {
    expect(activeCard([card("a", -1_000)], 0, none)!.id).toBe("a")
  })

  it("is null for an empty list and for a nonsense playhead", () => {
    expect(activeCard([], 1_000, none)).toBeNull()
    expect(activeCard([card("a", 0)], Number.NaN, none)).toBeNull()
  })
})

describe("activeEndScreens", () => {
  it("is half-open, so two back-to-back screens never both appear", () => {
    const screens = [screen("a", 0, 100_000), screen("b", 100_000, 200_000)]
    expect(activeEndScreens(screens, 99_999).map((s) => s.id)).toEqual(["a"])
    expect(activeEndScreens(screens, 100_000).map((s) => s.id)).toEqual(["b"])
  })

  it("returns several at once — an end screen is a tile, not a prompt", () => {
    const screens = [screen("a", 0, 100_000), screen("b", 10_000, 100_000)]
    expect(activeEndScreens(screens, 50_000)).toHaveLength(2)
  })

  it("drops a row whose window is empty or inverted", () => {
    // An overlay that appears and vanishes in one frame is worse than one that
    // never appears.
    expect(activeEndScreens([screen("a", 100, 100)], 100)).toHaveLength(0)
    expect(activeEndScreens([screen("a", 200, 100)], 150)).toHaveLength(0)
  })

  it("drops a row with a non-finite bound", () => {
    expect(activeEndScreens([screen("a", Number.NaN, 100)], 50)).toHaveLength(0)
  })
})

describe("endScreenSlot", () => {
  it("reads values above 1 as percentages", () => {
    expect(endScreenSlot({ x: 10, y: 20, w: 30, h: 25 })).toEqual({
      leftPct: 10,
      topPct: 20,
      widthPct: 30,
      heightPct: 25,
    })
  })

  it("reads values at or below 1 as fractions of the frame", () => {
    // Both conventions are plausible for an unschema'd JSONB column and they
    // cannot be confused except at exactly 1, where the fraction reading is the
    // one that leaves something on screen.
    expect(endScreenSlot({ x: 0.1, y: 0.2, w: 0.3, h: 0.25 })).toEqual({
      leftPct: 10,
      topPct: 20,
      widthPct: 30,
      heightPct: 25,
    })
  })

  it("accepts left/top/width/height as well as x/y/w/h", () => {
    expect(endScreenSlot({ left: 5, top: 5, width: 20, height: 20 })?.leftPct).toBe(5)
  })

  it("keeps a tile on the picture", () => {
    const slot = endScreenSlot({ x: 95, y: 95, w: 30, h: 30 })!
    expect(slot.leftPct).toBe(70)
    expect(slot.topPct).toBe(70)
  })

  it("falls back to a default size rather than a zero-sized tile", () => {
    const slot = endScreenSlot({ x: 10, y: 10, w: 0, h: 0 })!
    expect(slot.widthPct).toBeGreaterThan(0)
    expect(slot.heightPct).toBeGreaterThan(0)
  })

  it("returns null for anything it cannot read, so the caller lays it out", () => {
    // `position` is JSONB with no schema and no writer anywhere in the product.
    // A tile in an approximate place is cosmetic; a tile at NaN% is invisible.
    expect(endScreenSlot(null)).toBeNull()
    expect(endScreenSlot(undefined)).toBeNull()
    expect(endScreenSlot("bottom-left")).toBeNull()
    expect(endScreenSlot({ anchor: "bottom-left" })).toBeNull()
    expect(endScreenSlot({ x: "10", y: "10" })).toBeNull()
    expect(endScreenSlot({ x: -1, y: 10 })).toBeNull()
    expect(endScreenSlot({ x: Number.NaN, y: 0 })).toBeNull()
  })
})

describe("inEndScreenWindow", () => {
  it("uses the thirty-second floor on a short video, where 20% would be a blink", () => {
    // A two-minute video: 20% is 24s, so the floor decides and the window opens
    // at 1:30. Without the floor an author's end screen on a short video would
    // have almost no time to be seen.
    const duration = 120_000
    expect(inEndScreenWindow(duration - END_SCREEN_TAIL_MS, duration)).toBe(true)
    expect(inEndScreenWindow(duration - END_SCREEN_TAIL_MS - 1, duration)).toBe(false)
  })

  it("uses the fraction once the video is long enough for it to dominate", () => {
    // An hour: 20% is twelve minutes, which is what "near the end" means here.
    const duration = 60 * 60_000
    expect(inEndScreenWindow(duration * 0.8, duration)).toBe(true)
    expect(inEndScreenWindow(duration * 0.79, duration)).toBe(false)
  })

  it("takes whichever of the two is more generous", () => {
    // 20 minutes: the fraction (4 min) beats the floor (30s), and the window
    // therefore opens at 16:00 rather than at 19:30.
    const duration = 20 * 60_000
    expect(inEndScreenWindow(duration - END_SCREEN_TAIL_MS - 1, duration)).toBe(true)
    expect(inEndScreenWindow(duration * 0.8, duration)).toBe(true)
    expect(inEndScreenWindow(duration * 0.79, duration)).toBe(false)
  })

  it("does not withhold an authored screen just because the duration is unknown", () => {
    expect(inEndScreenWindow(1_000, 0)).toBe(true)
    expect(inEndScreenWindow(1_000, Number.NaN)).toBe(true)
  })

  it("is false for a nonsense playhead", () => {
    expect(inEndScreenWindow(Number.NaN, 60_000)).toBe(false)
  })
})
