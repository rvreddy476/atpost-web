/**
 * Everything the upload studio puts on the wire. Nothing else in this zone
 * writes.
 *
 * ./api.ts is the feed and the action bar; ./channelApi.ts is the shell and
 * the channel pages. Both are READ surfaces. This is the only file in
 * apps/tube that creates anything, and it is separate for the reason those two
 * are separate from each other: a file whose name is a lie about half its
 * contents is worse than three short ones.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance with a cookie/CSRF request
 * interceptor and a 401-refresh response interceptor. Every gateway response
 * is `{data, error, meta}`, so a caller reads `res.data.data`. The ONE call
 * here that does not go through it is the PUT to object storage, which is not
 * the gateway at all — see `putObject`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE UPLOAD CONTRACT, DRIVEN END TO END AGAINST THE LIVE GATEWAY 2026-09-09
 *
 * Every line below was executed, not read off a doc. The post it produced is
 * 9c66e123-be7e-473c-b288-e20a98a823b9, published, on channel @tubetest001.
 *
 *   1. POST /v1/media/init          auth  -> {media_id, upload_url,
 *                                             object_key, expires_at}
 *   2. PUT  <upload_url>            NO auth, direct to storage, 200 + ETag
 *   3. POST /v1/media/confirm       auth  -> the media row; QUEUES THE
 *                                             TRANSCODE. Idempotent.
 *   4. GET  /v1/media/{id}/status   public-> {processing_status,
 *                                             moderation_status, width,
 *                                             height, duration_seconds,
 *                                             duration_ms, transcoding_jobs[]}
 *   5. POST /v1/posts               auth  -> 201, the bare post.
 *                                            Idempotency-Key REQUIRED, UUID.
 *   6. POST /v1/videos/{postId}/publish   -> {"status":"published"}
 *
 * Step 6 takes THE POST ID. Not the media id. It is the single most common
 * mistake on this path and it does not fail loudly — `/v1/videos/{mediaId}`
 * is simply a row that is not there.
 *
 * ── Things the wire said that the brief did not ───────────────────────────
 *
 *   · `cover_media_id` IS ACCEPTED AT CREATE. Verified: post
 *     253ec1a7-63fc-4f9f-9b29-75a24efc5305 was created with one and reads it
 *     back. That removes a whole round trip and, more importantly, removes a
 *     window in which a published video has the auto-generated thumb_150 on
 *     it. `POST /v1/videos/{id}/cover-frame` is kept below as the repair path
 *     for a cover that was still uploading when the post was made.
 *
 *   · The transcode never passes through `uploaded` in practice. Observed
 *     sequence over six runs: `processing` (×4, ~8s) then `ready`/`passed` in
 *     the same poll. `pending_upload` and `uploaded` exist and are handled;
 *     they were simply never seen.
 *
 *   · `POST /v1/posts` is rate limited: 429 RATE_LIMITED, "max 20 posts per
 *     hour", and the limiter runs BEFORE field validation. Anything the
 *     studio can check itself, it checks itself — a 429 spent on a title that
 *     was always too long is a whole hour of someone's day.
 *
 *   · `POST /v1/auth/login` is rate limited too, separately and harder.
 *     Nothing here logs in; this is recorded because it is what makes
 *     re-verifying this file expensive.
 *
 *   · Publishing REWRITES `visibility` to `public`. Post
 *     9c66e123 was created `unlisted` and reads back `public` after step 6.
 *     So "unlisted" and "publish now" are contradictory instructions and the
 *     studio does not offer both at once — see ../studio/fields.ts.
 *
 * ── The `&` note, and why it is not a problem HERE ───────────────────
 * media-service is Go, and Go's encoding/json escapes `&` as `&` in the
 * signed URL it returns. That cost a previous agent real time. It costs this
 * client nothing and it is important to know why rather than to defend
 * against it twice: `&` is a JSON *string escape*, so `JSON.parse` — and
 * therefore axios — has already turned it back into `&` before any code here
 * sees the value. Verified on the live response: `url.includes("\\u0026")` is
 * false. What DOES break is any path that treats the raw response text as a
 * URL, which is why nothing here ever does.
 *
 * ── CORS on the storage host is real and was checked ──────────────────────
 * The PUT is cross-origin: the gateway is same-origin through the zone proxy,
 * object storage is `https://media-dev.cleestudio.com`. A preflight from
 * `http://localhost:3012` answers 204 with
 * `Access-Control-Allow-Origin: http://localhost:3012` and
 * `Access-Control-Allow-Methods: PUT`, `Access-Control-Allow-Headers:
 * content-type`. So exactly one request header may be set on that PUT, and
 * setting a second — an Authorization, an x-request-id — turns a working
 * upload into a preflight failure with nothing in the network tab except
 * "CORS error".
 */

