"use client"

/**
 * Pulling a frame out of a local video file, in the browser.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AT ALL
 *
 * The founder asked for the phone's cover picker:
 *
 *     "thumbnail cover page — user can extract from the video, the cover
 *      page, or you can also upload when creating a video."
 *
 * The server cannot do the first half. `POST /v1/videos/{id}/cover-frame`
 * accepts `timestamp_ms`, answers 200 `{"status":"updated"}`, and does
 * nothing whatsoever with it — the handler binds the field and never passes
 * it on, and there is no frame-extraction code anywhere in media-service.
 * Verified live: the row is byte-identical afterwards. Only `cover_media_id`
 * — a separately uploaded image — actually changes anything.
 *
 * So the extraction happens HERE, and the result is uploaded as an ordinary
 * image through the ordinary media flow. That is also exactly what the
 * Android client does (`CoverPicker.kt` → `JpegReelCoverEncoder` →
 * `cover_media_id`), which means the two clients produce covers the same way
 * rather than one of them relying on a server feature that does not exist.
 *
 * ── The one thing that makes this possible ────────────────────────────────
 * `URL.createObjectURL(file)` produces a SAME-ORIGIN video. A canvas that
 * draws a cross-origin video is tainted and `toBlob` throws a
 * SecurityError — which is why this can only be done on the file the person
 * has just picked, and never on a video already on the server. That is not a
 * limitation in practice: the only moment a cover is chosen is the moment
 * the local file is in hand.
 *
 * ── Everything here fails soft ────────────────────────────────────────────
 * A browser that cannot decode the container — ProRes in a .mov, HEVC on a
 * machine with no hardware for it — cannot draw a frame, and that must not
 * stop the upload. The SERVER can transcode what the browser cannot play, so
 * a failed filmstrip means "no frame picker for this file", not "this file is
 * no good". Every entry point below returns null rather than throwing, and
 * the studio falls back to the auto-generated thumbnail plus the upload-your-
 * own option.
 */

import {
  centreCrop,
  clampTimestamp,
  COVER_ASPECT,
  COVER_JPEG_QUALITY,
  COVER_MAX_EDGE,
  scaleToBox,
} from "./filmstrip"

/** A local video, opened and measured. Call `close()` or leak the object URL. */
export interface LocalVideo {
  el: HTMLVideoElement
  url: string
  durationMs: number
  width: number
  height: number
  close: () => void
}

/**
 * Open the picked file as a hidden, muted, same-origin video.
 *
 * ── `preload="auto"` and `muted`, both load-bearing ───────────────────────
 * Seeking on an element that has only metadata gives a `seeked` event and a
 * canvas full of nothing, because there are no frames decoded to draw. And an
 * unmuted video element is blocked from loading data at all by autoplay
 * policy in several browsers — it never reaches `readyState >= 2` and the
 * whole picker silently hangs on a promise that never settles.
 *
 * `playsInline` matters on iOS Safari for the same reason: without it the
 * element wants to go fullscreen to decode, and it will not do that for an
 * element that was never in the document.
 */
export async function openLocalVideo(file: Blob): Promise<LocalVideo | null> {
  const url = URL.createObjectURL(file)
  const el = document.createElement("video")
  el.preload = "auto"
  el.muted = true
  el.playsInline = true
  el.crossOrigin = "anonymous"
  el.src = url

  const close = () => {
    el.removeAttribute("src")
    el.load()
    URL.revokeObjectURL(url)
  }

  try {
    await once(el, "loadedmetadata", "error", 20_000)
  } catch {
    close()
    return null
  }

  const durationMs = Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : 0
  const width = el.videoWidth
  const height = el.videoHeight

  // A container the browser parsed but cannot decode reports 0×0. There is
  // nothing to draw and no point pretending otherwise.
  if (width <= 0 || height <= 0 || durationMs <= 0) {
    close()
    return null
  }

  return { el, url, durationMs, width, height, close }
}

