"use client"

/**
 * The cover picker: an exact-frame filmstrip scrubber with a time readout,
 * and an upload-your-own option beside it.
 *
 * That shape is the founder's, named for Android and asked for here so the
 * two match. `feature/post/.../createhub/CoverPicker.kt` is the reference: 24
 * cells, a draggable handle, a `0:42.6` readout, an "Upload" pill and a "Use
 * this frame" confirm.
 *
 * ── The strip is coarse and the handle is exact ───────────────────────────
 * The 24 cells are a MAP — they say what is in the video and roughly where.
 * The handle picks the precise instant between them, and the preview above
 * redraws at whatever millisecond it lands on. Snapping the handle to the
 * cells would turn a frame-accurate control into a 24-position one, and
 * "extract the exact frame" is the thing that was asked for.
 *
 * ── Keyboard, and why the step is 100 ms ──────────────────────────────────
 * The readout resolves to a tenth of a second, so an arrow key that moved by
 * less than that would produce a gesture with no visible effect — the classic
 * "is this control broken?" A tenth per press, a second with Shift, matching
 * what the readout can actually show.
 */

import { useCallback, useEffect, useRef } from "react"
import { ImageUp, Loader2 } from "lucide-react"
import { IMAGE_ACCEPT_ATTR } from "@/tube/uploadApi"
import { clampTimestamp, formatTimecode, nearestFrameIndex } from "./filmstrip"
import type { CoverStudio } from "./useCoverStudio"

const STEP_MS = 100
const BIG_STEP_MS = 1_000

interface Props {
  cover: CoverStudio
}

export function CoverPicker({ cover }: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const seekFromPointer = useCallback(
    (clientX: number) => {
      const el = stripRef.current
      if (!el || cover.durationMs <= 0) return
      const box = el.getBoundingClientRect()
      if (box.width <= 0) return
      const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
      cover.scrubTo(clampTimestamp(Math.round(ratio * cover.durationMs), cover.durationMs))
    },
    [cover]
  )

  // Pointer capture on the STRIP, and move/up listeners on the window.
  // Without the window listeners a fast drag that leaves the strip stops
  // updating and the handle is left behind the finger; with them the gesture
  // survives leaving the element, which is what every native slider does.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      e.preventDefault()
      seekFromPointer(e.clientX)
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [seekFromPointer])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? BIG_STEP_MS : STEP_MS
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      cover.scrubTo(clampTimestamp(cover.selectedMs - step, cover.durationMs))
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      cover.scrubTo(clampTimestamp(cover.selectedMs + step, cover.durationMs))
    } else if (e.key === "Home") {
      e.preventDefault()
      cover.scrubTo(0)
    } else if (e.key === "End") {
      e.preventDefault()
      cover.scrubTo(clampTimestamp(cover.durationMs, cover.durationMs))
    }
  }

  const ratio = cover.durationMs > 0 ? cover.selectedMs / cover.durationMs : 0
  const highlighted = nearestFrameIndex(cover.timestamps, cover.selectedMs)

  /**
   * The caption under the preview, in the phone's words: "Cover · uploaded",
   * "Cover · from the video", "Finding cover frames…".
   */
  const caption = cover.extracting
    ? "Finding cover frames…"
    : cover.source === "upload"
      ? "Cover · uploaded"
      : cover.source === "frame"
        ? "Cover · from the video"
        : "Cover · generated from the video"

  return (
    <section aria-label="Cover" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-mo-display text-sm uppercase tracking-mo-eyebrow text-mo-body">
          Cover
        </h3>
        {cover.uploading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-mo-body">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            Uploading cover
          </span>
        ) : cover.mediaId ? (
          <span className="text-xs text-mo-good">Cover ready</span>
        ) : null}
      </div>

      {/* The preview. 16:9 because long video is. */}
      <div className="overflow-hidden rounded-mo border border-mo bg-mo-sunken">
        <div className="relative aspect-video w-full">
          {cover.previewUrl ? (
            /* A data: or blob: URL produced by this browser's own canvas.
               next/image cannot optimise one — there is no origin to fetch it
               from and no loader that could resize it — so it would add a
               component in front of bytes that are already in memory. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover.previewUrl}
              alt="Cover preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-mo-body">
              {cover.available ? "Finding cover frames…" : "No preview for this file"}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-mo-body">{caption}</p>

      {cover.available ? (
        <>
          {/* The strip. */}
          <div
            ref={stripRef}
            role="slider"
            tabIndex={0}
            aria-label="Filmstrip, drag to choose a frame"
            aria-valuemin={0}
            aria-valuemax={Math.round(cover.durationMs)}
            aria-valuenow={Math.round(cover.selectedMs)}
            aria-valuetext={`At ${formatTimecode(cover.selectedMs)}`}
            className="relative h-12 w-full cursor-ew-resize touch-none overflow-hidden rounded-mo border border-mo bg-mo-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mo"
            onKeyDown={onKeyDown}
            onPointerDown={(e) => {
              dragging.current = true
              e.currentTarget.setPointerCapture?.(e.pointerId)
              seekFromPointer(e.clientX)
            }}
          >
            <div aria-hidden className="flex h-full w-full">
              {cover.timestamps.map((ms, i) => (
                <div
                  key={ms + ":" + i}
                  className={`h-full flex-1 border-r border-mo/40 bg-cover bg-center last:border-r-0 ${
                    i === highlighted ? "opacity-100" : "opacity-70"
                  }`}
                  style={
                    cover.frames[i] ? { backgroundImage: `url(${cover.frames[i]})` } : undefined
                  }
                />
              ))}
            </div>
            {/* The handle. 3px white, matching the phone. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 h-full w-[3px] bg-white shadow-mo"
              style={{ left: `calc(${(ratio * 100).toFixed(3)}% - 1.5px)` }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className="font-mo-mono text-sm tabular-nums text-mo-ink"
              aria-live="off"
            >
              {formatTimecode(cover.selectedMs)}
            </span>
            <button
              type="button"
              className="rounded-mo-pill border border-mo-strong px-4 py-2 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-50"
              onClick={cover.useCurrentFrame}
              disabled={cover.uploading || cover.extracting}
            >
              Use this frame
            </button>
            <UploadPill cover={cover} />
            {cover.mediaId ? (
              <button
                type="button"
                className="text-sm text-mo-body underline underline-offset-2 hover:text-mo-ink"
                onClick={cover.clearCover}
                disabled={cover.uploading}
              >
                Use the generated one
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {/*
            The browser could not decode this container — ProRes, HEVC without
            hardware, a codec Chrome dropped. The SERVER can still transcode
            it, so this is a missing picker rather than a bad file, and saying
            so is the difference between "pick another file" and "carry on".
          */}
          <p className="text-sm text-mo-body">
            This browser cannot read frames out of this file, so there is no frame picker for it.
            The upload is unaffected — the server will generate a cover, or you can upload your own.
          </p>
          <UploadPill cover={cover} />
        </div>
      )}

      {cover.error ? (
        <p role="alert" className="text-sm text-mo-bad">
          {cover.error}
        </p>
      ) : null}
    </section>
  )
}

function UploadPill({ cover }: { cover: CoverStudio }) {
  const input = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-50"
        onClick={() => input.current?.click()}
        disabled={cover.uploading}
        aria-label="Upload a cover from your files"
      >
        <ImageUp aria-hidden className="h-4 w-4" />
        Upload
      </button>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Cleared so choosing the same file twice fires `change` again —
          // otherwise a failed cover cannot be retried with the same image.
          e.target.value = ""
          if (file) cover.useImageFile(file)
        }}
      />
    </>
  )
}