import api from "@atpost/api-client"

/* ── The envelope ─────────────────────────────────────────────────────────── */

interface Envelope<T> {
  data?: T
  meta?: unknown
  error?: { code?: string; message?: string }
}

/**
 * The gateway's own vocabulary for a failure, pulled out of axios.
 *
 * axios keeps the HTTP status and the envelope's code in different places and
 * a caller that reads only one of them cannot tell `403 CHANNEL_REQUIRED`
 * (fixable by the person) from `403 CSRF_FAILED` (not). Every message
 * function in this zone goes through here first.
 */
export interface Failure {
  status: number | null
  code: string | null
  message: string | null
}

export function failureOf(error: unknown): Failure {
  const res = (error as { response?: { status?: number; data?: Envelope<unknown> } }).response
  return {
    status: res?.status ?? null,
    code: res?.data?.error?.code ?? null,
    message: res?.data?.error?.message ?? null,
  }
}

/* ── Step 1: reserve a media id and a signed URL ──────────────────────────── */

export interface MediaInitResponse {
  media_id: string
  upload_url: string
  object_key: string
  /** RFC3339. The signed URL is good for 15 minutes and not a second more. */
  expires_at: string
}

/**
 * The mime types this studio will hand to `/v1/media/init` for a video.
 *
 * The list is the RESUMABLE endpoint's, which accepts exactly
 * `video/mp4|webm|quicktime` and rejects everything else. The simple path is
 * more permissive, and the studio deliberately does not exploit that: a file
 * that can be uploaded at 400 MB and refused at 600 MB purely because it
 * crossed a size threshold is the worst kind of inconsistency, because it
 * only shows up for the people with the biggest files and the longest waits.
 */
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const

/** What the `<input type="file">` advertises. Includes `.mov`, which some
 *  browsers report as an empty type until the file is read. */
export const VIDEO_ACCEPT_ATTR = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"

/** Images a creator may upload as their own cover. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const IMAGE_ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"

/**
 * Above this, the simple signed-PUT path is the wrong tool and the studio
 * switches to the chunked one.
 *
 * 500 MB is the brief's number and it is a good one for a reason worth
 * writing down: the signed URL lives 15 minutes, and 500 MB in 15 minutes is
 * ~4.4 Mbit/s of sustained upstream. Plenty of domestic connections are
 * slower than that, so above this size a single PUT is not merely
 * inconvenient — it is a coin flip that lands on `expired` after the person
 * has waited ten minutes.
 */
export const RESUMABLE_THRESHOLD_BYTES = 500 * 1024 * 1024

/** The resumable endpoint's own ceiling. Verified in its rejection message. */
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024

export interface MediaInitSpec {
  fileType: "video" | "image"
  mimeType: string
  fileSizeBytes: number
}

export async function initMedia(spec: MediaInitSpec): Promise<MediaInitResponse> {
  const res = await api.post<Envelope<MediaInitResponse>>("/v1/media/init", {
    file_type: spec.fileType,
    mime_type: spec.mimeType,
    file_size_bytes: spec.fileSizeBytes,
    media_subtype: "general",
    upload_purpose: "composer",
  })
  const body = res.data?.data
  if (!body?.media_id || !body?.upload_url) {
    throw new Error("The server reserved no upload slot for this file.")
  }
  return body
}

