/**
 * What a draft is, when it may be posted, and what to say when it is refused.
 *
 * Pure: no React, no network, no `window`. That is the point — every rule
 * below is one the SERVER also enforces, so the useful question about each of
 * them is "does the client agree with post-service", and a table test can ask
 * it. A rule that lives inside a dialog can only be checked by driving the
 * dialog.
 *
 * ── Every limit here is the server's, not a house style ───────────────────
 * Each one is named with the Go symbol it mirrors, so the day one moves there
 * is something to grep for:
 *
 *   text length   `service.MaxPostTextRunes`  = 5000 CODE POINTS
 *   empty post    `service.ValidatePostContent` — text or media, and
 *                 whitespace-only text is empty
 *   attachments   handler: "Maximum 10 media attachments", 400 otherwise
 *   duplicates    handler: 400 DUPLICATE_MEDIA — one id may not repeat
 *   visibility    `binding:"required,oneof=public followers private unlisted"`
 *
 * ── Code points, not `.length` ────────────────────────────────────────────
 * `MaxPostTextRunes`'s own comment is explicit about why, and it is not
 * pedantry for an India-first product: a 5,000-BYTE limit rejects roughly
 * 1,600 Devanagari characters while accepting 5,000 Latin ones, which is a
 * limit that discriminates by script. Go counts runes and Android counts
 * `codePointCount`; JavaScript's `String.length` counts UTF-16 units, so it
 * charges two for every emoji and every astral character. `[...text].length`
 * iterates code points and agrees with both of the others.
 */

import type { Visibility } from "./api"
import { MAX_ATTACHMENTS, MAX_TEXT_RUNES } from "./api"

/** One chosen file, before it has a media id. */
export interface DraftAttachment {
  /** Stable within one draft, so React keys and removals do not depend on order. */
  key: string
  file: File
  kind: "image" | "video"
  /** An object URL for the preview. The dialog revokes it; see its note. */
  previewUrl: string
}

export interface Draft {
  text: string
  attachments: DraftAttachment[]
  visibility: Visibility
}

export const EMPTY_DRAFT: Draft = {
  text: "",
  attachments: [],
  // Public is the default on every surface of this product, and it is the one
  // the phone's audience sheet opens on. A composer that quietly defaulted to
  // something narrower would be making an audience decision on somebody's
  // behalf, which is exactly what post-service's after-hours note refuses to
  // infer from a normal publish.
  visibility: "public",
}

/**
 * The four, with the tube studio's own sentences.
 *
 * Copied verbatim from `apps/tube/src/studio/fields.ts` rather than reworded.
 * "Unlisted" means the same thing in both places and a product that describes
 * one audience two ways has two audiences as far as the reader is concerned.
 * The order is the studio's too: widest first, narrowest last, so the list
 * reads as a dial rather than as a menu.
 */
export const VISIBILITY_OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "public", label: "Public", hint: "Anyone can find and see it." },
  {
    value: "unlisted",
    label: "Unlisted",
    hint: "Only people with the link. It stays off search and off your profile grid.",
  },
  { value: "followers", label: "Followers", hint: "Only people who follow you." },
  { value: "private", label: "Private", hint: "Only you." },
]

/** Code points, the way Go and Android count them. See the header. */
export function textLength(text: string): number {
  return [...text].length
}

/**
 * Which `post_type` this draft is.
 *
 * Not cosmetic — it is what decides whether post-service accepts the
 * attachment at all. `checkMediaCompatibility` refuses a video on
 * `post_type: "text"` and refuses anything but an image on `"image"`, so
 * getting this wrong is a 400 the person cannot act on.
 */
export function postTypeOf(draft: Draft): "text" | "image" | "video" {
  if (draft.attachments.some((a) => a.kind === "video")) return "video"
  if (draft.attachments.length > 0) return "image"
  return "text"
}

/**
 * Why this draft cannot be posted, or null when it can.
 *
 * Every branch mirrors a server rule and is worded as the thing to DO rather
 * than as the rule that was broken — "Add something to post" rather than
 * "EMPTY_POST".
 */
export function draftProblem(draft: Draft): string | null {
  const length = textLength(draft.text)

  if (length > MAX_TEXT_RUNES) {
    // `ValidatePostContent` counts the RAW text, not the trimmed copy, because
    // the ceiling is about what gets stored. So this does too.
    return `That is ${(length - MAX_TEXT_RUNES).toLocaleString()} characters too long.`
  }
  // Whitespace-only is empty: `ValidatePostContent` trims before it decides,
  // and its note says why — "a post containing three spaces is not content".
  if (draft.text.trim() === "" && draft.attachments.length === 0) {
    return "Add something to post — a few words, a photo, or a video."
  }
  if (draft.attachments.length > MAX_ATTACHMENTS) {
    return `A post can carry ${MAX_ATTACHMENTS} attachments at most.`
  }
  /**
   * One video, alone.
   *
   * Not a server rule, and it is the one rule here that is this client's own,
   * so it is worth being clear about. post-service would accept a video beside
   * images — `checkMediaCompatibility` only refuses the kind MISMATCH — but
   * `resolveVideoContentType` would then classify the whole post from that
   * video and send a photo album to Reels or Tube. The card cannot render a
   * mixed carousel sensibly either: `primaryVideo` picks one video for the
   * session and the rest of the pages are photographs.
   *
   * So the composer takes images OR one video, which is also what every
   * surface people are used to does, and says so rather than letting the
   * server surprise them later.
   */
  const videos = draft.attachments.filter((a) => a.kind === "video").length
  if (videos > 1) return "One video per post."
  if (videos === 1 && draft.attachments.length > 1) {
    return "A post can have photos or one video, not both."
  }
  return null
}

