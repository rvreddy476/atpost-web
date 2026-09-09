import { describe, expect, it } from "vitest"
import {
  CARD_TYPES,
  END_SCREEN_TYPES,
  MAX_ALTERNATES,
  MIN_ALTERNATE_GAP_MS,
  alternateProblem,
  alternateProblems,
  collidingAlternates,
  duplicateAlternates,
  emptyAlternate,
  isCardType,
  isEndScreenType,
  isUuid,
  parseClock,
  type AlternateDraft,
} from "./model"
import { CARD_VISIBLE_MS } from "@/watch/timeline"

/**
 * The rules the SERVER does not enforce.
 *
 * Every assertion here corresponds to something that was tried against the
 * running gateway and accepted: a card with no title, a card whose target is
 * the string "not-a-uuid", a card at -5000ms. Those all answer 200. This file
 * is the only thing standing between a creator and each of them.
 */

const SUBJECT = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const THIRD = "33333333-3333-4333-8333-333333333333"

function draft(over: Partial<AlternateDraft> = {}): AlternateDraft {
  return {
    key: "k1",
    targetId: OTHER,
    targetTitle: "Another video",
    title: "Watch this next",
    teaser: "",
    atMs: 30_000,
    ...over,
  }
}

describe("isUuid", () => {
  it("accepts the shape every id in this system has", () => {
    expect(isUuid(SUBJECT)).toBe(true)
    expect(isUuid("13FD3B68-20C2-40D4-B4EC-45144CFD5303")).toBe(true)
  })

  it("refuses what the cards endpoint would happily store", () => {
    // Verified: POST with target_id "not-a-uuid" answers 200 {"saved":1}. The
    // watch route then rejects `/tube/not-a-uuid` as malformed, so the card is
    // a link to a 404.
    expect(isUuid("not-a-uuid")).toBe(false)
    expect(isUuid("")).toBe(false)
    expect(isUuid(null)).toBe(false)
    expect(isUuid(`${SUBJECT} `)).toBe(false)
  })
})

describe("the two enums", () => {
  it("are not the same enum", () => {
    // Cards have `poll`; end screens have `channel_subscribe`. Sending one to
    // the other endpoint is a 500 from a database CHECK constraint, not a 400.
    expect(CARD_TYPES).toContain("poll")
    expect(CARD_TYPES).not.toContain("channel_subscribe")
    expect(END_SCREEN_TYPES).toContain("channel_subscribe")
    expect(END_SCREEN_TYPES).not.toContain("poll")
  })

  it("refuses a value from the other one", () => {
    expect(isCardType("channel_subscribe")).toBe(false)
    expect(isEndScreenType("poll")).toBe(false)
  })

  it("refuses anything that is not a string in the list", () => {
    for (const bad of ["", "VIDEO", "videos", null, undefined, 1, {}]) {
      expect(isCardType(bad)).toBe(false)
      expect(isEndScreenType(bad)).toBe(false)
    }
  })

  it("accepts every value the database allows", () => {
    for (const type of CARD_TYPES) expect(isCardType(type)).toBe(true)
    for (const type of END_SCREEN_TYPES) expect(isEndScreenType(type)).toBe(true)
  })
})

describe("alternateProblem", () => {
  it("passes a complete row", () => {
    expect(alternateProblem(draft(), SUBJECT, 120_000)).toBeNull()
  })

  it("refuses an empty title, which the server stores as an empty string", () => {
    const problem = alternateProblem(draft({ title: "   " }), SUBJECT, 120_000)
    expect(problem).toMatch(/title/i)
  })

  it("refuses a target that is not a valid id", () => {
    expect(alternateProblem(draft({ targetId: "not-a-uuid" }), SUBJECT, 0)).toMatch(/not open/i)
  })

  it("refuses a card that points at the video it is on", () => {
    expect(alternateProblem(draft({ targetId: SUBJECT }), SUBJECT, 0)).toMatch(/different/i)
  })

  it("refuses a negative timestamp, which the server stores verbatim", () => {
    // -5000 answered 200 and was read back as -5000. `activeCard` then clamps
    // it to 0, so the card silently becomes an opening card.
    expect(alternateProblem(draft({ atMs: -5_000 }), SUBJECT, 120_000)).toMatch(/inside/i)
  })

  it("refuses a timestamp past the end, which would never fire", () => {
    expect(alternateProblem(draft({ atMs: 120_000 }), SUBJECT, 120_000)).toMatch(/past the end/i)
    expect(alternateProblem(draft({ atMs: 119_999 }), SUBJECT, 120_000)).toBeNull()
  })

  it("skips the past-the-end check when the duration is unknown", () => {
    // A post whose media is still transcoding has no duration anywhere the
    // client can read. Refusing on a fact we do not have would be wrong.
    expect(alternateProblem(draft({ atMs: 9_000_000 }), SUBJECT, 0)).toBeNull()
  })

  it("names the missing target before anything else", () => {
    const bare = emptyAlternate("k", 0)
    expect(alternateProblem(bare, SUBJECT, 0)).toMatch(/pick a video/i)
  })
})