/* ── Step 2: the bytes, straight to storage ───────────────────────────────── */

export interface PutProgress {
  loaded: number
  total: number
}

/**
 * PUT the bytes to the signed URL.
 *
 * ── XMLHttpRequest, and not fetch, on purpose ─────────────────────────────
 * This is the one request in the whole web client that is allowed to take
 * minutes, and it is the one thing on screen a person is watching. `fetch`
 * has no upload progress at all — `ReadableStream` request bodies are Chrome
 * only, require HTTP/2, and force `duplex: "half"`, which is a lot of
 * fragility to buy a progress bar that XHR has had for fifteen years. So:
 * XHR, and the studio gets a real percentage rather than a spinner that lies.
 *
 * ── No api-client, and no headers beyond one ──────────────────────────────
 * `@atpost/api-client` would attach `X-Requested-With` and `X-CSRF-Token` to
 * a PUT and send cookies with it. Every one of those is wrong here:
 *
 *   · this is NOT the gateway, it is object storage on another origin;
 *   · the preflight allows exactly `content-type` and nothing else, so a
 *     second header fails the preflight — and a failed preflight surfaces in
 *     the browser as an opaque network error with no status to report;
 *   · `withCredentials` would send our session cookies to a third-party host,
 *     which is a credential leak for no benefit — the URL is already signed
 *     and is the whole of the authorisation.
 *
 * The signature covers the HOST only (`X-Amz-SignedHeaders=host`, verified),
 * so Content-Type is not signed. It is still sent, and still matched to what
 * `/v1/media/init` was told, because media-service reads it when it decides
 * what to transcode.
 */
export function putObject(
  uploadUrl: string,
  body: Blob,
  contentType: string,
  opts: { onProgress?: (p: PutProgress) => void; signal?: AbortSignal } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new DOMException("Upload cancelled", "AbortError"))
      return
    }

    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl, true)
    xhr.setRequestHeader("Content-Type", contentType)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.({ loaded: e.loaded, total: e.total })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      // 403 here is almost always the clock: the signed URL's 15 minutes ran
      // out mid-upload. The studio says so in those words rather than showing
      // "403", because "403" reads as "you are not allowed to upload" and the
      // person IS allowed to upload — they are allowed to upload again, right
      // now, and the whole point is to tell them that.
      reject(new UploadTransportError(xhr.status, xhr.responseText || ""))
    }

    // A cross-origin failure — a failed preflight, a dropped connection, the
    // laptop lid closing — arrives here with status 0 and no body. There is
    // genuinely nothing to report but "the connection to storage failed",
    // and pretending otherwise would be an invented diagnosis.
    xhr.onerror = () => reject(new UploadTransportError(xhr.status || 0, ""))
    xhr.ontimeout = () => reject(new UploadTransportError(0, "timeout"))
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"))

    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(body)
  })
}

/** A failure of the PUT itself, carrying the storage host's own status. */
export class UploadTransportError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`Storage refused the upload (${status || "no response"}).`)
    this.name = "UploadTransportError"
    this.status = status
    this.body = body
  }
}

/* ── Step 3: confirm, which is what starts the transcode ──────────────────── */

/**
 * Tell the gateway the bytes are there.
 *
 * This is NOT bookkeeping — it is what enqueues the transcode. An upload that
 * completes and is never confirmed sits in storage as `pending_upload` for
 * ever and the poll below never moves. Idempotent, verified, so the retry
 * path may call it again without checking.
 */
export async function confirmMedia(mediaId: string): Promise<void> {
  await api.post<Envelope<unknown>>("/v1/media/confirm", { media_id: mediaId })
}

/* ── Step 4: the transcode, watched ───────────────────────────────────────── */

