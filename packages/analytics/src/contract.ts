/* ═══════════════════════════════════════════════════════════════════════════
   The wire contract for POST /v1/analytics/events.

   Transcribed from the two sides that already agree — the Android client
   (mobile/android/core/analytics/) and analytics-service's decoder
   (internal/service/ingest.go) — rather than invented here. Where the two
   disagree the SERVER wins, because it is the thing that rejects batches.

   ── Why this is not in @atpost/types ──────────────────────────────────────
   Because the numbers below are not decoration. `ingest.go` validates every
   bound in this file and returns on the FIRST failure, so one bad event
   rejects the whole batch of 200 and, since the rows stay queued, does it
   again forever. The bounds and the code that enforces them therefore have to
   live together or they drift apart, which is exactly the failure this
   package exists to prevent.

   There IS an existing packages/types/src/analytics.ts. It does not describe
   this endpoint: it mirrors `model/video_events.go`'s VideoEventCommon, with
   `event_name` and `timestamp_ms`, and that struct is documentation on the
   server too — the ingest path never decodes it. Sending its shape produces a
   400. It is left alone here because the dashboard types below it are real
   and in use; this file is the one to read for ingestion.

   ── The two things a creator is PAID on ───────────────────────────────────
   `is_display_view` and `percent_viewed` do NOT appear in any payload type
   below, and their absence is the point. The client cannot send them: the
   server computes both in ingest.go from `watched_ms_total`,
   `content_duration_ms` and `loop_count`, against ITS OWN label for the
   content, and drops any copy the client supplies. So the honesty of the
   payout numbers rests entirely on those three fields being measured rather
   than estimated — which is why the tracker in @momentum/player accumulates
   watch time from the PLAYHEAD DELTA and not from wall-clock time. A paused
   or buffering video must add nothing.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The six surfaces the server keeps as a dimension.
 *
 * `normalizeSurface` maps anything else to "other" and does NOT error, so a
 * typo here is not a failed request — it is a silently lost dimension, which
 * is worse (the server now counts each collapse on
 * `analytics_surface_rejected_total{raw}`, so it is at least visible). The
 * home feed is "feed"; short-form vertical video is "reels" (server-side
 * since plan 5D, 2026-09-11).
 */
export type AnalyticsSurface = "feed" | "reels" | "posttube" | "profile" | "search" | "channel"

/**
 * The 12 types a web client sends. `type` on the envelope, not `event_name`.
 *
 * `like` is deliberately absent. A like is state, not an event — only
 * post-service knows whether it stuck — and the server learns of it from
 * post-service's PostReacted on Kafka. Sending it from here as well counted
 * every web like twice (audit M-05). The server still accepts `like` from
 * old clients and collapses it onto the Kafka copy.
 */
export type AnalyticsEventType =
  | "impression"
  | "play_start"
  | "watch_heartbeat"
  | "milestone"
  | "play_end"
  | "comment_create"
  | "share"
  | "save"
  | "follow_from_content"
  | "not_interested"
  | "report"
  | "block_creator"

/** Same silent-fallback trap as `surface`: anything else becomes "other". */
export type StartMethod = "autoplay" | "tap" | "resume"
export type EndReason = "ended" | "swipe_next" | "paused" | "backgrounded" | "error"

/** Anything else, empty included, is stored as "unspecified". */
export type NegativeReason =
  | "spam"
  | "nudity"
  | "violence"
  | "hate"
  | "misinformation"
  | "repetitive"
  | "irrelevant"
  | "dislike_creator"

/**
 * Time milestones. Which ladder applies is decided by DURATION, not by the
 * post's declared content_type — 90s is the split, matching
 * `AnalyticsContentType.classify` and `model/video_events.go`.
 */
export const SHORT_FORM_LADDER = [
  { name: "VIEW_1S", thresholdMs: 1_000 },
  { name: "VIEW_3S", thresholdMs: 3_000 },
  { name: "VIEW_10S", thresholdMs: 10_000 },
] as const

export const LONG_VIDEO_LADDER = [
  { name: "VIEW_10S", thresholdMs: 10_000 },
  { name: "VIEW_30S", thresholdMs: 30_000 },
  { name: "VIEW_60S", thresholdMs: 60_000 },
  { name: "VIEW_120S", thresholdMs: 120_000 },
] as const

/** PCT_95, not PCT_100. There is no hundred-percent milestone. */
export const PERCENT_LADDER = [
  { name: "PCT_25", percent: 25 },
  { name: "PCT_50", percent: 50 },
  { name: "PCT_75", percent: 75 },
  { name: "PCT_95", percent: 95 },
] as const

/** The duration at or below which a video uses the short-form time ladder. */
export const SHORT_FORM_MAX_DURATION_MS = 90_000

export function timeLadderFor(durationMs: number) {
  return durationMs <= SHORT_FORM_MAX_DURATION_MS ? SHORT_FORM_LADDER : LONG_VIDEO_LADDER
}

/**
 * Every bound ingest.go checks. Exported so the validator and its tests read
 * from one place, and so a future server change has one file to update.
 */
