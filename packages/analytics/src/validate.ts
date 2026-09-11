/**
 * A local mirror of what ingest.go would reject.
 *
 * This exists because of one server behaviour: `IngestEvents` validates in a
 * loop and returns on the FIRST failure, so a single malformed event rejects
 * the whole batch — and the rows are still queued, so it rejects the next one
 * too, forever. Validating on the way IN means a bad event never gets the
 * chance; the bisection in ./queue is the second line of defence for the case
 * this file gets something wrong.
 *
 * It is deliberately conservative: it only rejects what the server rejects,
 * and it never throws. Telemetry that can break the page it measures is worse
 * than no telemetry.
 */

import {
  LIMITS,
  type AnalyticsEvent,
  type ImpressionPayload,
  type MilestonePayload,
  type PlayEndPayload,
  type PlayStartPayload,
  type WatchHeartbeatPayload,
} from "./contract"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL_UUID = "00000000-0000-0000-0000-000000000000"

const finiteInRange = (v: unknown, min: number, max: number): boolean =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max

/** `content_id` must parse as a UUID and must not be the nil UUID. */
export function isValidContentId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id) && id !== NIL_UUID
}

/**
 * An absent session is fine. A present one must be a real UUID.
 *
 * The empty string is the trap: Go's `TrimSpace` turns it into the nil UUID
 * without complaint on some paths, but the safe contract — and what Android
 * does — is to omit the key entirely rather than send "".
 */
export function isValidSessionId(id: unknown): boolean {
  if (id === undefined) return true
  return typeof id === "string" && UUID_RE.test(id) && id !== NIL_UUID
}

/** The server's acceptance window: not older than 24h, not more than 5m ahead. */
export function isFreshTimestamp(iso: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return false
  return t > nowMs - LIMITS.MAX_EVENT_AGE_MS && t < nowMs + LIMITS.MAX_CLOCK_SKEW_MS
}

/**
 * Would the server accept this event?
 *
 * Returns a reason rather than a bare boolean so a dropped event can say why
 * in a dev console. Nothing user-facing ever reads it.
 */
export function validateEvent(ev: AnalyticsEvent, nowMs: number = Date.now()): string | null {
  if (typeof ev.event_id !== "string") return "event_id missing"
  if (
    ev.event_id.length < LIMITS.MIN_EVENT_ID_LEN ||
    ev.event_id.length > LIMITS.MAX_EVENT_ID_LEN
  ) {
    return "event_id length out of range"
  }
  if (!isFreshTimestamp(ev.timestamp, nowMs)) return "timestamp outside acceptance window"

  // Through `unknown`: the payload union has no index signature, and the
  // checks below are deliberately structural — they run over whatever actually
  // arrived, including a shape TypeScript was told about but the caller got
  // wrong.
  const p = ev.payload as unknown as Record<string, unknown>
  if (!isValidContentId(p.content_id)) return "content_id is not a non-nil uuid"
  if (!isValidSessionId(p.session_id as string | undefined)) return "session_id is not a uuid"
  if (p.position !== undefined && !finiteInRange(p.position, 1, LIMITS.MAX_POSITION)) {
    return "position out of range"
  }

  // The four playback types are the ones the server refuses without a session.
  const needsSession =
    ev.type === "play_start" ||
    ev.type === "watch_heartbeat" ||
    ev.type === "milestone" ||
    ev.type === "play_end"
  if (needsSession && p.session_id === undefined) return `${ev.type} requires a session_id`

  switch (ev.type) {
    case "impression": {
      const q = ev.payload as ImpressionPayload
      if (!finiteInRange(q.visible_ms, 0, LIMITS.MAX_VISIBLE_MS)) return "visible_ms out of range"
      if (typeof q.is_autoplay !== "boolean") return "is_autoplay must be a boolean"
      return null
    }
    case "play_start": {
      const q = ev.payload as PlayStartPayload
      if (!finiteInRange(q.content_duration_ms, 1, LIMITS.MAX_DURATION_MS)) {
        return "content_duration_ms must be > 0"
      }
      if (!finiteInRange(q.time_to_first_frame_ms, 0, LIMITS.MAX_INCREMENT_MS)) {
        return "time_to_first_frame_ms out of range"
      }
      if (!finiteInRange(q.initial_buffer_ms, 0, LIMITS.MAX_INCREMENT_MS)) {
        return "initial_buffer_ms out of range"
      }
      return null
    }
    case "watch_heartbeat": {
      const q = ev.payload as WatchHeartbeatPayload
      if (!finiteInRange(q.watched_ms_increment, 0, LIMITS.MAX_INCREMENT_MS)) {
        return "watched_ms_increment out of range"
      }
      if (!finiteInRange(q.watched_ms_total, 0, LIMITS.MAX_DURATION_MS)) {
        return "watched_ms_total out of range"
      }
      // The server checks this explicitly and rejects the batch for it.
      if (q.watched_ms_increment > q.watched_ms_total) {
        return "heartbeat increment exceeds running total"
      }
      if (!finiteInRange(q.playhead_position_ms, 0, LIMITS.MAX_DURATION_MS)) {
        return "playhead_position_ms out of range"
      }
      if (!finiteInRange(q.buffering_ms_increment, 0, LIMITS.MAX_INCREMENT_MS)) {
        return "buffering_ms_increment out of range"
      }
      if (!finiteInRange(q.seek_count_increment, 0, LIMITS.MAX_SEEK_INCREMENT)) {
        return "seek_count_increment out of range"
      }
      if (!finiteInRange(q.content_duration_ms, 1, LIMITS.MAX_DURATION_MS)) {
        return "content_duration_ms must be > 0"
      }
      if (!finiteInRange(q.loop_count, 0, LIMITS.MAX_LOOP_COUNT)) return "loop_count out of range"
      if (!finiteInRange(q.playback_speed, LIMITS.MIN_PLAYBACK_SPEED, LIMITS.MAX_PLAYBACK_SPEED)) {
        return "playback_speed out of range"
      }
      return null
    }
    case "milestone": {
      const q = ev.payload as MilestonePayload
      if (typeof q.milestone_type !== "string" || q.milestone_type.length === 0) {
        return "milestone_type missing"
      }
      if (!finiteInRange(q.watched_ms, 0, LIMITS.MAX_DURATION_MS)) return "watched_ms out of range"
      return null
    }
    case "play_end": {
      const q = ev.payload as PlayEndPayload
      if (!finiteInRange(q.content_duration_ms, 1, LIMITS.MAX_DURATION_MS)) {
        return "content_duration_ms must be > 0"
      }
      // The only ceiling is the twelve-hour one. The server clamps a looped
      // total to duration x (loop_count + 1) and keeps the reported figure
      // for audit; it no longer rejects it, so neither do we. The old
      // "ten playthroughs" drop here threw away the most-watched reels'
      // most engaged sessions (audit M-09).
      if (!finiteInRange(q.watched_ms_total, 0, LIMITS.MAX_DURATION_MS)) {
        return "watched_ms_total out of range"
      }
      if (!finiteInRange(q.max_continuous_watch_ms, 0, q.watched_ms_total)) {
        return "max_continuous_watch_ms exceeds watched_ms_total"
      }
      if (!finiteInRange(q.loop_count, 0, LIMITS.MAX_LOOP_COUNT)) return "loop_count out of range"
      return null
    }
    default:
      return null
  }
}

export const isValidEvent = (ev: AnalyticsEvent, nowMs?: number): boolean =>
  validateEvent(ev, nowMs) === null