export type ProcessingStatus =
  | "pending_upload"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "rejected"

export type ModerationStatus = "pending" | "passed" | "rejected" | "manual_review"

export interface MediaStatus {
  processing_status?: ProcessingStatus | string
  moderation_status?: ModerationStatus | string
  width?: number
  height?: number
  duration_seconds?: number
  duration_ms?: number
  transcoding_jobs?: { profile?: string; status?: string }[]
}

/**
 * Where the transcode has got to.
 *
 * Public — it answers 200 with no session, verified. It is still fetched
 * through the api-client so it travels the zone proxy like everything else;
 * there is no benefit to a second transport and a real cost to having two.
 */
export async function fetchMediaStatus(mediaId: string): Promise<MediaStatus> {
  const res = await api.get<Envelope<MediaStatus>>(
    `/v1/media/${encodeURIComponent(mediaId)}/status`
  )
  return res.data?.data ?? {}
}

/* ── The chunked path, for files a signed URL cannot outlive ──────────────── */

export interface ResumableInit {
  upload_id: string
  media_id: string
  /** 5 MiB on this stack. Read from the response, never assumed. */
  chunk_size: number
  total_parts: number
  expires_at: string
}

/**
 * Open a chunked upload.
 *
 * ── `total_bytes`, and NOT `file_size_bytes` ──────────────────────────────
 * The simple path takes `file_size_bytes`; this one takes `total_bytes` and
 * answers 400 `BAD_REQUEST` — "Field validation for 'TotalBytes' failed on
 * the 'required' tag" — for the other spelling. Two endpoints in one service
 * disagreeing about the name of the same number is a server-side wart and it
 * is recorded here rather than smoothed over, because the next person to read
 * this file will otherwise copy the wrong one from six lines up.
 *
 * `file_name` is also required and is what the row is labelled with.
 */
export async function initResumable(spec: {
  fileName: string
  mimeType: string
  totalBytes: number
}): Promise<ResumableInit> {
  const res = await api.post<Envelope<ResumableInit>>("/v1/media/upload/resumable/init", {
    file_name: spec.fileName,
    mime_type: spec.mimeType,
    total_bytes: spec.totalBytes,
    file_type: "video",
    media_subtype: "general",
    upload_purpose: "composer",
  })
  const body = res.data?.data
  if (!body?.upload_id || !body?.media_id || !body?.chunk_size) {
    throw new Error("The server opened no chunked upload for this file.")
  }
  return body
}

export interface ChunkAck {
  part_number: number
  uploaded_bytes: number
  total_bytes: number
  all_parts_in: boolean
}

/**
 * One part.
 *
 * ── RAW BYTES, not multipart ──────────────────────────────────────────────
 * The body is the slice itself. A `FormData` here uploads the multipart
 * envelope — boundary, headers, the lot — as if it were video, and the
 * transcode then fails on a file that is a few hundred bytes longer than it
 * should be, which is a maddening thing to debug at 500 MB.
 *
 * This one DOES go through the api-client: it is the gateway, it needs the
 * session cookie and the CSRF header, and it is same-origin through the zone
 * proxy. `onUploadProgress` is axios's own XHR progress, so the per-part
 * percentage is real; the caller composes the parts into a whole-file figure.
 */
export async function putChunk(
  uploadId: string,
  partNumber: number,
  chunk: Blob,
  opts: { onProgress?: (p: PutProgress) => void; signal?: AbortSignal } = {}
): Promise<ChunkAck> {
  const res = await api.post<Envelope<ChunkAck>>(
    `/v1/media/upload/resumable/${encodeURIComponent(uploadId)}/chunk`,
    chunk,
    {
      params: { part_number: partNumber },
      headers: { "Content-Type": "application/octet-stream" },
      signal: opts.signal,
      onUploadProgress: (e) => {
        opts.onProgress?.({ loaded: e.loaded ?? 0, total: e.total ?? chunk.size })
      },
    }
  )
  const body = res.data?.data
  if (!body) throw new Error(`The server did not acknowledge part ${partNumber}.`)
  return body
}

