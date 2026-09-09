"use client"

/**
 * Up next — one end screen, in the closing stretch.
 *
 * ── The creator never types a millisecond ─────────────────────────────────
 * The row wants `start_ms` and `end_ms`. What is on screen is one video and
 * one slider in SECONDS for how long before the end it should show;
 * `upNextWindow` turns that into the pair. `end_ms` is always the end of the
 * video, because the one thing an up-next tile must not do is disappear before
 * the video does.
 *
 * ── And never places the box ──────────────────────────────────────────────
 * `UP_NEXT_POSITION` is fixed and the reasoning is in ./upnext.ts: right-hand
 * side, upper half, clear of the transport, clear of "Full video", and clear
 * of the in-video card which is drawn top-left. A single tile has one sensible
 * place; a drag surface is a different feature.
 *
 * ── Why this is not offered as a general way to link ──────────────────────
 * Because it is a placement primitive rather than a linking one. The founder's
 * two phrases map onto alternates and the sequence; this exists so the last
 * thing a viewer sees is a way onward, and giving it a general "add a link"
 * shape would pull relations out of the two mechanisms that model them
 * properly and into the one that just draws a box.
 */

import { chapterClock } from "@/watch/timeline"
import { VideoPicker } from "./VideoPicker"
import { Notice, Section, TextField } from "./ui"
import type { LibraryVideo } from "./useLinkEditor"
import {
  MAX_UP_NEXT_LEAD_MS,
  MIN_UP_NEXT_LEAD_MS,
  type UpNextDraft,
  type UpNextWindow,
  windowIsVisible,
} from "./upnext"

export interface UpNextSectionProps {
  draft: UpNextDraft
  window: UpNextWindow | null
  durationMs: number
  library: readonly LibraryVideo[]
  libraryTruncated: boolean
  subjectId: string
  passthroughCount: number
  dirty: boolean
  onChange: (patch: Partial<UpNextDraft>) => void
}

export function UpNextSection({
  draft,
  window,
  durationMs,
  library,
  libraryTruncated,
  subjectId,
  passthroughCount,
  dirty,
  onChange,
}: UpNextSectionProps) {
  const leadSeconds = Math.round(draft.leadMs / 1000)
  const visible = window ? windowIsVisible(window, durationMs) : true

  return (
    <Section
      id="upnext"
      title="Up next"
      intro="One tile in the last stretch of the video, offering somewhere to go when it ends."
      aside={
        dirty ? (
          <span className="rounded-mo-pill bg-mo-warn/20 px-2 py-0.5 text-[11px] font-semibold text-mo-warn">
            Unsaved
          </span>
        ) : null
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="block text-[12px] font-semibold text-mo-body">Plays next</span>
          <div className="mt-1">
            <VideoPicker
              label="Video for the up-next tile"
              videos={library}
              value={draft.targetId}
              truncated={libraryTruncated}
              exclude={[subjectId]}
              placeholder="No tile"
              onChange={(video) =>
                onChange({
                  targetId: video.id,
                  targetTitle: video.title,
                  title: draft.title.trim() || video.title,
                })
              }
              onClear={() => onChange({ targetId: "", targetTitle: "" })}
            />
          </div>
        </div>

        <TextField
          id="upnext-title"
          label="Title on the tile"
          value={draft.title}
          onChange={(next) => onChange({ title: next })}
          maxLength={100}
          placeholder="Up next"
          hint="Left blank, the tile reads &ldquo;Watch next&rdquo;."
        />
      </div>

      {draft.targetId && (
        <div className="mt-4">
          <label htmlFor="upnext-lead" className="block text-[12px] font-semibold text-mo-body">
            Shows for the last {leadSeconds} seconds
          </label>
          <input
            id="upnext-lead"
            type="range"
            min={MIN_UP_NEXT_LEAD_MS / 1000}
            max={MAX_UP_NEXT_LEAD_MS / 1000}
            step={5}
            value={leadSeconds}
            onChange={(e) => onChange({ leadMs: Number(e.target.value) * 1000 })}
            aria-describedby="upnext-lead-hint"
            className="mt-2 w-full accent-mo-cyan"
          />
          <p id="upnext-lead-hint" className="mt-1 text-[12px] text-mo-body">
            {window
              ? `From ${chapterClock(window.startMs)} to the end at ${chapterClock(window.endMs)}.`
              : "This video has no length recorded yet, so there is no window to compute."}
          </p>
        </div>
      )}

      {draft.targetId && !window && (
        <div className="mt-3">
          <Notice tone="bad">
            An up-next tile needs the video&rsquo;s length, and this one has none
            recorded — its media is still being processed, or none is attached.
            The tile cannot be saved until it has one.
          </Notice>
        </div>
      )}

      {draft.targetId && window && !visible && (
        <div className="mt-3">
          <Notice tone="warn">
            The watch page will not draw an end screen earlier than the last 30
            seconds (or the last fifth) of a video, whatever the row says — it
            is a guard against a tile authored before the video was re-trimmed.
            This window starts earlier than that, so a viewer would not see it.
            Shorten it.
          </Notice>
        </div>
      )}

      {passthroughCount > 0 && (
        <div className="mt-3">
          <Notice tone="warn">
            This video also carries {passthroughCount} end screen
            {passthroughCount === 1 ? "" : "s"} this screen has no control for.
            They are kept exactly as they are when you save.
          </Notice>
        </div>
      )}
    </Section>
  )
}
