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
  /**
   * The bytes themselves, and when the transfer started.
   *
   * ── A percentage is not enough on a 2 GB file ─────────────────────────
   * "41%" of something whose size is off-screen tells somebody nothing they
   * can plan around. "820 MB of 2.0 GB · about 6 minutes left" tells them
   * whether to go and make tea. Both numbers are the XHR's own — no
   * estimate of the file size, no invented rate — and the remaining time is
   * derived in `transferStats` from the mean speed so far, which is stated
   * there as the approximation it is.
   *
   * `startedAt` is set by the reducer from the event rather than by
   * `Date.now()` inside it, because a reducer that reads the clock is a
   * reducer whose tests need a fake one.
   */
  loaded: number
  total: number
  startedAt: number | null
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
  loaded: 0,
  total: 0,
  startedAt: null,
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
  /** `/v1/media/init` (or the resumable init) answered. `at` is the clock the
   *  caller read, so the reducer never reads one itself. */
  | { type: "reserved"; mediaId: string; chunked: boolean; at: number }
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
        startedAt: event.at,
      }

    case "progress": {
      if (state.phase !== "uploading") return state
      const fraction = event.total > 0 ? event.loaded / event.total : 0
      const clamped = Math.min(1, Math.max(state.progress, fraction))
      // `loaded` is clamped to the same monotonic rule as `progress` and for
      // the same reason: a retried chunk replays bytes that were already
      // counted, and a byte counter that steps backwards mid-upload produces
      // a "time remaining" that jumps to infinity for one frame.
      const loaded = Math.max(state.loaded, Math.min(event.loaded, event.total || event.loaded))
      const total = event.total > 0 ? event.total : state.total
      if (clamped === state.progress && loaded === state.loaded && total === state.total) {
        return state
      }
      return { ...state, progress: clamped, loaded, total }
    }

    case "bytes_in":
      if (state.phase !== "uploading" && state.phase !== "preparing") return state
      return { ...state, phase: "processing", progress: 1, loaded: state.total }

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

/**
 * May Publish be pressed, and what will the person be told if it can?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SERVER STOPPED REQUIRING `ready` ON 2026-09-04, AND THIS STUDIO HAD NOT
 * NOTICED.
 *
 * post-service `create_guards.go`, read 2026-09-18, in its own words: "a reel
 * is publishable the moment its upload finishes, like Instagram/YouTube.
 * Transcoding is a background job that improves quality later and must not
 * gate publishing." The create gate is now `mediaConfirmed(processing_status)`
 * — an ALLOWLIST of `uploaded | processing | ready` — plus a moderation check
 * that refuses only an outright `rejected` (or an empty column, which means a
 * row the service does not understand). `pending` and `manual_review` pass.
 *
 * The `ready` + `passed` rule did not disappear; it MOVED, to
 * `processing.go`'s `hiddenWhileProcessing`. A post whose media is not yet
 * ready+passed is returned to its author and to nobody else, on the direct
 * read, on every batch and on every feed surface, and it is released the
 * instant media-service flips the row — decided at read time from the live
 * `media_assets` row, so no event has to arrive for it to happen.
 *
 * So "you can publish now and it will go live when ready" is TRUE here, and
 * this gate is what says so. `canPublish` above keeps its exact old meaning —
 * the asset is fully ready — because ./fields.ts's `publishAction` needs that
 * narrower fact to decide whether the extra `POST /v1/videos/{id}/publish`
 * would 409 NOT_READY.
 *
 * The one state that is deliberately NOT early-publishable is `pending_upload`
 * (and an unread status, which is what `null` is): the bytes have not been
 * confirmed, `mediaConfirmed` refuses it, and a create there is a 400 spent
 * out of an allowance of twenty an hour.
 */
export type PublishGate =
  /** Fully ready. The publish call is safe and the post is visible at once. */
  | { kind: "ready" }
  /** Confirmed but still encoding. The create is allowed; the publish call
   *  is not, and the post is author-only until the encode lands. */
  | { kind: "early"; note: string }
  /** Nothing to attach yet. */
  | { kind: "wait"; note: string }
  /** Never. */
  | { kind: "blocked"; note: string }

/** The `processing_status` values the server's create allowlist accepts. */
const CONFIRMED_PROCESSING = new Set(["uploaded", "processing", "ready"])

