/**
 * Everything the composer puts on the wire. Six requests, and this is the list.
 *
 * ── Why this is a third file and not part of ../feed/api.ts ───────────────
 * `../feed/api.ts` opens by calling itself "the whole network surface of the
 * zone" and it is a READ surface plus the action bar's writes. This is the
 * only thing in apps/social that CREATES a post, and it is separate for the
 * reason apps/tube keeps `uploadApi.ts` apart from `api.ts`: a file whose name
 * is a lie about half its contents is worse than three short ones.
 *
 * ── The path is the tube studio's, and it is deliberately the same one ────
 * apps/tube/src/tube/uploadApi.ts drove this end to end against the live
 * gateway and wrote down what it found. Every step below is that path, and
 * where this file departs from it the departure is stated. Re-deriving a
 * second upload client from the docs would be a second set of assumptions to
 * be wrong in.
 *
 *   1. POST /v1/media/init     auth -> {media_id, upload_url, object_key,
 *                                       expires_at}   signed for 15 minutes
 *   2. PUT  <upload_url>       NO auth, NO cookies, straight to object storage
 *   3. POST /v1/media/confirm  auth -> QUEUES the transcode. Idempotent.
 *   4. POST /v1/posts          auth -> 201, the bare post. REQUIRES a UUID
 *                                       `Idempotency-Key` header.
 *
 * Step 4 of tube's path — polling `/v1/media/{id}/status` — is deliberately
 * NOT here, and that is a real difference rather than an omission. post-
 * service's create gate asks only whether the bytes arrived and nothing
 * refused them (`mediaConfirmed`: uploaded | processing | ready all pass), and
 * its own comment gives the product decision: "a reel is publishable the
 * moment its upload finishes, like Instagram/YouTube. Transcoding is a
 * background job that improves quality later and must not gate publishing."
 * Until every asset is `ready` and `passed` the post is returned to its author
 * alone, which is the server's own protection and a better one than a spinner.
 *
 * ── The envelope is not unwrapped for you ─────────────────────────────────
 * `@atpost/api-client` is a plain axios instance and does not touch the body,
 * so every gateway response is `{data, error, meta}` and a caller reads
 * `res.data.data`. The ONE call here that does not go through it is the PUT to
 * storage, which is not the gateway at all.
 */

import api from "@atpost/api-client"
import { putObject, type PutProgress } from "./upload"

interface Envelope<T> {
  data?: T
  meta?: { next_cursor?: string }
  error?: { code?: string; message?: string }
}

/**
 * The gateway's own vocabulary for a failure, pulled out of axios.
 *
 * axios keeps the HTTP status and the envelope's code in different places, and
 * a caller that reads only one of them cannot tell `400 EMPTY_POST` (fixable
 * by the person, in the box in front of them) from `429 RATE_LIMITED` (not).
 * Every message this composer shows goes through here first.
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

/* ── What a browser may hand us ───────────────────────────────────────────── */

/**
 * The image types, copied from the tube studio rather than widened.
 *
 * media-service reads the Content-Type it was told at `/v1/media/init` when it
 * decides what to transcode, and `/confirm` sniffs magic bytes and can reject
 * outright. Offering a type the pipeline has not been exercised with buys a
 * file that uploads, confirms, and then fails to render for everybody.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const
export const IMAGE_ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const
export const VIDEO_ACCEPT_ATTR = ".mp4,.webm,.mov,video/mp4,video/webm,video/quicktime"

/**
 * The ceiling this composer will attempt in ONE signed PUT.
 *
 * tube's studio switches to the chunked, resumable endpoint above 500 MB, and
 * its note gives the arithmetic: a signed URL lives 15 minutes, so 500 MB in
 * 15 minutes is ~4.4 Mbit/s of sustained upstream, and plenty of domestic
 * connections are slower than that. Above it a single PUT is not inconvenient,
 * it is a coin flip that lands on `expired` after a ten-minute wait.
 *
 * This composer does not implement the resumable path — it is a first version,
 * and a social post is not a 2 GB feature film — so instead of uploading a
 * file it cannot finish, it refuses one over the limit BEFORE the upload
 * starts and says why. Refusing early is the honest half of not implementing
 * the other path.
 */
export const MAX_SINGLE_PUT_BYTES = 500 * 1024 * 1024

/** post-service's own cap: "Maximum 10 media attachments", 400 otherwise. */
export const MAX_ATTACHMENTS = 10

/** post-service's `MaxPostTextRunes`, counted in CODE POINTS. See ./draft.ts. */
export const MAX_TEXT_RUNES = 5000

/* ── Step 1: reserve a media id and a signed URL ──────────────────────────── */

export interface MediaInit {
  media_id: string
  upload_url: string
  object_key: string
  /** RFC3339. The signed URL is good for 15 minutes and not a second more. */
  expires_at: string
}

/**
 * `upload_purpose: "composer"` and `media_subtype: "general"` are the same two
 * values the tube studio sends. They are not decorative — media-service keys
 * retention and moderation routing off the purpose — and inventing a third
 * spelling here would put this zone's uploads in a bucket nothing else knows
 * about.
 */
