"use client"

/**
 * The cover: the filmstrip, the frame the handle is on, and the image that
 * ends up as `cover_media_id`.
 *
 * ── The strip is built from the LOCAL file, during the video upload ───────
 * Not after it, and not from anything the server produced. Two reasons, and
 * the first is the founder's:
 *
 *     "Generate the filmstrip from the local file before or during the video
 *      upload so it costs the user no extra wait."
 *
 * The second is that there is nothing on the server to build it from.
 * media-service exposes `GET /v1/media/{id}/suggested-frames`, which answers
 * three offsets at 10/50/90% with `thumbnail_url: ""` — no picture, and three
 * choices where the founder asked for a scrubber. And the frame extraction
 * that would back a real one does not exist: `POST /v1/videos/{id}/cover-
 * frame` takes a `timestamp_ms`, answers 200, and discards it. See
 * ./frames.ts.
 *
 * ── The cover is uploaded EAGERLY, the moment it is chosen ────────────────
 * Not at Publish. `cover_media_id` must point at an image that is already
 * `ready` — an id that is still processing is either refused or, worse,
 * accepted and left pointing at nothing. Uploading on choice means the wait
 * happens while somebody is still editing the title, and Publish is instant.
 * A 1080px JPEG at quality 85 is 100–300 KB and moderation on an image
 * returns `passed` in one poll (observed: `ready`/`passed` on the very first
 * status read), so this is genuinely free.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  confirmMedia,
  fetchMediaStatus,
  initMedia,
  putObject,
  uploadFailureMessage,
} from "@/tube/uploadApi"
import { filmstripTimestamps } from "./filmstrip"
import {
  extractFilmstrip,
  grabCoverBlob,
  grabPreviewDataUrl,
  imageToCoverBlob,
  openLocalVideo,
  type LocalVideo,
} from "./frames"
import { classifyMediaStatus } from "./poll"

/** Where the picture on screen came from. Drives the phone's caption. */
export type CoverSource = "auto" | "frame" | "upload"

export interface CoverStudio {
  /** True once the strip has something in it. False for a file the browser
   *  cannot decode — the picker hides itself rather than showing 24 blanks. */
  available: boolean
  /** Still seeking through the file. The phone's "Finding cover frames…". */
  extracting: boolean
  timestamps: number[]
  /** Data URLs, filling in left to right. `null` for a cell not yet drawn. */
  frames: (string | null)[]
  durationMs: number
  /** Where the handle is. */
  selectedMs: number
  /** The large preview above the strip. */
  previewUrl: string | null
  source: CoverSource
  /** True while the chosen image is going to the server. */
  uploading: boolean
  /** The id that goes into `cover_media_id`. Null means "use the auto one". */
  mediaId: string | null
  error: string | null

  /** Move the handle. Cheap — redraws the preview only. */
  scrubTo: (ms: number) => void
  /** "Use this frame" — grab it at full quality and upload it. */
  useCurrentFrame: () => void
  /** "Upload" — somebody's own image, cropped to 16:9 and uploaded. */
  useImageFile: (file: File) => void
  /** Back to whatever the transcode generated. */
  clearCover: () => void
}

/** How long to wait for an image asset to become attachable. */
const COVER_POLL_ATTEMPTS = 20
const COVER_POLL_MS = 800

