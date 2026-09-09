/**
 * Is this file really the container it claims to be?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS: A FAILURE FOUND BY RUNNING THE STUDIO, NOT BY READING DOCS
 *
 * `POST /v1/media/confirm` sniffs the uploaded bytes and refuses a mismatch:
 *
 *     500 INTERNAL_ERROR
 *     "invalid video file: magic bytes do not match declared MIME type"
 *
 * Observed live, in a browser, on 2026-09-09. Three things about it are worth
 * writing down, because each one costs somebody something:
 *
 *   · it is a **500**, not a 400. So a client that classifies by status reads
 *     "the server is broken, try again" for a file that will never work.
 *   · it happens at CONFIRM, which is AFTER every byte has gone to storage.
 *     On a 500 MB file that is the whole upload, spent, to be told the file
 *     was never a video.
 *   · the message is decoder jargon. "magic bytes do not match declared MIME
 *     type" is precise and means nothing to somebody who dragged in a file
 *     their video editor produced.
 *
 * So the check is done HERE, on the first sixteen bytes, before `/v1/media/
 * init` is even called. It costs one `slice(0, 16)` and it turns a five-minute
 * round trip into an instant, plain sentence.
 *
 * ── This is a gate, not a parser, and it fails OPEN ───────────────────────
 * It refuses only what it can positively identify as the WRONG thing. A
 * container it does not recognise at all is allowed through, because the
 * server's sniffer knows more formats than this does and the authoritative
 * refusal is its job. Refusing something here that the server would have
 * accepted is the worse error by a long way: it is unappealable, and the
 * person has no way to find out they were wrong.
 */

/** How many leading bytes are needed. `ftyp` sits at offset 4–8 in an MP4. */
export const SNIFF_BYTES = 16

export type VideoContainer = "mp4" | "webm" | "unknown"

/**
 * What the leading bytes say this is.
 *
 *   · **MP4 / QuickTime** — ISO base media. Bytes 4–8 are the ASCII `ftyp`
 *     box type. The four bytes before it are the box LENGTH, which varies, so
 *     the check starts at 4 rather than 0. `.mov` is the same family and the
 *     same box; the brand inside (`qt  `, `isom`, `mp42`, …) distinguishes
 *     them and nothing here needs to.
 *   · **WebM / Matroska** — EBML, `1A 45 DF A3` at offset 0.
 *
 * Anything else is `unknown`, which is deliberately not "invalid".
 */
export function containerOf(head: Uint8Array): VideoContainer {
  if (head.length >= 8) {
    if (
      head[4] === 0x66 && // f
      head[5] === 0x74 && // t
      head[6] === 0x79 && // y
      head[7] === 0x70 // p
    ) {
      return "mp4"
    }
  }
  if (head.length >= 4) {
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
      return "webm"
    }
  }
  return "unknown"
}

/** Which container a declared MIME type implies, or null when it implies none. */
export function containerForMime(mimeType: string): VideoContainer | null {
  const mime = mimeType.toLowerCase()
  if (mime === "video/mp4" || mime === "video/quicktime") return "mp4"
  if (mime === "video/webm") return "webm"
  return null
}

/**
 * Why this file will be refused at confirm, or null.
 *
 * The sentence is the creator's, not the decoder's. It names the two things
 * that actually cause this — a renamed file and a container the exporter
 * labelled wrongly — because those are the two things a person can do
 * something about.
 */
export function sniffRefusal(head: Uint8Array, declaredMime: string): string | null {
  const expected = containerForMime(declaredMime)
  if (!expected) return null

  const actual = containerOf(head)
  // Fails open: an unrecognised container is the server's call, not ours.
  if (actual === "unknown") return null
  if (actual === expected) return null

  return "That file is not the video format its name says it is. Re-export it as an MP4 (H.264) and try again."
}