/**
 * Close a chunked upload.
 *
 * Returns the assembled media row, already `processing` — so unlike the
 * simple path there is NO `confirm` step after this. Verified: media
 * 676c45ac-c953-4168-b101-345bf9a8a90c went `processing` → `ready`/`passed`
 * straight off this call. Calling `confirmMedia` here as well would be a
 * second, pointless enqueue.
 */
export async function completeResumable(uploadId: string): Promise<{ media_id: string }> {
  const res = await api.post<Envelope<{ id?: string; media_id?: string }>>(
    `/v1/media/upload/resumable/${encodeURIComponent(uploadId)}/complete`,
    {}
  )
  const body = res.data?.data
  const id = body?.media_id ?? body?.id
  if (!id) throw new Error("The server did not return the assembled media id.")
  return { media_id: id }
}

/* ── Step 5: the post ─────────────────────────────────────────────────────── */

/**
 * The create body, exactly as post-service names its columns.
 *
 * ── Every field here is settable ONLY at create ───────────────────────────
 * There is no generic post-update endpoint on this gateway. `PATCH
 * /v1/videos/{id}/category` exists and moves one column; nothing moves the
 * rest. So a creator who ticks the wrong compliance box has to delete and
 * re-upload, which is why ../studio/StepSettings.tsx states the consequence
 * on screen instead of leaving it to be discovered.
 *
 * ── Names that are one letter from a silent no-op ─────────────────────────
 *   · `paid_promotion`, NOT `is_paid_promotion`. The latter is not a column;
 *     the server binds what it knows and drops the rest, so the wrong
 *     spelling returns 201 and the disclosure is simply not there.
 *   · `is_made_for_kids`, WITH the `is_`. The opposite convention from the
 *     line above it, in the same struct.
 *   · `altered_content` and `license` have no prefix at all.
 *
 * ── Four columns are deliberately absent, and one concept ─────────────────
 * `access`, `required_tier_id`, `premiere_at` and `is_branded` are real
 * columns that accept no value from a client — building UI for them would be
 * building a control that does nothing. And AGE RESTRICTION does not exist
 * anywhere in this codebase: it is not modelled, not stored and not enforced,
 * so the studio does not offer it. A checkbox that claims to age-restrict a
 * video and does not is worse than no checkbox, because a creator will rely
 * on it.
 */
export interface CreateLongVideoRequest {
  content_type: "long_video"
  /** REQUIRED. `oneof` — public | followers | private | unlisted. Verified:
   *  anything else is 400 INVALID_REQUEST, and omitting it is 400 too. */
  visibility: "public" | "followers" | "private" | "unlisted"
  /** REQUIRED. 100 CODE POINTS, not bytes — 400 TITLE_TOO_LONG names the
   *  limit and counts in runes, so an emoji costs one. */
  title: string
  media_ids: string[]

  seo_title?: string
  text?: string
  /** FREE TEXT for long video. `GET /v1/posts/categories` returns the FLICK
   *  taxonomy (comedy/music/dance/…), which is a different thing and is not
   *  what this column validates against — "Technology" and "Education" were
   *  both stored verbatim. See ../studio/fields.ts for what is offered. */
  category?: string
  language?: string
  /** Max 20, each max 50 characters. */
  tags?: string[]

  is_made_for_kids?: boolean
  paid_promotion?: boolean
  altered_content?: boolean
  /** Free text, server default "standard". */
  license?: string

  allow_embedding?: boolean
  publish_to_feed?: boolean
  remix_setting?: string
  comment_moderation?: string
  comment_access?: string
  no_comments?: boolean
  no_likes?: boolean
  hide_share?: boolean
  allow_download?: boolean

  /** `YYYY-MM-DD` is accepted and stored as midnight UTC. Verified. */
  recording_date?: string
  recording_location?: string