/** True when there is work in the box that closing would throw away. */
export function hasUnsavedWork(draft: Draft): boolean {
  return draft.text.trim() !== "" || draft.attachments.length > 0
}

/**
 * Whether the browser handed us a file this pipeline has been exercised with.
 *
 * Returns the kind, or a sentence. `.mov` is the awkward one: some browsers
 * report an empty `type` for it until the file is read, so an empty type with
 * a known extension is treated as the extension says rather than refused.
 */
export function classifyFile(
  file: File,
  accepted: { image: readonly string[]; video: readonly string[] }
): { kind: "image" | "video" } | { problem: string } {
  const type = (file.type || "").toLowerCase()
  if (accepted.image.includes(type)) return { kind: "image" }
  if (accepted.video.includes(type)) return { kind: "video" }

  if (!type) {
    const name = file.name.toLowerCase()
    if (/\.(jpe?g|png|webp)$/.test(name)) return { kind: "image" }
    if (/\.(mp4|webm|mov)$/.test(name)) return { kind: "video" }
  }
  return {
    problem: `${file.name} is not a kind of file we can post. Use a JPEG, PNG or WebP image, or an MP4, WebM or MOV video.`,
  }
}

/**
 * A refusal, turned into a sentence somebody can act on.
 *
 * ── The codes are post-service's, not invented ────────────────────────────
 * `writeCreateGuardError` maps each of these onto a stable HTTP code, and the
 * gateway's `Idempotency-Key` guards add two more. Every one of them means
 * something different to the person in front of the box:
 *
 *   EMPTY_POST / TEXT_TOO_LONG      they can fix it here, now
 *   MEDIA_NOT_READY                 wait a moment and try again
 *   MEDIA_NOT_FOUND / _NOT_OWNED    the attachment is gone; re-add it
 *   MEDIA_TYPE_MISMATCH             the kind does not suit the post
 *   DUPLICATE_MEDIA                 the same picture twice
 *   IDEMPOTENCY_KEY_REUSED (409)    the draft changed under a spent key
 *   RATE_LIMITED (429)              20 posts an hour, `CheckPostRateLimit`
 *   PAYLOAD_TOO_LARGE (413)         the body cap, 256 KiB
 *
 * A 401 is told apart by hand for the same reason the feed tells it apart: it
 * is not "posting is broken", it is "you are no longer who you were", and the
 * next step is different.
 *
 * The server's own `message` is NOT printed. These are internal sentences
 * written for an operator ("media cannot be attached by this user"), several
 * of them deliberately vague so as not to disclose anything about another
 * account's assets, and one of them is a Go error with a code point count in
 * it. Where nothing matches, the fallback says what is true and no more.
 */
export function createFailureMessage(failure: {
  status: number | null
  code: string | null
}): string {
  switch (failure.code) {
    case "EMPTY_POST":
      return "A post needs some words, a photo or a video."
    case "TEXT_TOO_LONG":
      return "That is longer than a post can be. Shorten it and try again."
    case "MEDIA_NOT_READY":
      return "The upload has not finished arriving. Give it a moment and post again."
    case "MEDIA_NOT_FOUND":
    case "MEDIA_NOT_OWNED":
      return "We lost track of that attachment. Remove it and add it again."
    case "MEDIA_TYPE_MISMATCH":
      return "That file cannot be attached to this kind of post."
    case "DUPLICATE_MEDIA":
      return "The same file is attached twice. Remove one of them."
    case "IDEMPOTENCY_KEY_REUSED":
      return "This post was already sent once. Change something, or reload the page."
    case "MISSING_IDEMPOTENCY_KEY":
    case "INVALID_IDEMPOTENCY_KEY":
      // Neither is reachable from this client — the dialog always sends a
      // UUID — so if one of them ever appears it is the zone proxy dropping
      // the header, not the person doing anything wrong. Said plainly, and
      // never blamed on them.
      return "Something went wrong sending this post. Reload the page and try again."
    case "RATE_LIMITED":
      return "You have posted a lot in the last hour. Try again a little later."
    case "PAYLOAD_TOO_LARGE":
      return "That post is too big to send. Shorten the text and try again."
    default:
      break
  }
  if (failure.status === 401) return "Your session has expired. Sign in again to post."
  if (failure.status === 429) {
    return "You have posted a lot in the last hour. Try again a little later."
  }
  if (failure.status === 413) return "That post is too big to send."
  return "We could not post that. Nothing was published — try again."
}

/** The upload half, which fails in different ways from the create. */
export function uploadFailureMessage(status: number | null): string {
  // The signed URL lives fifteen minutes. A 403 mid-upload is almost always
  // the clock, and "403" reads as "you are not allowed to upload" — which is
  // the opposite of what is true.
  if (status === 403) return "The upload slot expired. Try posting again."
  if (status === 0 || status === null) {
    return "The connection to storage failed. Check your connection and try again."
  }
  return "That file did not upload. Try again, or remove it and post without it."
}
