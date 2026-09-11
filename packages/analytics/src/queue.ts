/**
 * The outbox: batching, dedupe, retry and bisection.
 *
 * A port of `AnalyticsStore` / `AnalyticsClient` from the Android client, with
 * the two mechanisms that actually matter kept intact:
 *
 *   1. TWO DEDUPE LAYERS, matching the server's. `event_id` is the primary
 *      key — a retry replays the SAME id, so the server can recognise a
 *      duplicate and answer 202 rather than double-counting a view. The second
 *      layer is the tuple (session, content, type, dedupeKey), mirroring the
 *      server's partial unique index, so a repeat never leaves this browser.
 *
 *      The server has THREE rules, not one (migration 006 dropped the blanket
 *      constraint precisely because it collapsed every heartbeat after the
 *      first), and one of them is not something `event_id` can get you out of:
 *
 *        · everything     — unique on `event_id`
 *        · milestone and the seven collapsed engagement types — unique on
 *          (actor, session, content, type, dedupe_key)
 *        · play_end       — unique on (actor, session, content) ALONE
 *
 *      That last one is the trap. A second `play_end` for the same view is
 *      swallowed whatever id it carries, so a player that fires one on both
 *      `pagehide` and teardown loses the second silently and never learns it.
 *      The fix is upstream of this file: end-of-view is idempotent per content
 *      id in @momentum/player, and a genuine re-watch mints a NEW session_id.
 *      Passing `dedupeKey: "end"` here makes the local index agree, so the
 *      duplicate never becomes a request in the first place.
 *
 *   2. BISECTION. One invalid event rejects the whole batch of 200, and the
 *      rows stay queued, so it rejects the next batch too — forever. On a
 *      permanent failure the queue halves the batch and recurses until the
 *      offender is alone, then drops just that one. Costs at most log2(n)
 *      extra requests and cannot lose the other 199.
 *
 * ── What this file will not do ────────────────────────────────────────────
 * It does not import a network client, and there is no URL in it. The caller
 * passes a transport. That is what lets reels and tube reuse the same queue
 * against a different proxy, and what lets the tests below run without one.
 *
 * ── Duplicates are a success ──────────────────────────────────────────────
 * `{accepted, duplicate}` — a duplicate means an earlier attempt landed and we
 * correctly replayed the id. The row is deleted either way. Treating it as a
 * failure would retry forever against a server that is already satisfied.
 */

import {
  LIMITS,
  type AnalyticsEvent,
  type AnalyticsEventType,
  type AnalyticsTransport,
  type QueuedEvent,
} from "./contract"
import { isFreshTimestamp, validateEvent } from "./validate"

/**
 * The six types the server collapses to one row per session.
 *
 * `like` is not sent at all any more (see AnalyticsEventType in ./contract).
 *
 * `comment_create` is deliberately NOT here. Android collapses it locally, but
 * the server's `oncePerSession` set does not include it, so collapsing would
 * throw away real second and third comments that the server would have
 * counted. Android never emits it at all — a web client is the first producer.
 */
const ONCE_PER_SESSION: ReadonlySet<AnalyticsEventType> = new Set([
  "share",
  "save",
  "follow_from_content",
  "not_interested",
  "report",
  "block_creator",
])

export interface QueueOptions {
  transport: AnalyticsTransport
  /** Injected for tests. Defaults to Date.now. */
  now?: () => number
  /** Injected for tests. Defaults to crypto.randomUUID. */
  newId?: () => string
  /** Called when an event is dropped, for a dev console. Never user-facing. */
  onDrop?: (event: QueuedEvent, reason: string) => void
}

/** What `enqueue` takes: the wire event minus the bookkeeping. */
export interface EnqueueInput {
  type: AnalyticsEventType
  payload: AnalyticsEvent["payload"]
  /**
   * Mirrors the server's collapse key. Omit and one is derived: "session" for
   * the collapsed engagement types, "" for everything else. Pass an explicit
   * one for the playback types, which have their own ("start", "hb-3",
   * "PCT_50", "end") — those come from the tracker in @momentum/player.
   */
  dedupeKey?: string
  /** Defaults to now. Present so a tracker can date an event when it happened. */
  timestampMs?: number
}

