/**
 * The upload, as a state machine. No network, no React, no DOM.
 *
 * ── Why this is a reducer and not a pile of useState ──────────────────────
 * The studio has six things happening at once: bytes moving, a transcode
 * running, a filmstrip being extracted, a form being filled in, a cover being
 * uploaded, and a person who may hit Cancel at any point. Every one of them
 * can fail on its own. Held as loose booleans that is a screen where
 * `uploading` and `failed` are both true, or where Publish is enabled because
 * `ready` was set before `rejected` arrived — and those bugs surface as a
 * creator publishing a video that is not there.
 *
 * So the transitions are a table, and the table is asserted in ./machine.test.ts
 * without a browser or a server.
 *
 * ── The phases are the PHONE's phases ─────────────────────────────────────
 * `Preparing / Uploading / Processing / Posting / Published / Failed` are
 * `ReelPublishState` in the Android client (core/media/publish/
 * ReelPublishTracker.kt), and the progress copy below is `PublishRing.kt`'s
 * word for word. Two clients that describe the same upload with two different
 * vocabularies is how a support conversation becomes impossible, and the
 * founder asked for the web to match the phone.
 *
 * ONE phase is added here that the phone does not have: `ready`. The phone
 * posts automatically the moment the asset is attachable, so it never has to
 * name the state where the bytes are done and a person has not pressed
 * anything yet. This studio does — the whole point of a wide screen is that
 * you fill in details while the file uploads — so the "attachable, waiting
 * for you" state needs a name and a rule. `ready` is that name, and
 * `canPublish` is that rule.
 */

import type { MediaStatus } from "@/tube/uploadApi"
import { classifyMediaStatus } from "./poll"

/* ── The phases ───────────────────────────────────────────────────────────── */

export type UploadPhase =
  /** No file chosen. */
  | "idle"
  /** The file has been read and a slot is being reserved. */
  | "preparing"
  /** Bytes are moving — either the single PUT or the chunk sequence. */
  | "uploading"
  /** The bytes are in. The server is transcoding and moderating. */
  | "processing"
  /** `ready` + `passed`. Attachable. Publish is now allowed and not before. */
  | "ready"
  /** Creating the post, and publishing it if that was asked for. */
  | "posting"
  /** Done. `postId` is set. */
  | "published"
  /** Terminal for this attempt. `error` says why, `retryable` says what next. */
  | "failed"

export interface UploadState {
  phase: UploadPhase
  /** 0..1 of the file's bytes. Monotonic — see `progress` below. */
  progress: number
  /** Set once the slot is reserved, whichever path was taken. */
  mediaId: string | null
  /** True when the chunked path is in use. Affects the retry advice only. */
  chunked: boolean
  /** The media asset's own last-seen state, for the honest status line. */
  processingStatus: string | null
  moderationStatus: string | null
  /** Set on `published`. This is the POST id — the thing /tube/{id} takes. */
  postId: string | null
  /** Whether the post was published live, or created scheduled/unlisted. */
  scheduled: boolean
  error: string | null
  /**
   * Whether starting over is worth the person's time.
   *
   * False means the file itself will not work — moderation rejected it, the
   * transcode failed on the container. Offering "Try again" there is asking
   * somebody to wait ten minutes for the same answer.
   */
  retryable: boolean
}

export const initialUploadState: UploadState = {
  phase: "idle",
  progress: 0,
  mediaId: null,
  chunked: false,
  processingStatus: null,
  moderationStatus: null,
  postId: null,
  scheduled: false,
  error: null,
  retryable: false,
}

/* ── The events ───────────────────────────────────────────────────────────── */

export type UploadEvent =
  /** A file passed the local gate and the flow is starting. */
  | { type: "start" }
  /** `/v1/media/init` (or the resumable init) answered. */
  | { type: "reserved"; mediaId: string; chunked: boolean }
  /** Bytes moved. */
  | { type: "progress"; loaded: number; total: number }
  /** The PUT finished, or every chunk is in and `complete` returned. */
  | { type: "bytes_in" }
  /** One poll of `/v1/media/{id}/status`. */
  | { type: "status"; status: MediaStatus }
  /** Publish was pressed and the post is being created. */
  | { type: "posting" }
  /** `POST /v1/posts` (and the optional publish) succeeded. */
  | { type: "published"; postId: string; scheduled: boolean }
  | { type: "failed"; error: string; retryable: boolean }
  /** Back to nothing — a new file, or Cancel. */
  | { type: "reset" }

/* ── The table ────────────────────────────────────────────────────────────── */

/**
 * The one transition rule that is not obvious: **progress never runs
 * backwards**.
 *
 * The chunked path reports progress per PART, so a naive `loaded/total`
 * resets to zero at every chunk boundary and a 2 GB upload shows a bar that
 * sweeps and snaps back four hundred times. The caller composes a whole-file
 * figure, but a retried part still replays bytes that were already counted.
 * Clamping monotonically here means the composition can be simple and wrong
 * in the harmless direction, and the bar still only ever moves right. The
 * Android tracker has the same clamp for the same reason.
 */
