/**
 * Watching a transcode: how often to ask, and what the answer means.
 *
 * Pure. No network, no timers — `pollDelayMs` returns a number and the hook
 * that owns the `setTimeout` is somewhere else, so both halves of "we poll
 * with a backoff" can be asserted without faking a clock.
 */

import type { MediaStatus } from "@/tube/uploadApi"

/* ── How often ────────────────────────────────────────────────────────────── */

/** The first few polls, before the backoff starts. */
export const POLL_FLOOR_MS = 1_000
/** Never slower than this, however long it has been going. */
export const POLL_CEILING_MS = 8_000
/** How many polls happen at the floor before the ramp begins. */
export const POLL_FAST_ATTEMPTS = 5
/** Each step multiplies the last by this. */
export const POLL_GROWTH = 1.6

/**
 * How long to wait before poll number `attempt` (0-based).
 *
 * ── Why it starts fast and stays fast for a while ─────────────────────────
 * Measured on this stack: a 5-second 640×360 clip is `ready`/`passed` about
 * eight seconds after `confirm`, and a 6 MB clip about the same. So the
 * common case — somebody testing, somebody uploading a short piece — is over
 * before any backoff would have had a chance to help. Five polls at one
 * second covers that entirely and the person sees "Ready to post" almost as
 * soon as it is true.
 *
 * ── Why it backs off at all ───────────────────────────────────────────────
 * A two-hour 4K upload transcodes into several renditions and takes minutes.
 * One request a second for ten minutes is six hundred requests to learn one
 * boolean, from every open studio tab at once. The ramp puts the tail at one
 * request every eight seconds, which costs the person at most eight seconds
 * of a wait that was already minutes long.
 *
 * The ceiling is deliberately not higher. This is the ONLY thing on screen
 * telling somebody their upload is alive, and a screen that has not changed
 * in half a minute reads as broken however carefully the copy is written.
 */
export function pollDelayMs(attempt: number): number {
  if (attempt < POLL_FAST_ATTEMPTS) return POLL_FLOOR_MS
  const grown = POLL_FLOOR_MS * Math.pow(POLL_GROWTH, attempt - POLL_FAST_ATTEMPTS + 1)
  return Math.min(POLL_CEILING_MS, Math.round(grown))
}

/**
 * When to stop waiting and say so.
 *
 * Fifteen minutes, and it is a real decision rather than a round number. The
 * simple upload path's signed URL lives fifteen minutes; a file big enough to
 * need longer than that to TRANSCODE went up the chunked path, and the
 * chunked session's own TTL is 24 hours. So this bound is about the person,
 * not the server: after a quarter of an hour of "Processing" with no change,
 * the honest thing is to say the studio has stopped watching and the video
 * will appear on the channel if it finishes. Sitting on a spinner for ever
 * teaches people that the spinner means nothing.
 *
 * Note what this does NOT do: it does not cancel anything. The transcode
 * carries on; only the watching stops.
 */
export const PROCESSING_DEADLINE_MS = 15 * 60 * 1000

/** Has the poll loop been going long enough to give up watching? */
export function processingTimedOut(elapsedMs: number): boolean {
  return elapsedMs >= PROCESSING_DEADLINE_MS
}

/**
 * The sentence for that timeout, in the phone's words.
 * (`ReelPublishPipeline.kt`: "Processing is taking too long. Try again in a
 * minute.") The web says a little more because the web has a channel page to
 * point at.
 */
export const PROCESSING_TIMEOUT_MESSAGE =
  "Processing is taking too long. The video is still being prepared — check your channel in a few minutes."

/* ── What the answer means ────────────────────────────────────────────────── */

export type StatusVerdict =
  /** Still moving. Keep polling. */
  | { kind: "waiting"; message: string }
  /** `ready` + `passed`. The ONLY state in which a media id may be attached. */
  | { kind: "ready" }
  /** Moderation said no. Not retryable with this file. */
  | { kind: "rejected"; message: string }
  /** The transcode broke. Not retryable with this file. */
  | { kind: "failed"; message: string }

/**
 * Read a `/v1/media/{id}/status` body.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * READY IS `ready` AND `passed`, BOTH, ALWAYS.
 *
 * The two columns move independently and either one can be the last to
 * arrive. `processing_status: "ready"` with `moderation_status: "pending"` is
 * a normal intermediate state and it is NOT attachable — attaching there is
 * how a video gets published seconds before a moderator rejects it, which
 * leaves a post on a channel pointing at an asset that will not serve.
 *
 * Written as one condition with both halves in it, rather than as an early
 * return on `processing_status`, so that the ready check cannot be softened
 * by accident later.
 *
 * ── The order of the checks matters ───────────────────────────────────────
 * Rejection is read BEFORE readiness. A row can carry `processing_status:
 * "ready"` and `moderation_status: "rejected"` at once — the encode
 * succeeded, the content did not pass — and reading readiness first would
 * call that attachable.
 */
export function classifyMediaStatus(status: MediaStatus): StatusVerdict {
  const processing = status.processing_status ?? ""
  const moderation = status.moderation_status ?? ""

  if (moderation === "rejected") {
    return {
      kind: "rejected",
      message:
        "This video was rejected by moderation and cannot be published. Nothing about the details on this page will change that.",
    }
  }

  if (processing === "rejected") {
    return {
      kind: "rejected",
      message: "This video was rejected and cannot be published.",
    }
  }

  if (processing === "failed") {
    return {
      kind: "failed",
      message:
        "The server could not process this file. Try exporting it again as an MP4 (H.264) and re-uploading.",
    }
  }

  if (processing === "ready" && moderation === "passed") {
    return { kind: "ready" }
  }

  // Everything else is still in flight, and the sentence names the column
  // that has not finished. "Processing" for four minutes with no detail is
  // indistinguishable from a hang; "Checking this video before it goes live"
  // at least says what is being waited on.
  if (moderation === "manual_review") {
    return {
      kind: "waiting",
      message: "A reviewer is checking this video. You can leave this page — it keeps going.",
    }
  }
  if (processing === "ready") {
    return { kind: "waiting", message: "Checking this video before it goes live." }
  }
  if (processing === "pending_upload") {
    return { kind: "waiting", message: "Waiting for the server to see the file." }
  }
  return { kind: "waiting", message: "Preparing the video for playback." }
}

/**
 * The resolution and duration, once the transcode knows them.
 *
 * Both are absent on every poll until the encoder has actually opened the
 * file — observed as `undefined` for the first four polls and then present.
 * So this returns null rather than zeros, and the studio shows nothing rather
 * than "0×0, 0s", which reads as a broken file.
 */
export interface MediaFacts {
  width: number
  height: number
  durationMs: number
}

export function mediaFacts(status: MediaStatus): MediaFacts | null {
  const width = status.width
  const height = status.height
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return null
  }
  const durationMs =
    typeof status.duration_ms === "number"
      ? status.duration_ms
      : typeof status.duration_seconds === "number"
        ? status.duration_seconds * 1000
        : 0
  return { width, height, durationMs }
}