export function randomEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  // A fallback that still clears the server's 16..128 length check. Only
  // reached in a context without WebCrypto, which in practice is a test.
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`
}

export class AnalyticsQueue {
  private rows: QueuedEvent[] = []
  /** The tuple index. Mirrors the server's UNIQUE constraint. */
  private seen = new Set<string>()
  private draining = false
  private stopped = false
  /**
   * Earliest time a retry may be attempted, after a transient failure.
   *
   * Without this the queue is chatty in exactly the situation where the server
   * is least able to cope: once it holds more than FLUSH_THRESHOLD rows,
   * `shouldFlush` stays true, so every subsequent enqueue triggers another
   * request against a server that has just refused one. That is a request per
   * scroll event aimed at something already failing.
   *
   * It matters on this stack today: `/v1/analytics/events` answers 422
   * CONTENT_NOT_READY for every post whose ownership projection has not caught
   * up, which is a legitimately transient condition that can persist for
   * minutes. Backing off is what makes "retry" not mean "hammer".
   */
  private retryAfterMs = 0
  private backoffMs = 0

  private readonly transport: AnalyticsTransport
  private readonly now: () => number
  private readonly newId: () => string
  private readonly onDrop?: (event: QueuedEvent, reason: string) => void

  constructor(opts: QueueOptions) {
    this.transport = opts.transport
    this.now = opts.now ?? (() => Date.now())
    this.newId = opts.newId ?? randomEventId
    this.onDrop = opts.onDrop
  }

  /** Rows waiting to be sent. For tests and a dev panel. */
  get size(): number {
    return this.rows.length
  }

  /**
   * Add an event.
   *
   * Never throws and never returns a rejected promise: an enqueue is on the
   * hot path of a scroll and a render, and telemetry must not be able to break
   * either. Returns whether the row was actually added.
   */
  enqueue(input: EnqueueInput): boolean {
    try {
      const payload = input.payload as { session_id?: string; content_id?: string }
      const dedupeKey =
        input.dedupeKey ?? (ONCE_PER_SESSION.has(input.type) ? "session" : "")
      // "" for the session part, never undefined — an absent value would make
      // every row distinct and quietly disable the index.
      const tuple = `${payload.session_id ?? ""}|${payload.content_id ?? ""}|${input.type}|${dedupeKey}`
      if (dedupeKey !== "" && this.seen.has(tuple)) return false

      const at = input.timestampMs ?? this.now()
      const row: QueuedEvent = {
        event_id: this.newId(),
        type: input.type,
        timestamp: new Date(at).toISOString(),
        payload: input.payload,
        dedupeKey,
        createdAtMs: at,
        attempts: 0,
      }

      const reason = validateEvent(row, this.now())
      if (reason) {
        this.onDrop?.(row, reason)
        return false
      }

      if (dedupeKey !== "") this.seen.add(tuple)
      this.rows.push(row)

      // Trim oldest first. A queue that grows without bound on a long session
      // is a memory leak with a plausible excuse.
      if (this.rows.length > LIMITS.QUEUE_CAP) {
        this.rows.splice(0, this.rows.length - LIMITS.QUEUE_CAP)
      }
      return true
    } catch {
      return false
    }
  }

  /** True once the queue has enough to be worth a request. */
  get shouldFlush(): boolean {
    return this.rows.length >= LIMITS.FLUSH_THRESHOLD
  }

  /** Stop sending — used after a 401, so rows survive until re-auth. */
  stop(): void {
    this.stopped = true
  }

  resume(): void {
    this.stopped = false
  }

  /**
   * Send what is queued, oldest first, in batches.
   *
   * Serialised by `draining`: two concurrent flushes would send the same rows
   * twice, and while `event_id` makes that harmless on the server it is a
   * wasted request every time.
   */
  async flush(): Promise<void> {
    if (this.draining || this.stopped) return
    if (this.now() < this.retryAfterMs) return
    this.draining = true
    try {
      while (this.rows.length > 0 && !this.stopped) {
        // Drop anything the server would refuse on age BEFORE it can take a
        // live batch down with it.
        const now = this.now()
        this.rows = this.rows.filter((r) => {
          if (isFreshTimestamp(r.timestamp, now)) return true
          this.onDrop?.(r, "stale")
          return false
        })
        if (this.rows.length === 0) return

        const batch = this.rows.slice(0, LIMITS.PREFERRED_BATCH)
        const sent = await this.send(batch)
        if (!sent) return // transient or unauthenticated: leave the rows queued
      }
    } finally {
      this.draining = false
    }
  }

  /**
   * Send one batch, bisecting on a permanent failure.
   *
   * Returns true when the batch is resolved — accepted, duplicated, or
   * narrowed down and the offender dropped — and false when the caller should
   * stop and try again later.
   */
  private async send(batch: QueuedEvent[]): Promise<boolean> {
    if (batch.length === 0) return true

    for (const row of batch) row.attempts += 1

    const outcome = await this.transport(batch.map(toWire))

    switch (outcome.kind) {
      case "ok":
        this.remove(batch)
        this.backoffMs = 0
        this.retryAfterMs = 0
        return true

      case "unauthenticated":
        // Keep the rows. The session may come back; the watch time is real.
        this.stopped = true
        return false

      case "transient": {
        // Exponential, capped, and matching the Android client's 30s base.
        this.backoffMs = this.backoffMs === 0 ? 30_000 : Math.min(this.backoffMs * 2, 5 * 60_000)
        this.retryAfterMs = this.now() + this.backoffMs

        const exhausted = batch.filter((r) => r.attempts >= LIMITS.MAX_ATTEMPTS)
        if (exhausted.length > 0) {
          for (const r of exhausted) this.onDrop?.(r, "attempts exhausted")
          this.remove(exhausted)
        }
        return false
      }

      case "permanent": {
        if (batch.length === 1) {
          // Found it. Drop exactly one event, keep everything else.
          this.onDrop?.(batch[0], "rejected by server")
          this.remove(batch)
          return true
        }
        const mid = Math.floor(batch.length / 2)
        const firstHalf = await this.send(batch.slice(0, mid))
        if (!firstHalf) return false
        return this.send(batch.slice(mid))
      }
    }
  }

  private remove(rows: QueuedEvent[]): void {
    const ids = new Set(rows.map((r) => r.event_id))
    this.rows = this.rows.filter((r) => !ids.has(r.event_id))
  }
}

/** Strip the local bookkeeping. The server has never heard of `dedupeKey`. */
function toWire(row: QueuedEvent): AnalyticsEvent {
  return {
    event_id: row.event_id,
    type: row.type,
    timestamp: row.timestamp,
    payload: row.payload,
  }
}
