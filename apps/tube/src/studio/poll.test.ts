import { describe, expect, it } from "vitest"
import {
  classifyMediaStatus,
  mediaFacts,
  POLL_CEILING_MS,
  POLL_FAST_ATTEMPTS,
  POLL_FLOOR_MS,
  pollDelayMs,
  PROCESSING_DEADLINE_MS,
  processingTimedOut,
} from "./poll"

describe("pollDelayMs", () => {
  // A five-second clip is ready about eight seconds after confirm on this
  // stack, so the common case must be over before any backoff applies.
  it("stays at the floor for the first few attempts", () => {
    for (let i = 0; i < POLL_FAST_ATTEMPTS; i++) {
      expect(pollDelayMs(i)).toBe(POLL_FLOOR_MS)
    }
  })

  it("grows after that", () => {
    expect(pollDelayMs(POLL_FAST_ATTEMPTS)).toBeGreaterThan(POLL_FLOOR_MS)
  })

  it("never decreases", () => {
    let previous = 0
    for (let i = 0; i < 40; i++) {
      const delay = pollDelayMs(i)
      expect(delay).toBeGreaterThanOrEqual(previous)
      previous = delay
    }
  })

  // The ceiling is the only thing telling somebody their upload is alive.
  it("is capped", () => {
    for (let i = 0; i < 200; i++) {
      expect(pollDelayMs(i)).toBeLessThanOrEqual(POLL_CEILING_MS)
    }
    expect(pollDelayMs(100)).toBe(POLL_CEILING_MS)
  })

  it("reaches the ceiling within a minute of polling", () => {
    let elapsed = 0
    let attempt = 0
    while (pollDelayMs(attempt) < POLL_CEILING_MS && attempt < 1000) {
      elapsed += pollDelayMs(attempt)
      attempt++
    }
    expect(elapsed).toBeLessThan(60_000)
  })
})

describe("processingTimedOut", () => {
  it("waits the full deadline", () => {
    expect(processingTimedOut(0)).toBe(false)
    expect(processingTimedOut(PROCESSING_DEADLINE_MS - 1)).toBe(false)
    expect(processingTimedOut(PROCESSING_DEADLINE_MS)).toBe(true)
  })
})

describe("classifyMediaStatus", () => {
  // Both columns, always. Attaching on `ready` alone is how a video gets
  // published seconds before a moderator rejects it.
  it("is ready only when the encode AND moderation are both done", () => {
    expect(
      classifyMediaStatus({ processing_status: "ready", moderation_status: "passed" }).kind
    ).toBe("ready")
    expect(
      classifyMediaStatus({ processing_status: "ready", moderation_status: "pending" }).kind
    ).toBe("waiting")
    expect(
      classifyMediaStatus({ processing_status: "processing", moderation_status: "passed" }).kind
    ).toBe("waiting")
  })

  // The order of the checks: a row can be `ready` and `rejected` at once.
  it("reads rejection before readiness", () => {
    expect(
      classifyMediaStatus({ processing_status: "ready", moderation_status: "rejected" }).kind
    ).toBe("rejected")
  })

  it("separates a failed transcode from a rejection", () => {
    expect(
      classifyMediaStatus({ processing_status: "failed", moderation_status: "pending" }).kind
    ).toBe("failed")
    expect(
      classifyMediaStatus({ processing_status: "rejected", moderation_status: "pending" }).kind
    ).toBe("rejected")
  })

  it("keeps waiting through manual review, and says a human is looking", () => {
    const verdict = classifyMediaStatus({
      processing_status: "ready",
      moderation_status: "manual_review",
    })
    expect(verdict.kind).toBe("waiting")
    expect(verdict.kind === "waiting" && verdict.message).toMatch(/reviewer/i)
  })

  it("handles the whole documented processing ladder without throwing", () => {
    for (const processing of ["pending_upload", "uploaded", "processing", "ready"]) {
      const verdict = classifyMediaStatus({ processing_status: processing })
      expect(["waiting", "ready"]).toContain(verdict.kind)
    }
  })

  // An empty body is what a 200 with no data looks like. It must read as
  // "still going", never as ready.
  it("treats an empty body as still waiting", () => {
    expect(classifyMediaStatus({}).kind).toBe("waiting")
  })
})

describe("mediaFacts", () => {
  // Width and height are absent for the first several polls, observed. Zeros
  // would render as "0×0, 0s", which reads as a broken file.
  it("is null until the encoder has opened the file", () => {
    expect(mediaFacts({ processing_status: "processing" })).toBeNull()
    expect(mediaFacts({ width: 0, height: 0 })).toBeNull()
  })

  it("prefers duration_ms and falls back to seconds", () => {
    expect(mediaFacts({ width: 640, height: 360, duration_ms: 5123 })).toEqual({
      width: 640,
      height: 360,
      durationMs: 5123,
    })
    expect(mediaFacts({ width: 640, height: 360, duration_seconds: 5 })).toEqual({
      width: 640,
      height: 360,
      durationMs: 5000,
    })
  })

  it("reports a duration of zero rather than null when only the size is known", () => {
    expect(mediaFacts({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
      durationMs: 0,
    })
  })
})
