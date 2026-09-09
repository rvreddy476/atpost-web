import { describe, expect, it } from "vitest"
import type { WatchProgress } from "./api"
import {
  RESUME_MIN_MS,
  SAVE_INTERVAL_MS,
  SAVE_MIN_DELTA_MS,
  completedFromEnd,
  resumeNotice,
  resumeTargetMs,
  shouldSaveProgress,
} from "./progress"

/**
 * Resume and the save cadence, asserted without a browser or a server.
 *
 * Both halves fail silently. A resume that fires at the wrong moment throws
 * somebody back into a video they had finished; a cadence that is too eager is
 * a POST every animation frame that nobody notices until the bill does; and a
 * save for a signed-out viewer is a 401 with a failed token refresh behind it,
 * on a loop, for as long as the tab is open.
 */

function progress(over: Partial<WatchProgress> = {}): WatchProgress {
  return {
    post_id: "p",
    position_ms: 60_000,
    duration_ms: 600_000,
    percent_watched: 10,
    completed: false,
    ...over,
  }
}

describe("resumeTargetMs", () => {
  it("resumes from the middle of a video", () => {
    expect(resumeTargetMs(progress({ position_ms: 60_000 }), 600_000)).toBe(60_000)
  })

  it("does not resume when there is no stored row", () => {
    expect(resumeTargetMs(null, 600_000)).toBeNull()
    expect(resumeTargetMs(undefined, 600_000)).toBeNull()
  })

  it("does not resume a view the server called complete", () => {
    expect(resumeTargetMs(progress({ completed: true }), 600_000)).toBeNull()
  })

  it("ignores a position too early to be a place somebody left off", () => {
    // Four seconds is the record of a video opened and closed, not a place.
    expect(resumeTargetMs(progress({ position_ms: RESUME_MIN_MS - 1 }), 600_000)).toBeNull()
    expect(resumeTargetMs(progress({ position_ms: RESUME_MIN_MS }), 600_000)).toBe(RESUME_MIN_MS)
  })

  it("starts over rather than landing on the credits", () => {
    expect(resumeTargetMs(progress({ position_ms: 570_000 }), 600_000)).toBeNull()
    expect(resumeTargetMs(progress({ position_ms: 569_000 }), 600_000)).toBe(569_000)
  })

  it("uses the PLAYER's duration, so a re-trimmed video starts over", () => {
    // The stored position is in a cut of the video that no longer exists.
    expect(resumeTargetMs(progress({ position_ms: 500_000 }), 120_000)).toBeNull()
  })

  it("still resumes when the duration is not known yet", () => {
    // The alternative is refusing to restore a real position because the
    // element has not reported metadata, which is a race rather than a rule.
    expect(resumeTargetMs(progress({ position_ms: 60_000 }), 0)).toBe(60_000)
  })
})

describe("resumeNotice", () => {
  it("names the time so the claim is checkable", () => {
    // A player that silently starts eleven minutes in reads as a broken video.
    expect(resumeNotice(64_000, () => "1:04")).toBe("Resumed from 1:04.")
  })
})

describe("shouldSaveProgress", () => {
  const base = {
    positionMs: 30_000,
    durationMs: 600_000,
    lastSavedPositionMs: null as number | null,
    lastSavedAtMs: null as number | null,
    nowMs: 1_000_000,
    signedIn: true,
  }

  it("never saves for a signed-out viewer, final save included", () => {
    // Not merely wasteful: each 401 costs a failed token refresh behind it.
    expect(shouldSaveProgress({ ...base, signedIn: false })).toBe(false)
    expect(shouldSaveProgress({ ...base, signedIn: false, final: true })).toBe(false)
  })

  it("never saves position zero, so an opened-and-abandoned video keeps its place", () => {
    expect(shouldSaveProgress({ ...base, positionMs: 0 })).toBe(false)
    expect(shouldSaveProgress({ ...base, positionMs: 0, final: true })).toBe(false)
  })

  it("saves the first real position immediately", () => {
    expect(shouldSaveProgress(base)).toBe(true)
  })

  it("refuses to repeat a position it has already sent", () => {
    // Leaving a paused video otherwise re-sends what the periodic save just
    // sent, and a video stalled on one buffered second would post for ever.
    expect(
      shouldSaveProgress({
        ...base,
        lastSavedPositionMs: 30_000,
        lastSavedAtMs: 0,
        final: true,
      })
    ).toBe(false)
  })

  it("needs BOTH enough time and enough movement", () => {
    const saved = { ...base, lastSavedPositionMs: 20_000, lastSavedAtMs: 0 }
    // Moved far, but only a moment ago.
    expect(shouldSaveProgress({ ...saved, positionMs: 30_000, nowMs: SAVE_INTERVAL_MS - 1 })).toBe(
      false
    )
    // Waited long enough, but the playhead has barely moved.
    expect(
      shouldSaveProgress({
        ...saved,
        positionMs: 20_000 + SAVE_MIN_DELTA_MS - 1,
        nowMs: SAVE_INTERVAL_MS,
      })
    ).toBe(false)
    // Both.
    expect(
      shouldSaveProgress({
        ...saved,
        positionMs: 20_000 + SAVE_MIN_DELTA_MS,
        nowMs: SAVE_INTERVAL_MS,
      })
    ).toBe(true)
  })

  it("counts a backwards seek as movement", () => {
    // Somebody who scrubs from 15:00 to 2:00 and leaves must not come back to
    // 15:00.
    expect(
      shouldSaveProgress({
        ...base,
        positionMs: 120_000,
        lastSavedPositionMs: 900_000,
        lastSavedAtMs: 0,
        nowMs: SAVE_INTERVAL_MS,
      })
    ).toBe(true)
  })

  it("bypasses the cadence for the save that matters most", () => {
    // The video ended, or the page is being left, one second after the last
    // periodic save. That is the position somebody actually stopped at.
    expect(
      shouldSaveProgress({
        ...base,
        positionMs: 31_000,
        lastSavedPositionMs: 30_000,
        lastSavedAtMs: 999_000,
        final: true,
      })
    ).toBe(true)
  })

  it("refuses a nonsense playhead", () => {
    expect(shouldSaveProgress({ ...base, positionMs: Number.NaN })).toBe(false)
  })
})

describe("completedFromEnd", () => {
  it("claims completion only when the element actually ended", () => {
    // Everything short of `ended` is left to the server's own 90% rule: a
    // client guessing at completion is a client deciding whether a view
    // counted, and that is not the client's decision.
    expect(completedFromEnd(true)).toBe(true)
    expect(completedFromEnd(false)).toBeUndefined()
  })
})
