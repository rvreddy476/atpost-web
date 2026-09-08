import { describe, expect, it, vi } from "vitest"
import { AnalyticsQueue } from "./queue"
import type { AnalyticsEvent, SendOutcome } from "./contract"

const CONTENT = "22222222-2222-4222-8222-222222222222"
const SESSION = "11111111-1111-4111-8111-111111111111"

/**
 * A distinct, VALID uuid per index.
 *
 * Spelled out rather than interpolated into a template, because the queue
 * silently refuses a malformed content_id — which is the behaviour under test
 * elsewhere in this file, and which would otherwise make a test that wanted 50
 * queued rows quietly queue 36 of them and assert nothing useful.
 */
const uuid = (n: number) => {
  const hex = n.toString(16).padStart(12, "0")
  return `00000000-0000-4000-8000-${hex}`
}

function makeQueue(outcomes: SendOutcome[] | ((events: AnalyticsEvent[]) => SendOutcome)) {
  const batches: AnalyticsEvent[][] = []
  let n = 0
  const transport = vi.fn(async (events: AnalyticsEvent[]) => {
    batches.push(events)
    if (typeof outcomes === "function") return outcomes(events)
    return outcomes[Math.min(n++, outcomes.length - 1)]
  })
  const dropped: { type: string; reason: string }[] = []
  const queue = new AnalyticsQueue({
    transport,
    onDrop: (e, reason) => dropped.push({ type: e.type, reason }),
  })
  return { queue, transport, batches, dropped }
}

const ok: SendOutcome = { kind: "ok", result: { accepted: 1, duplicate: 0 } }

const engagement = (contentId = CONTENT) => ({
  type: "like" as const,
  payload: { content_id: contentId, session_id: SESSION, surface: "feed" as const },
})

describe("enqueue", () => {
  it("takes a valid event", () => {
    const { queue } = makeQueue([ok])
    expect(queue.enqueue(engagement())).toBe(true)
    expect(queue.size).toBe(1)
  })

  it("refuses an event the server would reject, rather than queueing a batch-killer", () => {
    // One invalid event rejects the whole batch of 200 server-side, and the
    // rows stay queued — so it does it again forever. Catching it here is the
    // difference between losing one event and losing all telemetry.
    const { queue, dropped } = makeQueue([ok])
    expect(queue.enqueue({ type: "like", payload: { content_id: "not-a-uuid", surface: "feed" } })).toBe(false)
    expect(queue.size).toBe(0)
    expect(dropped[0].reason).toMatch(/uuid/)
  })

  it("refuses a playback event with no session", () => {
    const { queue } = makeQueue([ok])
    expect(
      queue.enqueue({
        type: "play_start",
        payload: {
          content_id: CONTENT,
          surface: "feed",
          content_duration_ms: 1000,
          content_type: "flick",
          start_method: "autoplay",
          is_muted: true,
          is_autoplay: true,
          time_to_first_frame_ms: 0,
          initial_buffer_ms: 0,
        },
      })
    ).toBe(false)
  })

  it("collapses a repeat of a once-per-session type", () => {
    const { queue } = makeQueue([ok])
    queue.enqueue(engagement())
    queue.enqueue(engagement())
    expect(queue.size).toBe(1)
  })

  it("does NOT collapse comment_create — the server counts every one", () => {
    const { queue } = makeQueue([ok])
    const comment = {
      type: "comment_create" as const,
      dedupeKey: "",
      payload: { content_id: CONTENT, session_id: SESSION, surface: "feed" as const },
    }
    queue.enqueue(comment)
    queue.enqueue(comment)
    expect(queue.size).toBe(2)
  })

  it("collapses play_end, which the server dedupes on session alone", () => {
    const { queue } = makeQueue([ok])
    const end = {
      type: "play_end" as const,
      dedupeKey: "end",
      payload: {
        content_id: CONTENT,
        session_id: SESSION,
        surface: "feed" as const,
        watched_ms_total: 1000,
        max_continuous_watch_ms: 1000,
        content_duration_ms: 5000,
        content_type: "flick" as const,
        loop_count: 0,
        end_reason: "ended" as const,
      },
    }
    expect(queue.enqueue(end)).toBe(true)
    expect(queue.enqueue({ ...end, payload: { ...end.payload, end_reason: "backgrounded" } })).toBe(false)
  })

  it("keeps distinct content separate", () => {
    const { queue } = makeQueue([ok])
    queue.enqueue(engagement())
    queue.enqueue(engagement("33333333-3333-4333-8333-333333333333"))
    expect(queue.size).toBe(2)
  })
})