  /** An image media id that is already `ready`. Accepted at create — verified. */
  cover_media_id?: string

  /** RFC3339, between now+5min and now+30days. Sets `is_scheduled: true`. */
  publish_at?: string
}

/** The bare post the create returns. Narrowed to what the studio uses. */
export interface CreatedPost {
  id: string
  title?: string
  visibility?: string
  is_scheduled?: boolean
  publish_at?: string
  cover_media_id?: string | null
}

/**
 * Create the post.
 *
 * ── The Idempotency-Key header is REQUIRED and must be a UUID ─────────────
 * Both halves verified, both 400s:
 *   · absent → `MISSING_IDEMPOTENCY_KEY`, "Idempotency-Key header is required"
 *   · "not-a-uuid" → `INVALID_IDEMPOTENCY_KEY`, "Idempotency-Key must be a UUID"
 *
 * The key is passed IN rather than minted here, and that is the whole point
 * of it. The studio holds one key per attempt for the life of that attempt,
 * so a Publish that timed out and is retried lands on the same key and cannot
 * produce two videos. Minting inside this function would make every retry a
 * fresh key and the header would be pure ceremony — which is exactly the
 * failure ../feed/api.ts's `createComment` note warns about from the other
 * direction.
 *
 * ── This header must survive the zone proxy ───────────────────────────────
 * `packages/api-client/src/proxy.ts` forwards an ALLOWLIST of headers, and
 * `idempotency-key` had to be added to it — otherwise the browser sends the
 * header, the proxy drops it, and the gateway answers
 * MISSING_IDEMPOTENCY_KEY for a request that plainly had one. If this call
 * starts failing that way, that list is the first place to look.
 */
export async function createLongVideoPost(
  body: CreateLongVideoRequest,
  idempotencyKey: string
): Promise<CreatedPost> {
  const res = await api.post<Envelope<CreatedPost>>("/v1/posts", body, {
    headers: { "Idempotency-Key": idempotencyKey },
  })
  const post = res.data?.data
  if (!post?.id) throw new Error("The server created the video but did not return its id.")
  return post
}

/* ── Step 6: publish ──────────────────────────────────────────────────────── */

/**
 * Make it live.
 *
 * `:videoId` IS THE POST ID. The media id 404s silently-ish, and the video
 * stays a draft nobody can find. Written twice in this file on purpose.
 *
 * Note that this REWRITES visibility to public — verified. ../studio/fields.ts
 * refuses to offer "publish now" alongside a non-public visibility so that the
 * studio never quietly overrides a choice somebody just made.
 */
export async function publishVideo(postId: string): Promise<void> {
  await api.post<Envelope<{ status?: string }>>(
    `/v1/videos/${encodeURIComponent(postId)}/publish`,
    {}
  )
}

/* ── The cover, after the fact ────────────────────────────────────────────── */

/**
 * Point an existing video at a cover image.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `timestamp_ms` IS ACCEPTED, RETURNS 200, AND DOES NOTHING.
 *
 * Verified live: `POST /v1/videos/{id}/cover-frame {"timestamp_ms":2500}`
 * answers `{"data":{"status":"updated"}}` and the row is byte-identical
 * afterwards. The handler binds the field and never passes it on, and there
 * is no frame-extraction code anywhere in the service. It is not a slow path
 * or a queued job — nothing happens, ever.
 *
 * So this function DOES NOT TAKE A TIMESTAMP. Accepting one and forwarding it
 * would build a control whose entire behaviour is a lie the server tells
 * politely. The frame is extracted in the browser instead — ../studio/
 * frames.ts — uploaded as an ordinary image, and its media id is what lands
 * here (or, better, at create).
 *
 * `cover_media_id` genuinely works: post 9c66e123 reads back
 * `cover_media_id: "75e367a7-36c3-45b6-be58-747b861a133a"` after this call.
 * Note that the `/v1/videos/{id}` row's `thumbnail_url` still shows the
 * auto-generated `thumb_150` — the cover lives on the POST row, not the video
 * row, and looking at the wrong one is how you conclude this endpoint is
 * broken when it is not.
 */