export function publishGate(state: UploadState): PublishGate {
  if (state.phase === "ready") return { kind: "ready" }
  if (state.phase === "failed") {
    return { kind: "blocked", note: state.error ?? "This upload cannot be posted." }
  }
  if (state.phase !== "processing") {
    return {
      kind: "wait",
      note:
        state.phase === "idle"
          ? "Choose a video first."
          : "Posting unlocks as soon as the file has finished uploading.",
    }
  }

  // Phase `processing` means the bytes are in and `confirm` (or the resumable
  // `complete`) has returned. That is necessary but not sufficient: the status
  // poll is what says which of the allowlisted values the column holds, and
  // until one has landed there is nothing to base a claim on.
  const processing = state.processingStatus
  const moderation = state.moderationStatus
  if (processing === null || !CONFIRMED_PROCESSING.has(processing)) {
    return { kind: "wait", note: "Waiting for the server to confirm the file." }
  }
  if (moderation === null || moderation === "rejected") {
    return { kind: "wait", note: "Waiting for the first safety check." }
  }

  return {
    kind: "early",
    note: "Still processing. You can post it now — only you will see it until the video finishes, then it appears for everyone.",
  }
}

/** Publish may be pressed under either verdict. */
export function mayPublish(state: UploadState): boolean {
  const gate = publishGate(state)
  return gate.kind === "ready" || gate.kind === "early"
}

/* ── The numbers under the bar ────────────────────────────────────────────── */

export interface TransferStats {
  loaded: number
  total: number
  /** Floored, so it never reads 100% while bytes are still going out. */
  percent: number
  /** Bytes per second, averaged over the whole transfer. Null before there is
   *  enough of it to divide by. */
  bytesPerSecond: number | null
  /** Seconds, or null when there is no honest estimate. */
  secondsRemaining: number | null
}

/**
 * What to put under the progress bar.
 *
 * ── The mean, not a sliding window ────────────────────────────────────────
 * A windowed rate is more responsive and much worse here. Upload throughput
 * on a domestic connection swings by a factor of three between one second and
 * the next, and a "time remaining" computed from the last two seconds swings
 * with it — 4 minutes, 11 minutes, 3 minutes, over and over, which reads as a
 * number being made up. It is being made up. The mean over the whole transfer
 * settles within the first few seconds and then moves slowly, which is both
 * calmer to look at and, over a multi-minute upload, closer to right.
 *
 * Null rather than a guess in the first moments: before a second has passed,
 * or before any bytes have moved, there is nothing to divide.
 */
export function transferStats(state: UploadState, now: number): TransferStats {
  const { loaded, total, startedAt } = state
  const percent = total > 0 ? Math.floor((loaded / total) * 100) : 0

  const elapsedMs = startedAt === null ? 0 : now - startedAt
  if (elapsedMs < 1000 || loaded <= 0 || total <= 0) {
    return { loaded, total, percent, bytesPerSecond: null, secondsRemaining: null }
  }

  const bytesPerSecond = loaded / (elapsedMs / 1000)
  if (bytesPerSecond <= 0) {
    return { loaded, total, percent, bytesPerSecond: null, secondsRemaining: null }
  }
  const remaining = Math.max(0, total - loaded)
  return {
    loaded,
    total,
    percent,
    bytesPerSecond,
    secondsRemaining: Math.round(remaining / bytesPerSecond),
  }
}

/** "820 MB", "2.0 GB". Decimal units, matching what a file manager shows. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—"
  if (bytes < 1000) return `${Math.round(bytes)} B`
  if (bytes < 1000 * 1000) return `${Math.round(bytes / 1000)} KB`
  if (bytes < 1000 * 1000 * 1000) return `${Math.round(bytes / (1000 * 1000))} MB`
  return `${(bytes / (1000 * 1000 * 1000)).toFixed(1)} GB`
}

/**
 * "about 6 minutes left".
 *
 * Rounded coarsely on purpose. A countdown to the second on a number this
 * uncertain invites somebody to watch it, and watching it is how they notice
 * it going up. Under ten seconds it says "nearly done" rather than counting,
 * for the same reason.
 */
export function formatRemaining(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return ""
  if (seconds < 10) return "nearly done"
  if (seconds < 60) return `about ${Math.round(seconds / 10) * 10} seconds left`
  const minutes = Math.round(seconds / 60)
  if (minutes === 1) return "about a minute left"
  if (minutes < 60) return `about ${minutes} minutes left`
  const hours = Math.round(seconds / 3600)
  return hours === 1 ? "about an hour left" : `about ${hours} hours left`
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