describe("collidingAlternates", () => {
  it("uses the watch page's own visible window as the minimum gap", () => {
    // Not an arbitrary second: `activeCard` shows ONE card and picks the
    // latest, so two cards closer than a full window means the first is cut
    // short by the second.
    expect(MIN_ALTERNATE_GAP_MS).toBe(CARD_VISIBLE_MS)
  })

  it("marks BOTH rows of a colliding pair", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 10_000 })
    const b = draft({ key: "b", targetId: THIRD, atMs: 10_000 + MIN_ALTERNATE_GAP_MS - 1 })
    expect(collidingAlternates([a, b])).toEqual(new Set(["a", "b"]))
  })

  it("allows exactly one gap between them", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 10_000 })
    const b = draft({ key: "b", targetId: THIRD, atMs: 10_000 + MIN_ALTERNATE_GAP_MS })
    expect(collidingAlternates([a, b]).size).toBe(0)
  })

  it("is order-independent", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 40_000 })
    const b = draft({ key: "b", targetId: THIRD, atMs: 39_000 })
    expect(collidingAlternates([a, b])).toEqual(collidingAlternates([b, a]))
  })

  it("ignores rows with no target, which already say what is wrong", () => {
    const a = emptyAlternate("a", 0)
    const b = emptyAlternate("b", 0)
    expect(collidingAlternates([a, b]).size).toBe(0)
  })

  it("catches a collision in a three-row set that is not adjacent in the list", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 0 })
    const b = draft({ key: "b", targetId: THIRD, atMs: 60_000 })
    const c = draft({ key: "c", targetId: "44444444-4444-4444-8444-444444444444", atMs: 1_000 })
    const hit = collidingAlternates([a, b, c])
    expect(hit).toEqual(new Set(["a", "c"]))
  })
})

describe("duplicateAlternates", () => {
  it("marks both rows pointing at one video", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 0 })
    const b = draft({ key: "b", targetId: OTHER, atMs: 90_000 })
    expect(duplicateAlternates([a, b])).toEqual(new Set(["a", "b"]))
  })

  it("says nothing about distinct targets", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 0 })
    const b = draft({ key: "b", targetId: THIRD, atMs: 90_000 })
    expect(duplicateAlternates([a, b]).size).toBe(0)
  })
})

describe("alternateProblems", () => {
  it("prefers the row's own problem over a collision", () => {
    // "Pick a video" is actionable; "row 2 clashes with row 1" on a row that
    // is not filled in yet is noise.
    const a = emptyAlternate("a", 1_000)
    const b = draft({ key: "b", atMs: 1_000 })
    const problems = alternateProblems([a, b], SUBJECT, 0)
    expect(problems.get("a")).toMatch(/pick a video/i)
    expect(problems.has("b")).toBe(false)
  })

  it("is empty for a clean set, which is what the save path requires", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 0 })
    const b = draft({ key: "b", targetId: THIRD, atMs: 60_000 })
    expect(alternateProblems([a, b], SUBJECT, 120_000).size).toBe(0)
  })

  it("reports duplicates before collisions when a row is both", () => {
    const a = draft({ key: "a", targetId: OTHER, atMs: 0 })
    const b = draft({ key: "b", targetId: OTHER, atMs: 100 })
    expect(alternateProblems([a, b], SUBJECT, 0).get("a")).toMatch(/same video/i)
  })
})

describe("MAX_ALTERNATES", () => {
  it("is the founder's number", () => {
    expect(MAX_ALTERNATES).toBe(3)
  })
})

describe("parseClock", () => {
  it("reads the shapes a person types", () => {
    expect(parseClock("90")).toBe(90_000)
    expect(parseClock("1:30")).toBe(90_000)
    expect(parseClock("1:02:03")).toBe(3_723_000)
    expect(parseClock(" 0:05 ")).toBe(5_000)
    expect(parseClock("0")).toBe(0)
  })

  it("refuses an out-of-range part rather than reinterpreting it", () => {
    // 1:70 as 130 seconds would put a card somewhere the creator did not.
    expect(parseClock("1:70")).toBeNull()
    expect(parseClock("1:02:99")).toBeNull()
  })

  it("refuses nonsense", () => {
    expect(parseClock("")).toBeNull()
    expect(parseClock("abc")).toBeNull()
    expect(parseClock("1:2:3:4")).toBeNull()
    expect(parseClock("-5")).toBeNull()
    expect(parseClock("1.5")).toBeNull()
  })
})