/**
 * Seek to a time and wait until there is really a frame there.
 *
 * ── `seeked` alone is not enough ──────────────────────────────────────────
 * Chrome fires `seeked` when the playhead has moved, which can be before the
 * frame at that position has been decoded — `drawImage` then paints the
 * PREVIOUS frame, and a filmstrip built that way is off by one cell
 * throughout. Waiting for `readyState >= HAVE_CURRENT_DATA` after the seek is
 * what makes the picture match the number under it.
 */
async function seekTo(el: HTMLVideoElement, ms: number): Promise<boolean> {
  const target = ms / 1000
  if (Math.abs(el.currentTime - target) < 0.001 && el.readyState >= 2) return true
  try {
    const settled = once(el, "seeked", "error", 15_000)
    el.currentTime = target
    await settled
  } catch {
    return false
  }
  if (el.readyState >= 2) return true
  try {
    await once(el, "loadeddata", "error", 5_000)
    return el.readyState >= 2
  } catch {
    return false
  }
}

/**
 * Draw whatever the element is showing into a canvas of the given long edge.
 *
 * No cropping. A frame taken out of the video already has the video's aspect,
 * and cropping it would hand back a cover that does not match the thing it is
 * a cover for. Cropping is only ever applied to an image somebody chose off
 * their own disk — see `imageToCoverBlob`.
 */
function drawFrame(el: HTMLVideoElement, maxEdge: number): HTMLCanvasElement | null {
  const box = scaleToBox(el.videoWidth, el.videoHeight, maxEdge)
  if (box.width <= 0 || box.height <= 0) return null
  const canvas = document.createElement("canvas")
  canvas.width = box.width
  canvas.height = box.height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  try {
    ctx.drawImage(el, 0, 0, box.width, box.height)
  } catch {
    // A tainted canvas, or a decoder that gave up mid-draw.
    return null
  }
  return canvas
}

/** A canvas as a JPEG blob. `toBlob` is async and can hand back null. */
function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality)
    } catch {
      // SecurityError from a tainted canvas. Cannot happen for an object URL,
      // and is caught anyway because the cost of being wrong is an unhandled
      // rejection in the middle of an upload.
      resolve(null)
    }
  })
}

/* ── The strip ────────────────────────────────────────────────────────────── */

/**
 * Build the strip, one cell at a time, calling back as each lands.
 *
 * ── Progressive, and cheap thumbnails ─────────────────────────────────────
 * Twenty-four seeks on a large file takes seconds, and doing them all before
 * showing anything means a picker that is blank for exactly as long as it is
 * most interesting. Each frame is handed over as it arrives, so the strip
 * fills left to right while the video is still uploading — which is the whole
 * argument for doing this on a wide screen.
 *
 * The strip's cells are drawn at 240 px, matching the phone. They are 80 px
 * wide on screen; a 1080 px cell is four times the decode for a picture
 * nobody inspects. The frame the HANDLE picks is taken at full quality
 * separately, by `grabCoverBlob`.
 *
 * ── One seek in flight, always ────────────────────────────────────────────
 * A `<video>` has one playhead. Firing twenty-four seeks concurrently gives
 * twenty-four `seeked` events in an order nobody controls and cells that do
 * not match their timestamps. Sequential is not a performance compromise
 * here; it is the only correct way to do it.
 */
export async function extractFilmstrip(
  video: LocalVideo,
  timestamps: number[],
  onFrame: (index: number, dataUrl: string) => void,
  signal?: AbortSignal
): Promise<void> {
  for (let i = 0; i < timestamps.length; i++) {
    if (signal?.aborted) return
    const ok = await seekTo(video.el, clampTimestamp(timestamps[i], video.durationMs))
    if (signal?.aborted) return
    if (!ok) continue
    const canvas = drawFrame(video.el, 240)
    if (!canvas) continue
    try {
      onFrame(i, canvas.toDataURL("image/jpeg", 0.7))
    } catch {
      // Tainted canvas. Stop rather than throwing twenty-four times.
      return
    }
  }
}