export async function setCoverFrame(postId: string, coverMediaId: string): Promise<void> {
  await api.post<Envelope<{ status?: string }>>(
    `/v1/videos/${encodeURIComponent(postId)}/cover-frame`,
    { cover_media_id: coverMediaId }
  )
}

/* ── The channel gate ─────────────────────────────────────────────────────── */

/**
 * A channel, as `POST /v1/channels` takes it.
 *
 * `about`, NOT `description`. The server binds `about`; a body carrying
 * `description` is accepted and the text is silently dropped, so somebody
 * writes their channel's whole reason for existing and it lands nowhere.
 */
export interface CreateChannelRequest {
  name: string
  handle: string
  about?: string
  avatar_media_id?: string
}

/*
 * The server's limits — name 3–40, handle 3–30 matching
 * `^[a-z0-9][a-z0-9_.]*[a-z0-9]$`, about 200 max — live in
 * ../studio/channelForm.ts, with the rules that turn them into sentences and
 * with the test that pins them. They are stated ONCE, and there rather than
 * here, because a constant in this file and a validator in that one is
 * exactly how a form ends up refusing a handle the server would take.
 */

export interface HandleAvailability {
  available: boolean
  /** A legal handle near the one asked for. The server offers this itself. */
  suggestion?: string
}

/**
 * Is this handle free?
 *
 * ── It needs a session, which is not obvious from the name ────────────────
 * 401 UNAUTHORIZED "Invalid user ID" with no cookie — verified. It is not a
 * public availability check, and a signed-out caller gets a 401 rather than
 * an answer.
 *
 * ── `available: true` for your OWN handle ─────────────────────────────────
 * `?handle=tubetest001` answers `available: true` for the account that owns
 * @tubetest001. That is coherent — it is available *to you* — but it means
 * this endpoint cannot be used to ask "does this channel exist". It answers
 * "may I have this", which is the only question the create form asks.
 *
 * ── A refusal is not always "taken" ───────────────────────────────────────
 * `definitely-free-9931` answers `available: false, suggestion:
 * "definitely.free.9931"` — not because anybody holds it but because a hyphen
 * is not a legal character. So the form validates the SHAPE locally first and
 * only calls this for a handle that is already legal; otherwise "that handle
 * is taken" is said about a handle nobody has ever had.
 */
export async function checkHandleAvailable(
  handle: string,
  name: string
): Promise<HandleAvailability> {
  const res = await api.get<Envelope<HandleAvailability>>("/v1/channels/handle-available", {
    params: { handle, name },
  })
  const body = res.data?.data
  return { available: Boolean(body?.available), suggestion: body?.suggestion }
}

export interface CreatedChannel {
  user_id: string
  name: string
  handle: string
  about?: string | null
}

/** 409 CHANNEL_EXISTS if this account already has one, 409 HANDLE_TAKEN if
 *  somebody else holds the handle. Both are 409 and they mean opposite things
 *  to the person reading the screen — see `channelFailureMessage`. */
export async function createChannel(body: CreateChannelRequest): Promise<CreatedChannel> {
  const res = await api.post<Envelope<CreatedChannel>>("/v1/channels", body)
  const row = res.data?.data
  if (!row?.user_id) throw new Error("The server created the channel but did not return it.")
  return row
}

/* ── Saying what went wrong, in words ─────────────────────────────────────── */

/**
 * Why an upload or a publish failed, in a sentence a creator can act on.
 *
 * A table rather than a chain of ifs, because the point of it is to be read
 * against the gateway's own error list. Anything not in it falls through to
 * a sentence that says what is known and does not invent what is not.
 */
