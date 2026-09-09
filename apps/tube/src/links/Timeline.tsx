"use client"

/**
 * Where the links land, drawn against the length of the video.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY A PICTURE RATHER THAN THREE NUMBER FIELDS
 *
 * Two alternates placed eight seconds apart are not two prompts. `activeCard`
 * on the watch page shows ONE card at a time and picks the latest live one, so
 * the first is cut off mid-window by the second — and there is nothing in
 * "0:08" and "0:16" that says so. Drawn against the video's own length, with
 * each card's twelve-second window as a BAR rather than a tick, an overlap is
 * the thing you see first.
 *
 * The bars are the real windows: `MIN_ALTERNATE_GAP_MS` is `CARD_VISIBLE_MS`,
 * so two bars that touch are exactly the closest the editor allows, and two
 * that overlap are exactly what it refuses.
 *
 * ── It is a diagram, not a control ────────────────────────────────────────
 * Nothing here is clickable and nothing is draggable. Dragging a card along a
 * timeline is a nice affordance and a bad first version: it needs pointer
 * capture, a keyboard equivalent, and a scale on which a 12-second window on a
 * 40-minute video is four pixels wide. The timestamp field beside each row is
 * the control; this says what the fields add up to. Screen readers get the
 * same information from the fields, so the whole strip is `aria-hidden`.
 *
 * ── With no duration there is no strip ────────────────────────────────────
 * A post whose media has not finished processing has no length anywhere the
 * client can read — see `videoDurationMs`. A strip drawn against a guessed
 * length would put the bars in places that mean nothing, so there is none, and
 * the section says why.
 */

import { CARD_VISIBLE_MS, chapterClock } from "@/watch/timeline"

export interface TimelineMark {
  key: string
  atMs: number
  label: string
  /** True when this mark is in a state the creator has to fix. */
  problem?: boolean
}

export interface TimelineProps {
  durationMs: number
  marks: readonly TimelineMark[]
  /** The up-next window, drawn as a band at the end. */
  upNext?: { startMs: number; endMs: number } | null
}

export function Timeline({ durationMs, marks, upNext }: TimelineProps) {
  if (durationMs <= 0) return null

  const pct = (ms: number) => Math.min(100, Math.max(0, (ms / durationMs) * 100))
  const windowPct = Math.min(100, (CARD_VISIBLE_MS / durationMs) * 100)

  return (
    <div className="mt-3">
      <div
        aria-hidden
        className="relative h-9 w-full overflow-hidden rounded-mo border border-mo bg-mo-sunken"
      >
        {upNext && (
          <div
            className="absolute inset-y-0 bg-mo-purple/25"
            style={{
              left: `${pct(upNext.startMs)}%`,
              width: `${Math.max(1, pct(upNext.endMs) - pct(upNext.startMs))}%`,
            }}
          />
        )}

        {marks.map((mark) => (
          <div
            key={mark.key}
            className={`absolute inset-y-1 rounded-mo-sm ${
              mark.problem ? "bg-mo-bad/60" : "bg-mo-cyan/45"
            }`}
            style={{
              left: `${pct(mark.atMs)}%`,
              // A minimum width so a card on a very long video is still a
              // visible bar rather than a hairline.
              width: `${Math.max(1.5, Math.min(windowPct, 100 - pct(mark.atMs)))}%`,
            }}
          >
            <span className="absolute inset-y-0 left-0 w-0.5 bg-mo-ink/70" />
          </div>
        ))}
      </div>

      <div aria-hidden className="mt-1 flex justify-between text-[11px] text-mo-body">
        <span>0:00</span>
        <span>{chapterClock(durationMs)}</span>
      </div>

      {/* The same facts as words, for anyone not looking at the strip. The
          fields already carry each timestamp, so this only adds the ORDER and
          the two things the strip is drawn to show. */}
      <p className="sr-only">
        {marks.length === 0
          ? "No alternates are placed yet."
          : `${marks.length} alternate${marks.length === 1 ? "" : "s"} placed at ${marks
              .slice()
              .sort((a, b) => a.atMs - b.atMs)
              .map((m) => chapterClock(m.atMs))
              .join(", ")}, in a video ${chapterClock(durationMs)} long.`}
        {upNext
          ? ` Up next shows from ${chapterClock(upNext.startMs)} to the end.`
          : ""}
      </p>
    </div>
  )
}