export function useCoverStudio(file: File | null): CoverStudio {
  const [available, setAvailable] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [timestamps, setTimestamps] = useState<number[]>([])
  const [frames, setFrames] = useState<(string | null)[]>([])
  const [durationMs, setDurationMs] = useState(0)
  const [selectedMs, setSelectedMs] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [source, setSource] = useState<CoverSource>("auto")
  const [uploading, setUploading] = useState(false)
  const [mediaId, setMediaId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const video = useRef<LocalVideo | null>(null)
  const run = useRef(0)

  /* ── Open the file and fill the strip ──────────────────────────────────── */

  useEffect(() => {
    run.current += 1
    const token = run.current
    const controller = new AbortController()

    video.current?.close()
    video.current = null
    setAvailable(false)
    setExtracting(false)
    setTimestamps([])
    setFrames([])
    setDurationMs(0)
    setSelectedMs(0)
    setPreviewUrl(null)
    setSource("auto")
    setMediaId(null)
    setError(null)

    if (!file) return

    void (async () => {
      const opened = await openLocalVideo(file)
      if (token !== run.current) {
        opened?.close()
        return
      }
      if (!opened) {
        // The browser cannot decode this container. The SERVER still can, so
        // this is not an upload failure — it is a missing picker, and the
        // upload-your-own path below still works.
        setAvailable(false)
        return
      }

      video.current = opened
      const stamps = filmstripTimestamps(opened.durationMs)
      setDurationMs(opened.durationMs)
      setTimestamps(stamps)
      setFrames(new Array(stamps.length).fill(null))
      setAvailable(true)
      setExtracting(true)

      await extractFilmstrip(
        opened,
        stamps,
        (index, dataUrl) => {
          if (token !== run.current) return
          setFrames((prev) => {
            const next = prev.slice()
            next[index] = dataUrl
            return next
          })
          // The first cell doubles as the opening preview, so the picker is
          // never a grey box waiting for a gesture.
          if (index === 0) setPreviewUrl((prev) => prev ?? dataUrl)
        },
        controller.signal
      )

      if (token === run.current) setExtracting(false)
    })()

    return () => {
      controller.abort()
      run.current += 1
      video.current?.close()
      video.current = null
    }
  }, [file])

  /* ── The handle ────────────────────────────────────────────────────────── */

  const scrubRun = useRef(0)
  const scrubTo = useCallback((ms: number) => {
    setSelectedMs(ms)
    const opened = video.current
    if (!opened) return
    // One preview render in flight at a time. A drag fires this on every
    // pointermove and a `<video>` has one playhead: without the guard the
    // seeks queue up and the preview lands several hundred milliseconds
    // behind the finger, which reads as lag rather than as a queue.
    const token = ++scrubRun.current
    void grabPreviewDataUrl(opened, ms).then((url) => {
      if (token === scrubRun.current && url) setPreviewUrl(url)
    })
  }, [])

  /* ── Uploading whatever was chosen ─────────────────────────────────────── */

  const uploadCover = useCallback(async (blob: Blob, token: number): Promise<void> => {
    setUploading(true)
    setError(null)
    try {
      const slot = await initMedia({
        fileType: "image",
        mimeType: "image/jpeg",
        fileSizeBytes: blob.size,
      })
      await putObject(slot.upload_url, blob, "image/jpeg")
      await confirmMedia(slot.media_id)

      // An image id may only be attached at `ready` + `passed`, exactly as a
      // video may. Observed: an image is both on the first poll. The loop is
      // here for the one that is not, rather than for the common case.
      for (let i = 0; i < COVER_POLL_ATTEMPTS; i++) {
        if (token !== run.current) return
        const verdict = classifyMediaStatus(await fetchMediaStatus(slot.media_id))
        if (verdict.kind === "ready") {
          if (token === run.current) setMediaId(slot.media_id)
          return
        }
        if (verdict.kind === "rejected" || verdict.kind === "failed") {
          if (token === run.current) {
            setError("That cover was rejected. Pick another frame or upload a different image.")
          }
          return
        }
        await new Promise((r) => setTimeout(r, COVER_POLL_MS))
      }
      if (token === run.current) {
        setError("The cover is taking too long to process. Try again in a minute.")
      }
    } catch (e) {
      if (token === run.current) setError(uploadFailureMessage(e))
    } finally {
      if (token === run.current) setUploading(false)
    }
  }, [])

  const useCurrentFrame = useCallback(() => {
    const opened = video.current
    if (!opened) return
    const token = run.current
    setSource("frame")
    void (async () => {
      const blob = await grabCoverBlob(opened, selectedMs)
      if (token !== run.current) return
      if (!blob) {
        setError("That cover frame couldn't be prepared. Pick another.")
        setSource("auto")
        return
      }
      await uploadCover(blob, token)
    })()
  }, [selectedMs, uploadCover])

  const useImageFile = useCallback(
    (imageFile: File) => {
      const token = run.current
      setError(null)
      void (async () => {
        const blob = await imageToCoverBlob(imageFile)
        if (token !== run.current) return
        if (!blob) {
          setError("That image couldn't be read. Pick another.")
          return
        }
        setSource("upload")
        setPreviewUrl(URL.createObjectURL(blob))
        await uploadCover(blob, token)
      })()
    },
    [uploadCover]
  )

  const clearCover = useCallback(() => {
    setMediaId(null)
    setSource("auto")
    setError(null)
    // The preview stays on the strip's first frame rather than going blank:
    // "no custom cover" means the server's auto thumbnail, which is a frame
    // from near the start, so the first cell is the closest honest picture of
    // what will actually be shown.
    setPreviewUrl(frames[0] ?? null)
    setSelectedMs(0)
  }, [frames])

  return {
    available,
    extracting,
    timestamps,
    frames,
    durationMs,
    selectedMs,
    previewUrl,
    source,
    uploading,
    mediaId,
    error,
    scrubTo,
    useCurrentFrame,
    useImageFile,
    clearCover,
  }
}