export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {
    case "reset":
      return initialUploadState

    case "start":
      // Deliberately from ANY phase. Picking a new file mid-upload is a
      // legitimate thing to do — the caller aborts the in-flight request and
      // sends this — and a guard here would leave the machine stuck in
      // `uploading` for a transfer that no longer exists.
      return { ...initialUploadState, phase: "preparing" }

    case "reserved":
      if (state.phase !== "preparing") return state
      return {
        ...state,
        phase: "uploading",
        mediaId: event.mediaId,
        chunked: event.chunked,
      }

    case "progress": {
      if (state.phase !== "uploading") return state
      const fraction = event.total > 0 ? event.loaded / event.total : 0
      const clamped = Math.min(1, Math.max(state.progress, fraction))
      return clamped === state.progress ? state : { ...state, progress: clamped }
    }

    case "bytes_in":
      if (state.phase !== "uploading" && state.phase !== "preparing") return state
      return { ...state, phase: "processing", progress: 1 }

    case "status": {
      // A status poll that lands after Publish was pressed must not drag the
      // machine back to `ready` — the post is already being written. This is
      // not hypothetical: the poll is on a timer and Publish is a click.
      if (state.phase !== "processing" && state.phase !== "ready") return state

      const verdict = classifyMediaStatus(event.status)
      const next: UploadState = {
        ...state,
        processingStatus: event.status.processing_status ?? state.processingStatus,
        moderationStatus: event.status.moderation_status ?? state.moderationStatus,
      }

      switch (verdict.kind) {
        case "ready":
          return { ...next, phase: "ready" }
        case "rejected":
        case "failed":
          return {
            ...next,
            phase: "failed",
            error: verdict.message,
            // Neither is worth retrying with the same file, and saying so is
            // the kindest thing on the screen. A rejected video rejects
            // again; a transcode that failed on the container fails again.
            retryable: false,
          }
        case "waiting":
          // Includes `manual_review`, which is genuinely still moving — a
          // human is looking at it. `processing` stays the phase and the
          // status line says what the moderation column actually says.
          return next.phase === state.phase && next.processingStatus === state.processingStatus
            ? state
            : { ...next, phase: "processing" }
      }
      return next
    }

    case "posting":
      if (state.phase !== "ready") return state
      return { ...state, phase: "posting", error: null }

    case "published":
      if (state.phase !== "posting") return state
      return { ...state, phase: "published", postId: event.postId, scheduled: event.scheduled }

    case "failed":
      // From any phase, including `posting`: a publish that failed is a
      // failure of the whole attempt as far as the screen is concerned.
      return { ...state, phase: "failed", error: event.error, retryable: event.retryable }
  }
}

/* ── What the screen asks the machine ─────────────────────────────────────── */

/**
 * May Publish be pressed?
 *
 * `phase === "ready"` and nothing else. That single expression is the whole of
 * "never let Publish be pressable before the asset is ready + passed", and it
 * is one expression rather than a condition spread over a button, a hook and a
 * submit handler precisely so that it cannot be half-changed later.
 *
 * The FORM's own validity is a separate question with a separate answer —
 * ./fields.ts — because they fail differently: an invalid form is fixed in
 * two seconds and a video that is not ready is fixed by waiting.
 */
export function canPublish(state: UploadState): boolean {
  return state.phase === "ready"
}

/** Is anything still moving? Used to warn before leaving the page. */
export function isActive(state: UploadState): boolean {
  return (
    state.phase === "preparing" ||
    state.phase === "uploading" ||
    state.phase === "processing" ||
    state.phase === "posting"
  )
}

/**
 * The one-line status, in the phone's words.
 *
 * `PublishRing.kt`: Uploading → "Uploading 42%", Preparing → "Preparing",
 * Processing → "Processing", Posting → "Posting", Published → "Posted",
 * Failed → "Couldn't post". The percentage is floored, not rounded, so the
 * label never says 100% while bytes are still going out.
 */
export function phaseLabel(state: UploadState): string {
  switch (state.phase) {
    case "idle":
      return ""
    case "preparing":
      return "Preparing"
    case "uploading":
      return `Uploading ${Math.floor(state.progress * 100)}%`
    case "processing":
      return "Processing"
    case "ready":
      return "Ready to post"
    case "posting":
      return "Posting"
    case "published":
      return state.scheduled ? "Scheduled" : "Posted"
    case "failed":
      return "Couldn't post"
  }
}

/**
 * What the ring should draw.
 *
 * Determinate only while bytes are moving and at the end. The transcode has
 * no honest percentage — `transcoding_jobs` reports per-profile status and
 * nothing about how far through any of them the encoder is — so `processing`
 * is indeterminate rather than a bar that sits at some invented number.
 */
export type RingShape =
  | { kind: "none" }
  | { kind: "indeterminate" }
  | { kind: "determinate"; fraction: number }

export function ringShape(state: UploadState): RingShape {
  switch (state.phase) {
    case "uploading":
      return { kind: "determinate", fraction: state.progress }
    case "preparing":
    case "processing":
    case "posting":
      return { kind: "indeterminate" }
    case "ready":
    case "published":
      return { kind: "determinate", fraction: 1 }
    default:
      return { kind: "none" }
  }
}