export async function initMedia(spec: {
  fileType: "video" | "image"
  mimeType: string
  fileSizeBytes: number
}): Promise<MediaInit> {
  const res = await api.post<Envelope<MediaInit>>("/v1/media/init", {
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

/* ── Step 3: confirm, which is what starts the transcode ──────────────────── */

/**
 * Tell the gateway the bytes are there.
 *
 * This is NOT bookkeeping — it is what enqueues the transcode, and it is also
 * what moves the asset out of `pending_upload`, which is the one processing
 * status post-service's create gate REFUSES. An upload that completes and is
 * never confirmed cannot be attached to a post at all. Idempotent, verified by
 * the tube studio, so a retry may call it again without checking.
 */
export async function confirmMedia(mediaId: string): Promise<void> {
  await api.post<Envelope<unknown>>("/v1/media/confirm", { media_id: mediaId })
}

/** One attachment, all the way to a confirmed media id. */
export async function uploadOne(
  file: File,
  kind: "image" | "video",
  opts: { onProgress?: (p: PutProgress) => void; signal?: AbortSignal } = {}
): Promise<string> {
  const init = await initMedia({
    fileType: kind,
    mimeType: file.type,
    fileSizeBytes: file.size,
  })
  await putObject(init.upload_url, file, file.type, opts)
  await confirmMedia(init.media_id)
  return init.media_id
}

/* ── Step 4: the post ─────────────────────────────────────────────────────── */

/** The four the server takes. `oneof`, and omitting it is a 400 on `required`. */
export type Visibility = "public" | "unlisted" | "followers" | "private"

/**
 * What this composer sends, and nothing else.
 *
 * post-service's `CreatePostRequest` has upwards of forty fields — feelings,
 * locations, polls, distribution policies, licences, comment moderation. This
 * is the first version of a text-and-media composer and it sends six of them.
 * Every field left out has a server default that is right for a plain post,
 * and a control that sets a field nobody asked for is a control to maintain.
 *
 * ── The three fields that are NOT obvious ─────────────────────────────────
 *
 *   · `content_type: "post"` for all three kinds, including video. It is the
 *     generic intent, and post-service treats it as exactly that:
 *     `resolveVideoContentType` classifies a plain "post" that carries a video
 *     from the MEASUREMENT once transcode lands (flick if <=300s and
 *     portrait/square, long_video otherwise) and marks it non-explicit so the
 *     transcode consumer may reclassify it. Sending "flick" or "long_video"
 *     instead would be this composer deciding somebody meant to post a reel or
 *     a Tube video, which they did not say.
 *
 *     This also matters for a gate: `gateVideoBehindChannel` runs on the
 *     REQUESTED content type, before that classification, and only refuses
 *     `long_video`. A video posted as a "post" therefore does not need a Tube
 *     channel, which is right — a plain post is not a channel upload.
 *
 *   · `post_type` is what stops a video being refused outright.
 *     `checkMediaCompatibility` refuses a VIDEO attached to `post_type: "text"`
 *     in as many words ("silently publishing a video as a text post is how
 *     PostTube content leaks into the social feed with no player"), and
 *     refuses anything but an image on `post_type: "image"`. So the three
 *     kinds map onto the three spellings the rest of the platform already
 *     uses — "text", "image", "video" — rather than onto one.
 *
 *   · `app_origin` defaults to "postbook" server-side when absent. It is sent
 *     explicitly so that a post made here is distinguishable in the data from
 *     one made on the phone, which is the only way anyone will ever be able to
 *     tell whether this composer is worth its space.
 */
export interface CreatePostBody {
  content_type: "post"
  post_type: "text" | "image" | "video"
  visibility: Visibility
  text: string
  media_ids: string[]
  app_origin: string
}

/** The bare post the create returns, narrowed to what the composer uses. */
export interface CreatedPost {
  id: string
  text?: string
  visibility?: string
  content_type?: string
  post_type?: string
  created_at?: string
}

/**
 * Create the post.
 *
 * ── The Idempotency-Key header is REQUIRED and must be a UUID ─────────────
 * Both halves are the gateway's, both are 400s, and both were verified by the
 * tube studio against the live service:
 *   · absent        -> MISSING_IDEMPOTENCY_KEY
 *   · "not-a-uuid"  -> INVALID_IDEMPOTENCY_KEY
 *
 * The key is passed IN rather than minted here, and that is the whole point of
 * it. The dialog holds ONE key per attempt for the life of that attempt, so a
 * Post that timed out and is retried lands on the same key and cannot produce
 * two posts. Minting inside this function would make every retry a fresh key
 * and the header pure ceremony.
 *
 * The key is bound to the payload server-side (`createFingerprint` over the
 * whole canonical request), so a retry whose TEXT changed is a 409
 * IDEMPOTENCY_KEY_REUSED rather than a silent replay of the old words. The
 * dialog mints a new key when the draft changes, for that reason.
 *
 * ── This header must survive the zone proxy ───────────────────────────────
 * `packages/api-client/src/proxy.ts` forwards an ALLOWLIST of headers and
 * `idempotency-key` is on it. If this starts failing with
 * MISSING_IDEMPOTENCY_KEY for a request that plainly had one, that list is the
 * first place to look.
 */
export async function createPost(
  body: CreatePostBody,
  idempotencyKey: string
): Promise<CreatedPost> {
  const res = await api.post<Envelope<CreatedPost>>("/v1/posts", body, {
    headers: { "Idempotency-Key": idempotencyKey },
  })
  const post = res.data?.data
  if (!post?.id) throw new Error("The server accepted the post but did not return its id.")
  return post
}
