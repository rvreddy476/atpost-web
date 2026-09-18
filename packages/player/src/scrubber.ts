/**
 * The seek bar's two extra layers: what is buffered, and what is under the
 * cursor.
 *
 * Both are arithmetic over numbers the DOM hands out, and both are here rather
 * than in the render so the awkward cases — a `TimeRanges` that is empty, a
 * duration that has not arrived, a pointer two pixels off the left end of the
 * track — are values in a test rather than pixels in a screenshot.
 */

/** A buffered span, as fractions of the whole, ready to be a `left`/`width`. */
export interface BufferedSpan {
  start: number
  end: number
}

/**
 * The shape this file needs from a `TimeRanges`. Nothing more.
 *
 * Declared rather than imported so these functions can be called with a plain
 * array of pairs in a test — `TimeRanges` cannot be constructed.
 */
export interface TimeRangesLike {
  length: number
  start(index: number): number
  end(index: number): number
}

/**
 * The buffered ranges, as fractions.
 *
 * ── Why ranges and not one number ─────────────────────────────────────────
 * A player that draws "buffered" as a single bar from 0 to `buffered.end(0)`
 * tells the truth only until somebody seeks. After a jump forward there are
 * TWO spans — the part they watched and the part now loading — and a single
 * bar from zero would claim the gap in between is ready when it is the exact
 * thing that will stall. Drawing each span separately is the whole point of
 * this layer: it shows where the video will and will not play.
 *
 * Degenerate and reversed spans are dropped rather than clamped. A zero-width
 * div with a border is a visible speck on the bar in the wrong place.
 */
export function bufferedSpans(
  ranges: TimeRangesLike | null | undefined,
  durationSeconds: number
): BufferedSpan[] {
  if (!ranges || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return []
  const spans: BufferedSpan[] = []
  for (let i = 0; i < ranges.length; i += 1) {
    const rawStart = ranges.start(i)
    const rawEnd = ranges.end(i)
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue
    const start = Math.min(1, Math.max(0, rawStart / durationSeconds))
    const end = Math.min(1, Math.max(0, rawEnd / durationSeconds))
    if (end <= start) continue
    spans.push({ start, end })
  }
  return spans
}

/**
 * How much is buffered AHEAD of the playhead, 0..1.
 *
 * Not drawn — this is the number the resting hairline could use and the one
 * worth having in a log when somebody reports a stall. It is the end of the
 * span the playhead is INSIDE, which is the only span that can keep playback
 * going; a later span is not reachable without seeking.
 */
export function bufferedAhead(
  ranges: TimeRangesLike | null | undefined,
  currentSeconds: number,
  durationSeconds: number
): number {
  if (!ranges || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0
  const at = Number.isFinite(currentSeconds) ? currentSeconds : 0
  for (let i = 0; i < ranges.length; i += 1) {
    const start = ranges.start(i)
    const end = ranges.end(i)
    // A hair of tolerance at the head: the playhead sits a few milliseconds
    // ahead of the range start immediately after a seek, and a strict test
    // reports "nothing buffered" for the frame the person is looking at.
    if (at >= start - 0.25 && at <= end) {
      return Math.min(1, Math.max(0, end / durationSeconds))
    }
  }
  return 0
}

/**
 * Where a hover is on the bar, 0..1, and the time it points at.
 *
 * Clamped to the track, because a pointer capture keeps sending coordinates
 * after the cursor has left the element and an unclamped tooltip would fly off
 * the end of the player showing a negative time.
 */
export function hoverFraction(offsetX: number, width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 0
  if (!Number.isFinite(offsetX)) return 0
  return Math.min(1, Math.max(0, offsetX / width))
}

/**
 * Where to put the tooltip so it stays inside the player.
 *
 * Returned as a percentage for `left`, with the caller translating it by -50%.
 * The clamp is in fractions of the BAR and is computed from the tooltip's own
 * half-width: at the ends of a video the label would otherwise hang outside
 * the frame, which in fullscreen means off the screen entirely.
 *
 * A tooltip wider than the bar cannot be centred anywhere, and the honest
 * answer there is the middle rather than a negative offset.
 */
export function tooltipLeftPercent(
  fraction: number,
  barWidth: number,
  tooltipWidth: number
): number {
  const at = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  if (!Number.isFinite(barWidth) || barWidth <= 0) return at * 100
  if (!Number.isFinite(tooltipWidth) || tooltipWidth <= 0) return at * 100
  const half = tooltipWidth / 2 / barWidth
  if (half >= 0.5) return 50
  return Math.min(1 - half, Math.max(half, at)) * 100
}
