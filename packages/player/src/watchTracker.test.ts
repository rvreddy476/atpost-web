import { describe, expect, it } from "vitest"
import { WatchSession, type WatchEvent, type WatchSessionInfo } from "./watchTracker"

const info = (durationMs: number): WatchSessionInfo => ({
  sessionId: "11111111-1111-4111-8111-111111111111",
  contentId: "22222222-2222-4222-8222-222222222222",
  contentDurationMs: durationMs,
  surface: "feed",
})

function harness(durationMs: number) {
  const events: WatchEvent[] = []
  const session = new WatchSession(info(durationMs), (e) => events.push(e))
  return { events, session }
}

const started = (durationMs: number) => {
  const h = harness(durationMs)
  h.session.start({
    startMethod: "autoplay",
    isMuted: true,
    isAutoplay: true,
    timeToFirstFrameMs: 120,
  })
  return h
}

/** Play forward normally for `seconds` one-second ticks. */
function playForward(session: WatchSession, seconds: number, fromMs = 0) {
  for (let i = 1; i <= seconds; i++) session.sample(fromMs + i * 1000, 1000)
}

describe("start", () => {
  it("refuses a zero duration — the server divides by it", () => {
    const h = harness(0)
    h.session.start({ startMethod: "tap", isMuted: false, isAutoplay: false, timeToFirstFrameMs: 0 })
    expect(h.events).toHaveLength(0)
    expect(h.session.hasStarted).toBe(false)
  })

  it("emits exactly one play_start however many times it is called", () => {
    const h = started(60_000)
    h.session.start({ startMethod: "tap", isMuted: false, isAutoplay: false, timeToFirstFrameMs: 0 })
    expect(h.events.filter((e) => e.kind === "play_start")).toHaveLength(1)
  })
})

describe("watch time comes from the playhead", () => {
  it("counts forward playback", () => {
    const h = started(60_000)
    playForward(h.session, 4)
    expect(h.session.watchedMs).toBe(4000)
  })

  it("counts NOTHING while the playhead does not move", () => {
    // A buffering or paused video. Wall-clock time would have counted 5s here,
    // and that difference is money.
    const h = started(60_000)
    for (let i = 0; i < 5; i++) h.session.sample(0, 1000, true)
    expect(h.session.watchedMs).toBe(0)
  })

  it("emits no heartbeat for a stalled video", () => {
    const h = started(60_000)
    for (let i = 0; i < 10; i++) h.session.sample(0, 1000, true)
    expect(h.events.filter((e) => e.kind === "heartbeat")).toHaveLength(0)
  })
})

describe("seeks", () => {
  it("credits nothing for dragging the scrubber to the end", () => {
    const h = started(600_000)
    h.session.sample(1000, 1000)
    h.session.sample(590_000, 1000) // a huge forward jump
    expect(h.session.watchedMs).toBe(1000)
  })

  it("credits nothing for jumping backwards", () => {
    const h = started(600_000)
    playForward(h.session, 5)
    h.session.sample(1000, 1000)
    expect(h.session.watchedMs).toBe(5000)
  })

  it("reports the seek count on the next heartbeat", () => {
    const h = started(600_000)
    h.session.sample(1000, 1000)
    h.session.sample(400_000, 1000) // seek
    playForward(h.session, 5, 400_000)
    const beat = h.events.find((e) => e.kind === "heartbeat")
    expect(beat && beat.kind === "heartbeat" && beat.seekCountIncrement).toBe(1)
  })
})

describe("loops", () => {
  it("treats an end-to-start wrap as watching, not seeking", () => {
    const h = started(10_000)
    // Watched normally to 9.5s...
    playForward(h.session, 9)
    h.session.sample(9_500, 1000)
    // ...then 9500 -> 200 is a wrap: the tail (500ms) plus the new head
    // (200ms). Both are frames that were genuinely shown.
    h.session.sample(200, 1000)
    expect(h.session.watchedMs).toBe(9_500 + 500 + 200)
  })

  it("counts the loop", () => {
    const h = started(10_000)
    playForward(h.session, 9)
    h.session.sample(9_500, 1000)
    h.session.sample(200, 1000)
    h.session.end("ended")
    const end = h.events.find((e) => e.kind === "play_end")
    expect(end && end.kind === "play_end" && end.loopCount).toBe(1)
  })

  it("does not mistake an ordinary rewind for a loop", () => {
    const h = started(60_000)
    playForward(h.session, 30)
    h.session.sample(500, 1000) // from the middle, not the end
    h.session.end("ended")
    const end = h.events.find((e) => e.kind === "play_end")
    expect(end && end.kind === "play_end" && end.loopCount).toBe(0)
  })
})

