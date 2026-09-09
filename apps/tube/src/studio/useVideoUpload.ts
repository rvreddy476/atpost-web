"use client"

/**
 * The upload, running. The machine in ./machine.ts decides what state it is
 * in; this decides what request to make next.
 *
 * ── Everything happens in the background, from the moment a file is picked ─
 * That is the founder's brief and the only reason to build this on a wide
 * screen at all: the bytes move while the creator writes a title. So `start`
 * is called by the file picker, not by a Next button, and the details step
 * mounts with a transfer already in flight behind it.
 *
 * ── Two paths, one interface ──────────────────────────────────────────────
 * Under 500 MB: reserve a signed URL, PUT the whole file, confirm. Over it:
 * open a chunked session, POST 5 MiB parts, complete. The caller cannot tell
 * which happened except through `state.chunked`, which exists only so the
 * retry advice can be honest about what a retry will cost.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  completeResumable,
  confirmMedia,
  fetchMediaStatus,
  initMedia,
  initResumable,
  isPermanentFileError,
  MAX_VIDEO_BYTES,
  putChunk,
  putObject,
  RESUMABLE_THRESHOLD_BYTES,
  uploadFailureMessage,
} from "@/tube/uploadApi"
import {
  initialUploadState,
  uploadReducer,
  type UploadEvent,
  type UploadState,
} from "./machine"
import {
  classifyMediaStatus,
  mediaFacts,
  pollDelayMs,
  processingTimedOut,
  PROCESSING_TIMEOUT_MESSAGE,
  type MediaFacts,
} from "./poll"
import { SNIFF_BYTES, sniffRefusal } from "./sniff"

export interface VideoUpload {
  state: UploadState
  /** Resolution and duration, once the transcode has read the file. */
  facts: MediaFacts | null
  /** What the status line says while the transcode runs. */
  statusNote: string | null
  /** Begin. Safe to call over a transfer already in flight. */
  start: (file: File) => void
  /** Abort and forget. */
  cancel: () => void
  /** Start the same file over from `/v1/media/init`. */
  retry: () => void
  /** Tell the machine the post is being written. Publish calls this. */
  markPosting: () => void
  markPublished: (postId: string, scheduled: boolean) => void
  markFailed: (message: string, retryable: boolean) => void
}

/**
 * A local refusal, before a byte moves.
 *
 * The phone's sentence is "Videos are up to 500 MB. Pick a smaller file."
 * because the phone has no chunked path. The web does, so the ceiling is the
 * server's real one — 2 GB, which is what the resumable endpoint enforces —
 * and the sentence says that number instead of a smaller one this client does
 * not need.
 */
export function localFileRefusal(file: File): string | null {
  if (file.size <= 0) return "That file is empty. Pick another."
  if (file.size > MAX_VIDEO_BYTES) {
    return `Videos are up to ${Math.floor(MAX_VIDEO_BYTES / (1024 * 1024 * 1024))} GB. Pick a smaller file.`
  }
  // The type is checked loosely on purpose. Some browsers report an empty
  // type for a .mov off a network drive, and refusing a real video because
  // the OS did not name it is worse than letting the server refuse it — the
  // server's refusal is authoritative and this one is a guess.
  if (file.type && !file.type.startsWith("video/")) {
    return "That is not a video file. Pick an MP4, WebM or MOV."
  }
  return null
}

