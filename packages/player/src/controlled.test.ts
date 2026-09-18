import { describe, expect, it } from "vitest"
import {
  TIME_UPDATE_INTERVAL_MS,
  assignRef,
  mutedPropChanged,
  resolveMuted,
  shouldEmitTimeUpdate,
  type MutedInputs,
} from "./controlled"

describe("assignRef", () => {
  it("fills an object ref", () => {
    const ref: { current: string | null } = { current: null }
    assignRef(ref, "el")
    expect(ref.current).toBe("el")
  })

  it("calls a function ref", () => {
    const seen: (string | null)[] = []
    assignRef((value: string | null) => seen.push(value), "el")
    expect(seen).toEqual(["el"])
  })

  it("clears either kind on unmount", () => {
    const ref: { current: string | null } = { current: "el" }
    assignRef(ref, null)
    expect(ref.current).toBeNull()
  })

  it("does nothing at all when the caller passed none — the common case", () => {
    expect(() => assignRef(undefined, "el")).not.toThrow()
    expect(() => assignRef(null, "el")).not.toThrow()
  })
})

describe("shouldEmitTimeUpdate", () => {
  const fresh = { lastEmitAtMs: null, lastCurrentMs: 0 }

  it("always lets the first one through, so nobody shows 0:00 over a playing video", () => {
    expect(shouldEmitTimeUpdate(fresh, 1_000, 0)).toBe(true)
  })

  it("throttles the browser's own rate down to one per interval", () => {
    const memo = { lastEmitAtMs: 1_000, lastCurrentMs: 5_000 }
    expect(shouldEmitTimeUpdate(memo, 1_250, 5_250)).toBe(false)
    expect(shouldEmitTimeUpdate(memo, 1_999, 5_999)).toBe(false)
    expect(shouldEmitTimeUpdate(memo, 2_000, 6_000)).toBe(true)
  })

  it("lets a SEEK through immediately, whatever the clock says", () => {
    // The one moment a person is watching the scrubber rather than the video.
    const memo = { lastEmitAtMs: 1_000, lastCurrentMs: 5_000 }
    expect(shouldEmitTimeUpdate(memo, 1_010, 95_000)).toBe(true)
  })

  it("counts a jump BACKWARDS too — a rewind, and a loop", () => {
    const memo = { lastEmitAtMs: 1_000, lastCurrentMs: 30_000 }
    expect(shouldEmitTimeUpdate(memo, 1_010, 0)).toBe(true)
  })

  it("honours a caller's own interval", () => {
    const memo = { lastEmitAtMs: 1_000, lastCurrentMs: 0 }
    expect(shouldEmitTimeUpdate(memo, 1_300, 300, 250)).toBe(true)
  })

  it("stays quiet rather than emitting garbage for a playhead that is not a number", () => {
    const memo = { lastEmitAtMs: 1_000, lastCurrentMs: 5_000 }
    expect(shouldEmitTimeUpdate(memo, 1_010, Number.NaN)).toBe(false)
  })

  it("is the watch tracker's interval, and says so on purpose", () => {
    expect(TIME_UPDATE_INTERVAL_MS).toBe(1_000)
  })
})

describe("mutedPropChanged", () => {
  it("is false on the first render — a default arriving is not a decision", () => {
    expect(mutedPropChanged(null, true)).toBe(false)
    expect(mutedPropChanged(null, false)).toBe(false)
  })

  it("is false for the constant the feed and reels pass every render", () => {
    // If this ever returned true, a person's press of the speaker would be
    // overwritten on the next render and the button would do nothing.
    expect(mutedPropChanged(true, true)).toBe(false)
  })

  it("is true when a consumer's own mute button moves it", () => {
    expect(mutedPropChanged(true, false)).toBe(true)
    expect(mutedPropChanged(false, true)).toBe(true)
  })
})

describe("resolveMuted", () => {
  const base: MutedInputs = { prop: true, answered: null, startedWithSound: false, refused: false }

  it("is the prop for a cold document nobody has touched", () => {
    expect(resolveMuted(base)).toBe(true)
    expect(resolveMuted({ ...base, prop: false })).toBe(false)
  })

  it("lets the document's arming overrule the prop's default", () => {
    // A gesture has happened, so a playback STARTING now starts with sound.
    expect(resolveMuted({ ...base, startedWithSound: true })).toBe(false)
  })

  it("lets this player's own answer overrule the arming", () => {
    expect(resolveMuted({ ...base, answered: true, startedWithSound: true })).toBe(true)
  })

  it("lets a CONTROLLED prop win over the arming, which is the same rank", () => {
    // A changed prop becomes `answered` — see `mutedPropChanged`. The consumer
    // asked for silence and a document-wide default may not talk over it.
    const answered = mutedPropChanged(false, true) ? true : null
    expect(resolveMuted({ ...base, prop: true, answered, startedWithSound: true })).toBe(true)
  })

  it("lets a controlled UNMUTE win over a prop-shaped default of muted", () => {
    expect(resolveMuted({ ...base, prop: true, answered: false })).toBe(false)
  })

  it("lets a REFUSAL outrank every one of them, including an explicit unmute", () => {
    // The element is muted. A speaker glyph claiming otherwise would be the UI
    // lying about audio.
    expect(
      resolveMuted({ prop: false, answered: false, startedWithSound: true, refused: true })
    ).toBe(true)
  })

  it("is total: every combination answers a boolean", () => {
    for (const prop of [true, false]) {
      for (const answered of [true, false, null]) {
        for (const startedWithSound of [true, false]) {
          for (const refused of [true, false]) {
            expect(typeof resolveMuted({ prop, answered, startedWithSound, refused })).toBe(
              "boolean"
            )
          }
        }
      }
    }
  })
})