describe("flush", () => {
  it("sends and clears", async () => {
    const { queue, batches } = makeQueue([ok])
    queue.enqueue(engagement())
    await queue.flush()
    expect(batches).toHaveLength(1)
    expect(queue.size).toBe(0)
  })

  it("strips local bookkeeping from the wire", async () => {
    const { queue, batches } = makeQueue([ok])
    queue.enqueue(engagement())
    await queue.flush()
    expect(Object.keys(batches[0][0]).sort()).toEqual(["event_id", "payload", "timestamp", "type"])
  })

  it("keeps rows on a transient failure so watch time is not lost", async () => {
    const { queue } = makeQueue([{ kind: "transient" }])
    queue.enqueue(engagement())
    await queue.flush()
    expect(queue.size).toBe(1)
  })

  it("stops and keeps rows on 401 — the session may come back", async () => {
    const { queue, transport } = makeQueue([{ kind: "unauthenticated" }])
    queue.enqueue(engagement())
    await queue.flush()
    expect(queue.size).toBe(1)
    await queue.flush()
    expect(transport).toHaveBeenCalledTimes(1)
  })

  it("replays the same event_id on a retry, so the server can dedupe it", async () => {
    // The id is the ONLY thing that lets the server tell a retry from a second
    // view. Minting a fresh one per attempt would double-count watch time
    // every time a request timed out and succeeded on the way back.
    let now = Date.parse("2026-09-08T12:00:00Z")
    const batches: AnalyticsEvent[][] = []
    let first = true
    const queue = new AnalyticsQueue({
      transport: async (events) => {
        batches.push(events)
        if (first) {
          first = false
          return { kind: "transient" }
        }
        return ok
      },
      now: () => now,
    })
    queue.enqueue(engagement())
    await queue.flush()
    now += 60_000 // clear the backoff
    await queue.flush()
    expect(batches).toHaveLength(2)
    expect(batches[0][0].event_id).toBe(batches[1][0].event_id)
  })

  it("backs off after a transient failure instead of retrying on every enqueue", async () => {
    // Once the queue holds more than the flush threshold, `shouldFlush` stays
    // true, so without a backoff every subsequent enqueue fires another request
    // at a server that has just refused one. On this stack that is live:
    // /v1/analytics/events answers 422 CONTENT_NOT_READY until the ownership
    // projection catches up.
    let now = Date.parse("2026-09-08T12:00:00Z")
    const sent: number[] = []
    const queue = new AnalyticsQueue({
      transport: async () => {
        sent.push(now)
        return { kind: "transient" }
      },
      now: () => now,
    })
    queue.enqueue(engagement())

    await queue.flush()
    expect(sent).toHaveLength(1)

    // Immediately after, and a few seconds later, nothing goes out.
    await queue.flush()
    now += 10_000
    await queue.flush()
    expect(sent).toHaveLength(1)

    // Past the 30s base backoff, it tries again.
    now += 25_000
    await queue.flush()
    expect(sent).toHaveLength(2)
  })

  it("drops a row after the attempt limit rather than retrying forever", async () => {
    let now = Date.parse("2026-09-08T12:00:00Z")
    const dropped: string[] = []
    const queue = new AnalyticsQueue({
      transport: async () => ({ kind: "transient" }),
      now: () => now,
      onDrop: (_e, reason) => dropped.push(reason),
    })
    queue.enqueue(engagement())
    // Each attempt has to clear the growing backoff, so the clock moves with
    // it — otherwise this would assert that a backed-off queue never retries.
    for (let i = 0; i < 6; i++) {
      await queue.flush()
      now += 10 * 60_000
    }
    expect(queue.size).toBe(0)
    expect(dropped).toContain("attempts exhausted")
  })
})

describe("bisection", () => {
  it("finds and drops the single offender, keeping everything else", async () => {
    // The scenario the whole mechanism exists for: one event the server hates,
    // in a batch of otherwise good ones. Without bisection the batch fails
    // forever and every event in it is lost.
    const poison = "44444444-4444-4444-8444-444444444444"
    const { queue, dropped } = makeQueue((events) =>
      events.some((e) => (e.payload as { content_id: string }).content_id === poison)
        ? { kind: "permanent" }
        : ok
    )

    for (let i = 0; i < 7; i++) {
      queue.enqueue(engagement(uuid(i)))
    }
    queue.enqueue(engagement(poison))

    await queue.flush()

    expect(queue.size).toBe(0)
    expect(dropped).toHaveLength(1)
    expect(dropped[0].reason).toBe("rejected by server")
  })

  it("costs at most log2(n) extra requests", async () => {
    const poison = "44444444-4444-4444-8444-444444444444"
    const { queue, transport } = makeQueue((events) =>
      events.some((e) => (e.payload as { content_id: string }).content_id === poison)
        ? { kind: "permanent" }
        : ok
    )
    for (let i = 0; i < 15; i++) {
      queue.enqueue(engagement(uuid(i)))
    }
    queue.enqueue(engagement(poison))
    await queue.flush()
    // 16 events: 1 failed whole batch, then ~4 levels of halving.
    expect(transport.mock.calls.length).toBeLessThanOrEqual(12)
  })
})

describe("staleness", () => {
  it("drops rows the server would refuse on age before they can fail a batch", async () => {
    let now = Date.parse("2026-09-08T12:00:00Z")
    const batches: AnalyticsEvent[][] = []
    const queue = new AnalyticsQueue({
      transport: async (events) => {
        batches.push(events)
        return ok
      },
      now: () => now,
    })
    queue.enqueue(engagement())
    // Twenty-five hours later: past the server's 24h acceptance window.
    now += 25 * 60 * 60 * 1000
    await queue.flush()
    expect(batches).toHaveLength(0)
    expect(queue.size).toBe(0)
  })
})

describe("shouldFlush", () => {
  it("turns true at the threshold, well under a full batch", () => {
    const { queue } = makeQueue([ok])
    for (let i = 0; i < 49; i++) {
      queue.enqueue(engagement(uuid(i)))
    }
    expect(queue.shouldFlush).toBe(false)
    queue.enqueue(engagement(uuid(999)))
    expect(queue.shouldFlush).toBe(true)
  })
})
