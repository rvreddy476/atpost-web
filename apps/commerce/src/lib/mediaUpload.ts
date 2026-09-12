// A product photograph, from the seller's disk to a media id commerce will
// accept.
//
// This is the same four-step path apps/tube's studio drives for a video
// (apps/tube/src/tube/uploadApi.ts, verified against the live gateway
// 2026-09-09), written out again here because zones do not import from each
// other and there is no shared upload package yet. Kept deliberately small:
// images take the simple signed-PUT path only, never the chunked one.
//
//   1. POST /v1/media/init          -> {media_id, upload_url}
//   2. PUT  <upload_url>            direct to storage, exactly ONE header
//   3. POST /v1/media/confirm       queues processing; idempotent
//   4. GET  /v1/media/{id}/status   until ready AND passed
//
// Step 4 is not optional for a product image. commerce-service's gallery
// write verifies every id through internal/media, which refuses anything
// whose processing_status is not `ready` or whose moderation_status is not
// `passed` (ErrMediaNotReady / ErrMediaNotPassed, 4xx). Posting the gallery
// the instant the bytes land therefore fails the whole batch; the editor
// waits here instead, one image at a time.
//
// `upload_purpose` is NOT sent. The only meaningful value is `composer`, a
// lease that makes a confirmed asset a candidate for media-service's
// reclamation sweep; a product photograph is referenced by a product row and
// must never be swept, and an omitted purpose is what keeps it out.

import api from '@atpost/api-client'

interface Envelope<T> {
  data?: T
  error?: { code?: string; message?: string }
}

export interface MediaInit {
  media_id: string
  upload_url: string
}

export async function initImage(file: { type: string; size: number }): Promise<MediaInit> {
  const res = await api.post<Envelope<MediaInit>>('/v1/media/init', {
    file_type: 'image',
    mime_type: file.type,
    file_size_bytes: file.size,
    media_subtype: 'general',
  })
  const body = res.data?.data
  if (!body?.media_id || !body?.upload_url) throw new Error('The server reserved no upload slot for this image.')
  return body
}

/**
 * The bytes, to storage, with progress.
 *
 * XMLHttpRequest and not the api-client, for the same reasons the tube studio
 * gives: storage is another origin whose preflight allows exactly
 * `content-type`; the api-client would add a CSRF header and cookies, which
 * turns a working upload into an opaque CORS failure and leaks the session to
 * a third-party host for no benefit. The signed URL is the whole of the
 * authorisation.
 */
export function putImage(
  uploadUrl: string,
  body: Blob,
  contentType: string,
  opts: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'))
      return
    }
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl, true)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      // 403 here is almost always the clock: the signed URL's fifteen minutes
      // ran out. Said in those words, because "403" reads as "not allowed" and
      // the seller is allowed, right now, to try again.
      else if (xhr.status === 403) reject(new Error('The upload link expired. Remove the image and add it again.'))
      else reject(new Error(`Storage refused the upload (${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error('The connection to storage failed. Check your network and try again.'))
    xhr.ontimeout = () => reject(new Error('The upload timed out.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    opts.signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

export async function confirmImage(mediaId: string): Promise<void> {
  await api.post('/v1/media/confirm', { media_id: mediaId })
}

export interface MediaStatus {
  processing_status?: string
  moderation_status?: string
}

export async function fetchImageStatus(mediaId: string): Promise<MediaStatus> {
  const res = await api.get<Envelope<MediaStatus>>(`/v1/media/${encodeURIComponent(mediaId)}/status`)
  return res.data?.data ?? {}
}

/**
 * What a status means for a gallery: keep waiting, done, or give up with a
 * sentence. Pure so the three outcomes are testable without a clock.
 */
export function readImageStatus(status: MediaStatus): { done: boolean; error: string | null } {
  const processing = status.processing_status ?? ''
  const moderation = status.moderation_status ?? ''
  if (processing === 'failed') return { done: true, error: 'The image could not be processed. Try a different file.' }
  if (processing === 'rejected' || moderation === 'rejected') {
    return { done: true, error: 'This image was not accepted. Choose another one.' }
  }
  if (moderation === 'manual_review') {
    return { done: true, error: 'This image is held for review and cannot be attached yet.' }
  }
  if (processing === 'ready' && moderation === 'passed') return { done: true, error: null }
  return { done: false, error: null }
}

/**
 * Poll until the image is usable. Images process in a few seconds; the
 * ceiling is generous because moderation sometimes is not, and a seller who
 * waited ninety seconds deserves a sentence rather than a spinner for ever.
 */
export async function waitForImage(
  mediaId: string,
  opts: { intervalMs?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<void> {
  const interval = opts.intervalMs ?? 1500
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000)
  for (;;) {
    if (opts.signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError')
    const verdict = readImageStatus(await fetchImageStatus(mediaId))
    if (verdict.done) {
      if (verdict.error) throw new Error(verdict.error)
      return
    }
    if (Date.now() > deadline) throw new Error('The image is taking too long to process. Try again in a moment.')
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
}

/**
 * The whole trip for one file. Reports progress as the upload fraction, then
 * `processing` while media-service works, and resolves with the media id the
 * gallery may now be told about.
 */
export async function uploadProductImage(
  file: File,
  opts: {
    onProgress?: (fraction: number) => void
    onProcessing?: () => void
    signal?: AbortSignal
  } = {},
): Promise<string> {
  const { media_id, upload_url } = await initImage(file)
  await putImage(upload_url, file, file.type, { onProgress: opts.onProgress, signal: opts.signal })
  await confirmImage(media_id)
  opts.onProcessing?.()
  await waitForImage(media_id, { signal: opts.signal })
  return media_id
}