/**
 * The exact frame at a time, as an upload-ready JPEG.
 *
 * Full quality — 1080 px long edge, quality 85, the phone's numbers. Returns
 * null rather than throwing: a cover that could not be grabbed leaves the
 * auto-generated thumbnail in place, which is a worse cover but a working
 * video.
 */
export async function grabCoverBlob(video: LocalVideo, ms: number): Promise<Blob | null> {
  const ok = await seekTo(video.el, clampTimestamp(ms, video.durationMs))
  if (!ok) return null
  const canvas = drawFrame(video.el, COVER_MAX_EDGE)
  if (!canvas) return null
  return canvasToJpeg(canvas, COVER_JPEG_QUALITY)
}

/** The same frame as a data URL, for the preview above the strip. */
export async function grabPreviewDataUrl(video: LocalVideo, ms: number): Promise<string | null> {
  const ok = await seekTo(video.el, clampTimestamp(ms, video.durationMs))
  if (!ok) return null
  const canvas = drawFrame(video.el, 640)
  if (!canvas) return null
  try {
    return canvas.toDataURL("image/jpeg", 0.8)
  } catch {
    return null
  }
}

/* ── An uploaded cover ────────────────────────────────────────────────────── */

/**
 * Somebody's own image, centre-cropped to 16:9 and capped at 1080 px.
 *
 * ── Cropped, unlike an extracted frame, and that is deliberate ────────────
 * A frame carries the video's aspect by construction. A file off a disk can
 * be a square Instagram export, a portrait screenshot or a 5:4 scan, and a
 * channel grid of covers in six different shapes is what this prevents. The
 * phone does the same — `CoverPicker.kt` centre-crops an uploaded image to
 * the kind's aspect before encoding.
 *
 * Re-encoded to JPEG even when the input is already a JPEG, because the crop
 * and the cap have to be applied somewhere and doing it here means the size
 * the server receives is bounded no matter what was chosen.
 */
export async function imageToCoverBlob(file: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    // `decode()` rejects on a file that is not really an image, which is the
    // clean way to catch a .png that is actually a renamed .heic.
    try {
      await img.decode()
    } catch {
      return null
    }
    const sw = img.naturalWidth
    const sh = img.naturalHeight
    if (sw <= 0 || sh <= 0) return null

    const crop = centreCrop(sw, sh, COVER_ASPECT)
    const box = scaleToBox(crop.width, crop.height, COVER_MAX_EDGE)
    if (box.width <= 0 || box.height <= 0) return null

    const canvas = document.createElement("canvas")
    canvas.width = box.width
    canvas.height = box.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, box.width, box.height)
    return await canvasToJpeg(canvas, COVER_JPEG_QUALITY)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ── A promise for one DOM event ──────────────────────────────────────────── */

/**
 * Resolve on `ok`, reject on `bad`, reject on a timeout.
 *
 * The timeout is the important part. Every media event used here can simply
 * never fire — a decoder that gives up mid-seek emits nothing at all, not
 * even `error` — and a picker awaiting a promise that never settles is a
 * spinner for ever with no way out. Twenty seconds for a load, fifteen for a
 * seek: generous enough for a 2 GB file off a slow disk, finite either way.
 */
function once(
  target: HTMLVideoElement,
  ok: string,
  bad: string,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => {
      target.removeEventListener(ok, onOk)
      target.removeEventListener(bad, onBad)
      clearTimeout(timer)
      fn()
    }
    const onOk = () => done(resolve)
    const onBad = () => done(() => reject(new Error(`${target.tagName} ${bad}`)))
    const timer = setTimeout(() => done(() => reject(new Error("timeout"))), timeoutMs)
    target.addEventListener(ok, onOk, { once: true })
    target.addEventListener(bad, onBad, { once: true })
  })
}