export function useVideoUpload(): VideoUpload {
  const [state, setState] = useState<UploadState>(initialUploadState)
  const [facts, setFacts] = useState<MediaFacts | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)

  // The reducer is driven through a ref-held mirror as well as React state.
  // The async pipeline below needs to READ the current phase between awaits,
  // and a closure over `state` would see whatever it was when the effect ran.
  const mirror = useRef<UploadState>(initialUploadState)
  const dispatch = useCallback((event: UploadEvent) => {
    mirror.current = uploadReducer(mirror.current, event)
    setState(mirror.current)
  }, [])

  const abort = useRef<AbortController | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileRef = useRef<File | null>(null)
  /** Bumped on every start/cancel so a stale async chain can tell it is stale. */
  const run = useRef(0)

  const stopEverything = useCallback(() => {
    run.current += 1
    abort.current?.abort()
    abort.current = null
    if (pollTimer.current) clearTimeout(pollTimer.current)
    pollTimer.current = null
  }, [])

  useEffect(() => stopEverything, [stopEverything])

  /* ── The poll loop ─────────────────────────────────────────────────────── */

  const poll = useCallback(
    (mediaId: string, token: number) => {
      const startedAt = Date.now()
      let attempt = 0

      const tick = async () => {
        if (token !== run.current) return
        try {
          const status = await fetchMediaStatus(mediaId)
          if (token !== run.current) return

          dispatch({ type: "status", status })
          setFacts((prev) => mediaFacts(status) ?? prev)

          const phase = mirror.current.phase
          if (phase === "ready" || phase === "failed") {
            setStatusNote(null)
            return
          }

          // The note is recomputed from the same classification the reducer
          // used, rather than being pushed through the machine. A sentence is
          // not state — it has no transitions and nothing branches on it —
          // and putting it in the reducer would mean a test asserting prose.
          const verdict = classifyMediaStatus(status)
          setStatusNote(verdict.kind === "waiting" ? verdict.message : null)

          if (processingTimedOut(Date.now() - startedAt)) {
            dispatch({ type: "failed", error: PROCESSING_TIMEOUT_MESSAGE, retryable: false })
            return
          }

          attempt += 1
          pollTimer.current = setTimeout(tick, pollDelayMs(attempt))
        } catch {
          // A failed poll is not a failed upload. The transcode is running on
          // the server whatever this browser's network is doing, so this
          // retries on the same backoff rather than declaring a failure that
          // has not happened. The deadline above is what eventually stops it.
          if (token !== run.current) return
          if (processingTimedOut(Date.now() - startedAt)) {
            dispatch({ type: "failed", error: PROCESSING_TIMEOUT_MESSAGE, retryable: false })
            return
          }
          attempt += 1
          pollTimer.current = setTimeout(tick, pollDelayMs(attempt))
        }
      }

      pollTimer.current = setTimeout(tick, pollDelayMs(0))
    },
    [dispatch]
  )

  /* ── The transfer ──────────────────────────────────────────────────────── */

  const transfer = useCallback(
    async (file: File, token: number) => {
      const controller = new AbortController()
      abort.current = controller

      try {
        // Sixteen bytes, read before anything is reserved.
        //
        // `POST /v1/media/confirm` sniffs the container and refuses a
        // mismatch — 500 INTERNAL_ERROR, "invalid video file: magic bytes do
        // not match declared MIME type", observed live. That refusal lands
        // AFTER the whole file has gone to storage, so on a 500 MB upload it
        // costs the entire transfer to be told the file was never a video.
        // See ./sniff.ts, which also explains why this check fails open.
        const head = new Uint8Array(await file.slice(0, SNIFF_BYTES).arrayBuffer())
        if (token !== run.current) return
        const wrongContainer = sniffRefusal(head, file.type || "")
        if (wrongContainer) {
          dispatch({ type: "failed", error: wrongContainer, retryable: false })
          return
        }

        if (file.size > RESUMABLE_THRESHOLD_BYTES) {
          /* The chunked path. */
          const session = await initResumable({
            fileName: file.name || "video.mp4",
            mimeType: file.type || "video/mp4",
            totalBytes: file.size,
          })
          if (token !== run.current) return
          dispatch({ type: "reserved", mediaId: session.media_id, chunked: true })

          const { chunk_size: chunkSize, total_parts: totalParts } = session
          for (let part = 1; part <= totalParts; part++) {
            if (token !== run.current) return
            const from = (part - 1) * chunkSize
            const slice = file.slice(from, Math.min(from + chunkSize, file.size))
            await putChunk(session.upload_id, part, slice, {
              signal: controller.signal,
              // Whole-file progress: everything already acknowledged, plus
              // this part's own bytes. The reducer's monotonic clamp is what
              // makes a re-sent part harmless here.
              onProgress: ({ loaded }) =>
                dispatch({ type: "progress", loaded: from + loaded, total: file.size }),
            })
            dispatch({ type: "progress", loaded: from + slice.size, total: file.size })
          }

          if (token !== run.current) return
          // `complete` runs the confirm/processing flow itself — verified.
          // Calling confirmMedia after it would be a second, pointless enqueue.
          await completeResumable(session.upload_id)
          if (token !== run.current) return
          dispatch({ type: "bytes_in" })
          poll(session.media_id, token)
          return
        }

        /* The simple path. */
        const slot = await initMedia({
          fileType: "video",
          mimeType: file.type || "video/mp4",
          fileSizeBytes: file.size,
        })
        if (token !== run.current) return
        dispatch({ type: "reserved", mediaId: slot.media_id, chunked: false })

        await putObject(slot.upload_url, file, file.type || "video/mp4", {
          signal: controller.signal,
          onProgress: ({ loaded, total }) => dispatch({ type: "progress", loaded, total }),
        })
        if (token !== run.current) return

        // THIS is what queues the transcode. An upload that lands and is never
        // confirmed sits as `pending_upload` for ever and the poll never moves.
        await confirmMedia(slot.media_id)
        if (token !== run.current) return

        dispatch({ type: "bytes_in" })
        poll(slot.media_id, token)
      } catch (error) {
        if (token !== run.current) return
        if ((error as Error)?.name === "AbortError") return
        dispatch({
          type: "failed",
          error: uploadFailureMessage(error),
          // Almost everything that goes wrong on this path is worth one more
          // go — an expired signed URL, a dropped connection, a gateway
          // blip. The exception is a verdict on the FILE, which the server
          // reports as a 500 and which a retry would only re-earn. See
          // `isPermanentFileError`.
          retryable: !isPermanentFileError(error),
        })
      }
    },
    [dispatch, poll]
  )

  /* ── The handles the studio holds ──────────────────────────────────────── */

  const start = useCallback(
    (file: File) => {
      stopEverything()
      const token = run.current
      fileRef.current = file
      setFacts(null)
      setStatusNote(null)
      dispatch({ type: "start" })
      void transfer(file, token)
    },
    [dispatch, stopEverything, transfer]
  )

  const cancel = useCallback(() => {
    stopEverything()
    fileRef.current = null
    setFacts(null)
    setStatusNote(null)
    dispatch({ type: "reset" })
  }, [dispatch, stopEverything])

  const retry = useCallback(() => {
    const file = fileRef.current
    if (file) start(file)
  }, [start])

  const markPosting = useCallback(() => dispatch({ type: "posting" }), [dispatch])
  const markPublished = useCallback(
    (postId: string, scheduled: boolean) =>
      dispatch({ type: "published", postId, scheduled }),
    [dispatch]
  )
  const markFailed = useCallback(
    (message: string, retryable: boolean) =>
      dispatch({ type: "failed", error: message, retryable }),
    [dispatch]
  )

  return { state, facts, statusNote, start, cancel, retry, markPosting, markPublished, markFailed }
}