const UPLOAD_MESSAGES: Record<string, string> = {
  CHANNEL_REQUIRED: "A long video is published by a channel, and this account does not have one yet.",
  MISSING_IDEMPOTENCY_KEY:
    "The publish request lost its idempotency key on the way to the server. Reload the studio and try again.",
  INVALID_IDEMPOTENCY_KEY:
    "The publish request lost its idempotency key on the way to the server. Reload the studio and try again.",
  IDEMPOTENCY_KEY_REUSED:
    "This video was already submitted. Check your channel before publishing it a second time.",
  TITLE_TOO_LONG: "The title is longer than 100 characters.",
  INVALID_REQUEST: "The server refused one of the details on this video.",
  RATE_LIMITED: "You have published the maximum of 20 posts in the last hour. Try again later.",
  CSRF_FAILED: "This browser's session went stale. Reload the page and try again.",
  MEDIA_NOT_READY: "The video is still being processed. Wait for it to finish, then publish.",
  UNSUPPORTED_MEDIA_TYPE: "The server will not accept this file type.",
  FILE_TOO_LARGE: "The file is larger than the 2 GB ceiling.",
}

/**
 * Is this a failure that the SAME FILE will always produce?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CONTAINER SNIFF AT CONFIRM IS A 500, AND IT IS PERMANENT.
 *
 * Observed live, in a browser: `POST /v1/media/confirm` for a file whose
 * bytes are not the container its MIME type claims answers
 *
 *     500 INTERNAL_ERROR
 *     "invalid video file: magic bytes do not match declared MIME type"
 *
 * A 500 with the code INTERNAL_ERROR is, to every sane classifier, "the
 * server fell over — try again". It is not. It is a permanent verdict on this
 * file, and offering a Try again for it would send somebody round a
 * multi-minute upload to be told exactly the same thing.
 *
 * So the message text is matched, which is fragile and is the honest cost of
 * a server that reports a validation failure as an internal one. The local
 * sniff in ../studio/sniff.ts catches almost every case before a byte moves;
 * this is the backstop for a container that sniff does not recognise.
 */
export function isPermanentFileError(error: unknown): boolean {
  const { code, message } = failureOf(error)
  if (!message) return false
  if (/magic bytes do not match/i.test(message)) return true
  if (/invalid video file/i.test(message)) return true
  if (code === "UNSUPPORTED_MEDIA_TYPE" || code === "MEDIA_TYPE_MISMATCH") return true
  return false
}

export function uploadFailureMessage(error: unknown): string {
  if (isPermanentFileError(error)) {
    return "The server could not read this file as a video. Re-export it as an MP4 (H.264) and try again."
  }

  if (error instanceof UploadTransportError) {
    // 403 on the signed PUT is the 15-minute clock far more often than it is
    // anything else, and the recovery is the same either way: start the
    // transfer again, which mints a fresh URL.
    if (error.status === 403 || error.status === 401) {
      return "The upload link expired before the file finished. Start the transfer again."
    }
    if (error.status === 0) {
      return "The connection to storage dropped. Check your network and start the transfer again."
    }
    return `Storage refused the upload (HTTP ${error.status}).`
  }

  const { status, code, message } = failureOf(error)
  if (code && UPLOAD_MESSAGES[code]) return UPLOAD_MESSAGES[code]
  if (status === 401) return "Your session ended. Sign in again to publish."
  if (status === 413) return "The file is larger than the server will accept."
  if (status === 0 || status === null) return "The server could not be reached."
  return message || `The server refused the request (HTTP ${status}).`
}

/** Why a channel could not be created. The two 409s mean opposite things. */
export function channelFailureMessage(error: unknown): string {
  const { status, code, message } = failureOf(error)
  if (code === "CHANNEL_EXISTS") {
    return "This account already has a channel. Reload the studio to pick it up."
  }
  if (code === "HANDLE_TAKEN") return "That handle is already taken. Try another."
  if (status === 401) return "Your session ended. Sign in again to create a channel."
  return message || "The channel could not be created."
}
