"use client"

/**
 * The strip that says what the upload is doing, pinned above every step.
 *
 * ── It is never hidden, and never optimistic ──────────────────────────────
 * The whole design of this studio is that the transfer runs behind the form,
 * so the ONE thing that must always be on screen is the truth about it. Two
 * rules follow, and both are things this could easily have got wrong:
 *
 *   · the percentage is the bytes, not a timer. `putObject` reports real XHR
 *     upload progress, and `phaseLabel` floors it, so it cannot say 100%
 *     while bytes are still going out.
 *   · "Processing" has NO percentage. The transcode reports per-profile job
 *     status and nothing about how far through any of them it is. A bar
 *     crawling at an invented rate is a lie that people time their day by.
 *
 * ── The failures are shown, not swallowed ─────────────────────────────────
 * All four of the ones the brief names surface here with their own sentence
 * and their own next step: an expired signed URL and a dropped connection are
 * retryable and say so; a moderation rejection and a failed transcode are not
 * and offer a different file instead. `state.retryable` is what separates
 * them, and it is set from the classification rather than from the phase.
 */

import { useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react"
import {
  formatBytes,
  formatRemaining,
  phaseLabel,
  ringShape,
  transferStats,
  type UploadState,
} from "./machine"
import type { MediaFacts } from "./poll"

interface Props {
  state: UploadState
  facts: MediaFacts | null
  statusNote: string | null
  fileName: string | null
  /** True when the retry will pick up where the transfer stopped rather than
   *  start it again. Chunked sessions only — see ./useVideoUpload.ts. */
  resumable?: boolean
  onRetry: () => void
  onCancel: () => void
}

export function UploadStatus({
  state,
  facts,
  statusNote,
  fileName,
  resumable = false,
  onRetry,
  onCancel,
}: Props) {
  /*
    ── A clock that only runs while bytes are moving ────────────────────────
    "About 6 minutes left" is computed from elapsed time, so it has to be
    recomputed even when no progress event has arrived — otherwise a stalled
    transfer shows the same cheerful estimate for a minute. One tick a second,
    started and stopped with the phase, so a finished upload is not holding an
    interval open behind a form somebody is still filling in.
  */
  const [now, setNow] = useState(() => Date.now())
  const moving = state.phase === "uploading"
  useEffect(() => {
    if (!moving) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [moving])

  if (state.phase === "idle") return null

  const ring = ringShape(state)
  const failed = state.phase === "failed"
  const done = state.phase === "ready" || state.phase === "published"
  const stats = transferStats(state, now)

  return (
    <div
      className={`rounded-mo border bg-mo-surface p-4 shadow-mo ${
        failed ? "border-mo-bad/60" : "border-mo"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" aria-hidden>
          {failed ? (
            <AlertCircle className="h-5 w-5 text-mo-bad" />
          ) : done ? (
            <CheckCircle2 className="h-5 w-5 text-mo-good" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-mo-cyan" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          {/*
            `aria-live="polite"` on the LABEL only, and not on the whole
            strip. The percentage changes several times a second; announcing
            the surrounding text with it would make a screen reader read the
            file name and the resolution over and over. Phase words change a
            handful of times in a whole upload.
          */}
          <p className="text-sm font-semibold text-mo-ink" aria-live="polite">
            {phaseLabel(state)}
          </p>

          {fileName ? (
            <p className="mt-0.5 truncate text-xs text-mo-body" title={fileName}>
              {fileName}
              {state.chunked ? " · chunked upload" : null}
            </p>
          ) : null}

          {ring.kind === "determinate" && state.phase === "uploading" ? (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-mo-pill bg-mo-sunken"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.floor(ring.fraction * 100)}
              aria-label="Upload progress"
            >
              <div
                className="h-full bg-mo-cyan transition-[width] duration-150 ease-mo"
                style={{ width: `${(ring.fraction * 100).toFixed(1)}%` }}
              />
            </div>
          ) : null}

          {/*
            The bytes, and an estimate.

            Not in the `aria-live` label above: this line changes every second
            and a screen reader reading "eight hundred and twenty megabytes of
            two gigabytes" over and over would drown out everything else on the
            page. The percentage IS announced, through `phaseLabel`, which is
            the number somebody actually needs spoken.
          */}
          {state.phase === "uploading" && stats.total > 0 ? (
            <p className="mt-1.5 text-xs tabular-nums text-mo-body">
              {formatBytes(stats.loaded)} of {formatBytes(stats.total)}
              {stats.secondsRemaining !== null
                ? ` · ${formatRemaining(stats.secondsRemaining)}`
                : null}
            </p>
          ) : null}

          {/* An indeterminate stripe rather than a bar at some invented value. */}
          {ring.kind === "indeterminate" ? (
            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-mo-pill bg-mo-sunken"
              role="progressbar"
              aria-label={phaseLabel(state)}
            >
              <div className="h-full w-1/3 animate-pulse bg-mo-purple" />
            </div>
          ) : null}

          {statusNote && !failed ? (
            <p className="mt-2 text-xs text-mo-body">{statusNote}</p>
          ) : null}

          {facts ? (
            <p className="mt-2 text-xs text-mo-body">
              {facts.width}×{facts.height}
              {facts.durationMs > 0 ? ` · ${Math.round(facts.durationMs / 1000)}s` : ""}
            </p>
          ) : null}

          {failed && state.error ? (
            <p role="alert" className="mt-2 text-sm text-mo-bad">
              {state.error}
            </p>
          ) : null}

          {failed ? (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {state.retryable ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="inline-flex items-center gap-2 rounded-mo-pill border border-mo-strong px-4 py-1.5 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised"
                >
                  <RotateCcw aria-hidden className="h-3.5 w-3.5" />
                  {/*
                    The word is the truth about what will happen. A chunked
                    session keeps its parts for 24 hours and the retry asks
                    the server which ones it already has, so at 1.6 GB of 2 GB
                    the retry sends 0.4 GB. The simple path has no such thing
                    and starts over, and saying "Resume" there would be a
                    promise the transport cannot keep.
                  */}
                  {resumable ? "Resume upload" : "Try again"}
                </button>
              ) : (
                // Not retryable: the same file gives the same answer, and
                // offering "Try again" would be asking somebody to wait ten
                // minutes to be told the same thing.
                <p className="text-xs text-mo-body">
                  Trying the same file again will get the same answer. Pick a different file.
                </p>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="text-sm text-mo-body underline underline-offset-2 hover:text-mo-ink"
              >
                Choose another file
              </button>
            </div>
          ) : null}
        </div>

        {!failed && state.phase !== "published" ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel this upload"
            title="Cancel this upload"
            className="shrink-0 rounded-mo p-1.5 text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