export const LIMITS = {
  /** Hard server cap. Android self-caps at 100; so do we. */
  MAX_BATCH: 200,
  PREFERRED_BATCH: 100,
  /** Flush as soon as the queue reaches this, well under a batch. */
  FLUSH_THRESHOLD: 50,
  /** Rows older than this are dropped locally before they can fail a batch. */
  MAX_EVENT_AGE_MS: 24 * 60 * 60 * 1000,
  /** The server rejects anything dated further ahead than this. */
  MAX_CLOCK_SKEW_MS: 5 * 60 * 1000,
  MIN_EVENT_ID_LEN: 16,
  MAX_EVENT_ID_LEN: 128,
  MAX_VISIBLE_MS: 600_000,
  MAX_DURATION_MS: 43_200_000,
  MAX_INCREMENT_MS: 600_000,
  MAX_SEEK_INCREMENT: 1_000,
  MIN_PLAYBACK_SPEED: 0.25,
  MAX_PLAYBACK_SPEED: 4,
  MAX_LOOP_COUNT: 20,
  MAX_POSITION: 10_000,
  /** Below this an impression is not worth reporting. */
  MIN_REPORTABLE_DWELL_MS: 1_000,
  /** Local queue cap. Oldest are trimmed first. */
  QUEUE_CAP: 5_000,
  MAX_ATTEMPTS: 5,
  /** Foreground cadence. Not the heartbeat cadence — that is the player's. */
  FLUSH_INTERVAL_MS: 5 * 60 * 1000,
} as const

/**
 * Fields present in every payload.
 *
 * `session_id` is deliberately optional and MUST BE OMITTED, not sent empty,
 * when there is no playback session: a present-but-non-UUID value fails the
 * whole batch. `creator_id` is sent for parity and is dropped by the server,
 * which rebuilds attribution from its own ownership projection — so it is not
 * a thing a client can lie about, and not a thing worth working to populate.
 */
export interface CommonPayload {
  content_id: string
  session_id?: string
  surface: AnalyticsSurface
  creator_id?: string
  /** 1-based rank in the feed. Omit when unknown; 0 is not a valid position. */
  position?: number
}

export interface ImpressionPayload extends CommonPayload {
  visible_ms: number
  is_autoplay: boolean
}

export interface PlayStartPayload extends CommonPayload {
  content_duration_ms: number
  content_type: "flick" | "long_video"
  start_method: StartMethod
  is_muted: boolean
  is_autoplay: boolean
  time_to_first_frame_ms: number
  initial_buffer_ms: number
}

export interface WatchHeartbeatPayload extends CommonPayload {
  watched_ms_increment: number
  watched_ms_total: number
  playhead_position_ms: number
  buffering_ms_increment: number
  seek_count_increment: number
  playback_speed: number
}

export interface MilestonePayload extends CommonPayload {
  milestone_type: string
  watched_ms: number
}

export interface PlayEndPayload extends CommonPayload {
  watched_ms_total: number
  max_continuous_watch_ms: number
  content_duration_ms: number
  content_type: "flick" | "long_video"
  loop_count: number
  end_reason: EndReason
}

/** comment_create / share / save / follow_from_content carry no extras. */
export type EngagementPayload = CommonPayload

export interface NegativeSignalPayload extends CommonPayload {
  reason: NegativeReason | string
}

export type AnalyticsPayload =
  | ImpressionPayload
  | PlayStartPayload
  | WatchHeartbeatPayload
  | MilestonePayload
  | PlayEndPayload
  | EngagementPayload
  | NegativeSignalPayload

/** One event as it goes on the wire. `timestamp` is RFC3339 UTC, not millis. */
export interface AnalyticsEvent {
  event_id: string
  type: AnalyticsEventType
  timestamp: string
  payload: AnalyticsPayload
}

/**
 * A queued event carries two extra things the wire does not.
 *
 * `dedupeKey` mirrors the server's UNIQUE (actor, session, content, type, key)
 * so a duplicate never leaves this browser. It is "" — never undefined — for
 * the types the server does not collapse, because an absent key would make
 * every row distinct and defeat the index.
 */
export interface QueuedEvent extends AnalyticsEvent {
  dedupeKey: string
  createdAtMs: number
  attempts: number
}

/** What the 202 carries, unwrapped from the `data` envelope. */
export interface IngestResult {
  accepted: number
  duplicate: number
}

/**
 * How a failed send should be treated.
 *
 * The distinction matters more than it looks: a "permanent" batch will fail
 * identically forever, so the queue bisects to find the one bad event and
 * drops only that. Classifying a 5xx as permanent throws away real watch time;
 * classifying a 400 as transient wedges the queue.
 */
export type SendOutcome =
  | { kind: "ok"; result: IngestResult }
  | { kind: "transient" }
  | { kind: "permanent" }
  | { kind: "unauthenticated" }

/**
 * The seam that keeps this package free of a network.
 *
 * A transport takes events and reports what happened. apps/social supplies one
 * built on the zone's own proxy; a test supplies one that records calls.
 */
export type AnalyticsTransport = (events: AnalyticsEvent[]) => Promise<SendOutcome>
