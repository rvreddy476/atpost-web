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

import { AlertCircle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react"
import { phaseLabel, ringShape, type UploadState } from "./machine"
import type { MediaFacts } from "./poll"

interface Props {
  state: UploadState
  facts: MediaFacts | null
  statusNote: string | null
  fileName: string | null
  onRetry: () => void
  onCancel: () => void
}

export function UploadStatus({ state, facts, statusNote, fileName, onRetry, onCancel }: Props) {
  if (state.phase === "idle") return null

  const ring = ringShape(state)
  const failed = state.phase === "failed"
  const done = state.phase === "ready" || state.phase === "published"

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
                  Try again
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