describe("heartbeats", () => {
  it("reports every five seconds, not every sample", () => {
    const h = started(60_000)
    playForward(h.session, 12)
    expect(h.events.filter((e) => e.kind === "heartbeat")).toHaveLength(2)
  })

  it("never claims an increment larger than the running total", () => {
    // The server rejects the entire batch for this, so it must be impossible
    // rather than unlikely.
    const h = started(60_000)
    playForward(h.session, 20)
    for (const e of h.events) {
      if (e.kind === "heartbeat") {
        expect(e.watchedMsIncrement).toBeLessThanOrEqual(e.watchedMsTotal)
      }
    }
  })

  it("carries increments that sum to the total", () => {
    const h = started(60_000)
    playForward(h.session, 20)
    const beats = h.events.filter((e) => e.kind === "heartbeat")
    const summed = beats.reduce((n, e) => n + (e.kind === "heartbeat" ? e.watchedMsIncrement : 0), 0)
    const last = beats[beats.length - 1]
    expect(last.kind === "heartbeat" && last.watchedMsTotal).toBe(summed)
  })
})

describe("milestones", () => {
  it("uses the short-form ladder at or below ninety seconds", () => {
    const h = started(60_000)
    playForward(h.session, 12)
    const names = h.events.filter((e) => e.kind === "milestone").map((e) => (e as { milestone: string }).milestone)
    expect(names).toContain("VIEW_1S")
    expect(names).toContain("VIEW_3S")
    expect(names).toContain("VIEW_10S")
    expect(names).not.toContain("VIEW_30S")
  })

  it("uses the long ladder above ninety seconds", () => {
    const h = started(300_000)
    playForward(h.session, 35)
    const names = h.events.filter((e) => e.kind === "milestone").map((e) => (e as { milestone: string }).milestone)
    expect(names).toContain("VIEW_10S")
    expect(names).toContain("VIEW_30S")
    expect(names).not.toContain("VIEW_1S")
  })

  it("fires each threshold exactly once, even across a loop", () => {
    const h = started(10_000)
    playForward(h.session, 9)
    h.session.sample(9_800, 1000)
    h.session.sample(200, 1000)
    playForward(h.session, 9, 200)
    const names = h.events.filter((e) => e.kind === "milestone").map((e) => (e as { milestone: string }).milestone)
    expect(new Set(names).size).toBe(names.length)
  })

  it("fires the percent ladder, and there is no PCT_100", () => {
    const h = started(10_000)
    playForward(h.session, 10)
    const names = h.events.filter((e) => e.kind === "milestone").map((e) => (e as { milestone: string }).milestone)
    expect(names).toEqual(expect.arrayContaining(["PCT_25", "PCT_50", "PCT_75", "PCT_95"]))
    expect(names).not.toContain("PCT_100")
  })
})

describe("end", () => {
  it("is idempotent — a second play_end would be swallowed by the server anyway", () => {
    const h = started(60_000)
    playForward(h.session, 10)
    h.session.end("ended")
    h.session.end("backgrounded")
    expect(h.events.filter((e) => e.kind === "play_end")).toHaveLength(1)
  })

  it("emits nothing when the view never started", () => {
    const h = harness(60_000)
    h.session.end("swipe_next")
    expect(h.events).toHaveLength(0)
  })

  it("never reports a continuous run longer than the total watched", () => {
    const h = started(600_000)
    playForward(h.session, 10)
    h.session.sample(1000, 1000) // seek back, breaking the run
    playForward(h.session, 5, 1000)
    h.session.end("ended")
    const end = h.events.find((e) => e.kind === "play_end")
    expect(end && end.kind === "play_end" && end.maxContinuousWatchMs).toBeLessThanOrEqual(
      end && end.kind === "play_end" ? end.watchedMsTotal : 0
    )
  })

  it("stops sampling after the end", () => {
    const h = started(60_000)
    playForward(h.session, 5)
    h.session.end("ended")
    const before = h.session.watchedMs
    playForward(h.session, 5, 5000)
    expect(h.session.watchedMs).toBe(before)
  })
})
