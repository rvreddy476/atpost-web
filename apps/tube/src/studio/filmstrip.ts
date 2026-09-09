/**
 * Which frames the cover scrubber offers, and how a time is written.
 *
 * Pure arithmetic. The actual seeking and drawing is ./frames.ts, which needs
 * a `<video>` and a `<canvas>`; this file needs neither and is asserted
 * directly in ./filmstrip.test.ts.
 *
 * ── Every number here is the phone's number ───────────────────────────────
 * `feature/post/.../createhub/Filmstrip.kt`: 24 frames, spaced
 * `length * index / count` with the first at zero, a tail margin of 0.1 s,
 * and a readout of `m:ss.t` that grows an hours field only when it needs one.
 * The founder asked for the phone's shape; matching its arithmetic as well as
 * its look means a creator who picks "the frame at 0:42.6" on their phone and
 * on the web gets the same picture.
 */

/** How many thumbnails the strip holds. `Filmstrip.FRAME_COUNT`. */
export const FRAME_COUNT = 24

/**
 * How close to the end the handle may go, in milliseconds.
 *
 * `TAIL_MARGIN_US = 100_000` on the phone — 0.1 s. Seeking to exactly
 * `duration` is not a frame at all: browsers clamp it to the last decodable
 * frame, which on plenty of encodes is black or a fade-out, and on some
 * returns nothing and leaves the canvas empty. A tenth of a second back is
 * always a real picture.
 */
export const TAIL_MARGIN_MS = 100

/**
 * The timestamps the strip is built from.
 *
 * ── Evenly spaced INCLUDING zero, which is not the obvious choice ─────────
 * `duration * i / count` puts the first thumbnail at 0 ms and the last at
 * `duration * 23/24` — so the strip never shows the final frame, and it does
 * show the first. That is the phone's spacing and it is the right one for a
 * scrubber: the strip is a MAP of the video, and a map that starts a second
 * in has a hole at the start where somebody's title card was.
 *
 * The tail margin is applied per timestamp rather than by shortening the
 * range, so a very short clip — where `duration * 23/24` is already inside
 * the margin — collapses toward the same last legal instant rather than
 * producing timestamps past the end.
 */
export function filmstripTimestamps(durationMs: number, count = FRAME_COUNT): number[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || count <= 0) return []
  const last = Math.max(0, durationMs - TAIL_MARGIN_MS)
  const stamps: number[] = []
  for (let i = 0; i < count; i++) {
    stamps.push(Math.min(last, Math.round((durationMs * i) / count)))
  }
  return stamps
}

/**
 * Snap a scrub position to something legal.
 *
 * The handle is dragged in pixels and turned into a time; this is the clamp
 * that stops it landing at or past the end. It does NOT snap to the strip's
 * timestamps, and that is deliberate: the strip is 24 coarse previews and the
 * handle picks the EXACT frame, which is what the founder asked for. Snapping
 * the handle to the strip would make a 24-position slider out of a
 * frame-accurate one.
 */
export function clampTimestamp(ms: number, durationMs: number): number {
  if (!Number.isFinite(ms) || ms < 0) return 0
  const last = Math.max(0, durationMs - TAIL_MARGIN_MS)
  return Math.min(last, ms)
}

/**
 * Which strip thumbnail is nearest a given time.
 *
 * Used only to highlight a cell under the handle. Ties go to the earlier
 * cell, which keeps the highlight from flickering between two neighbours
 * while a drag sits exactly between them.
 */
export function nearestFrameIndex(stamps: number[], ms: number): number {
  if (stamps.length === 0) return -1
  let best = 0
  let bestGap = Math.abs(stamps[0] - ms)
  for (let i = 1; i < stamps.length; i++) {
    const gap = Math.abs(stamps[i] - ms)
    if (gap < bestGap) {
      best = i
      bestGap = gap
    }
  }
  return best
}

/**
 * A time, written the way the phone writes it.
 *
 * `Filmstrip.format()`: `"0:42.6"` — minutes, seconds padded to two, and one
 * tenth. From an hour on it grows a field and pads the minutes too:
 * `"1:02:03.4"`.
 *
 * ── The tenth is the point ────────────────────────────────────────────────
 * A cover picker whose readout is `0:42` cannot tell two adjacent choices
 * apart, so somebody nudging the handle sees a number that does not move and
 * concludes the control is stuck. The tenth is the smallest unit that makes
 * the readout respond to the gesture.
 *
 * Truncated, not rounded: the readout must never name a time later than the
 * frame actually shown.
 */
export function formatTimecode(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0
  const totalTenths = Math.floor(safe / 100)
  const tenths = totalTenths % 10
  const totalSeconds = Math.floor(totalTenths / 10)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  const two = (n: number) => String(n).padStart(2, "0")
  if (hours > 0) return `${hours}:${two(minutes)}:${two(seconds)}.${tenths}`
  return `${minutes}:${two(seconds)}.${tenths}`
}

/* ── What the extracted frame is encoded as ───────────────────────────────── */

/**
 * The long edge a cover is scaled down to before upload.
 *
 * 1080, matching `JpegReelCoverEncoder` on the phone. A cover is drawn at
 * most at 1280×720 in this UI and on a channel grid at 320 wide; a 4K frame
 * is four megabytes of JPEG for a picture nothing will ever show at that
 * size, uploaded over the same connection that is busy with the video.
 */
export const COVER_MAX_EDGE = 1080

/** JPEG quality, matching the phone's 85. */
export const COVER_JPEG_QUALITY = 0.85

/** Long video is 16:9. (The phone uses 9:16 for a reel; there are no reels here.) */
export const COVER_ASPECT = 16 / 9

/**
 * The box a frame is scaled into, preserving its aspect.
 *
 * Returns whole pixels — a canvas sized to 640.4 is silently floored by the
 * browser and the drawn image is then a fraction off, which shows up as a
 * one-pixel transparent seam down one edge of the JPEG.
 */
export function scaleToBox(
  width: number,
  height: number,
  maxEdge = COVER_MAX_EDGE
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 }
  const longest = Math.max(width, height)
  if (longest <= maxEdge) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxEdge / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * The source rectangle that centre-crops `width × height` to `aspect`.
 *
 * Used only for an UPLOADED cover, never for an extracted frame. A frame
 * pulled out of the video already has the video's aspect and cropping it
 * would hand back a picture that does not match the thing it is a cover for;
 * an image somebody chose off their disk can be any shape at all, and a
 * channel grid full of covers in six aspect ratios is the thing this avoids.
 */
export function centreCrop(
  width: number,
  height: number,
  aspect = COVER_ASPECT
): { x: number; y: number; width: number; height: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, width: 0, height: 0 }
  const current = width / height
  if (current > aspect) {
    // Too wide: keep the full height, take a centred slice of the width.
    const cropped = Math.round(height * aspect)
    return { x: Math.round((width - cropped) / 2), y: 0, width: cropped, height }
  }
  const cropped = Math.round(width / aspect)
  return { x: 0, y: Math.round((height - cropped) / 2), width, height: cropped }
}
