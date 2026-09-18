"use client"

/**
 * An author's avatar — the real picture, with initials behind it.
 *
 * ── This used to draw initials and nothing else ───────────────────────────
 * The note that stood here said the feed gives an author `avatar_media_id`
 * and that there is "no second hop that produces a usable one", because
 * `GET /v1/media/{id}` answers metadata whose `cdn_url` is unsigned and the
 * media host 403s it. That observation was right about `/v1/media/{id}`. It
 * was wrong about the product: `GET /v1/media/{id}/serve/avatar` exists, is
 * registered with NO auth middleware, redirects to a bounded signed URL, and
 * media-service's profile authority admits an anonymous reader on purpose.
 * So every human in the product was drawn as two letters for want of one
 * path segment. `./avatarUrl.ts` is that path, and its header carries the whole
 * verification.
 *
 * ── Initials are the FALLBACK now, not the design ─────────────────────────
 * They still matter, and they are still most of this file, because a picture
 * is genuinely absent in several ordinary cases: an account that never set
 * one, an owner whose `who_can_see_profile_photo` excludes this reader (the
 * server answers 404 and is right to), an asset still processing, a signed
 * channel URL that expired while the card sat on screen.
 *
 * Which is why the failure path is an `onError` that falls BACK rather than
 * the browser's broken-image glyph. A broken image is the one outcome worse
 * than initials: it reads as a bug in the product rather than as an account
 * without a photograph, and it is what shipping `src` without this would have
 * produced on every private and every unprocessed avatar on the page.
 *
 * The failed URL is remembered rather than a bare `failed` flag, so a card
 * that is handed a NEW src — a refetch after a five-minute signature expired,
 * which is the whole reason the feed reloads itself — tries again instead of
 * staying on initials for the life of the mount.
 *
 * ── The colour ────────────────────────────────────────────────────────────
 * Chosen from a fixed set of token surfaces rather than by hashing to a hue.
 * A generated hue lands wherever it lands, including on the ember red that
 * means "primary action" and the gold that means "money" — and it would do it
 * inconsistently, so the palette would be violated on some avatars and not
 * others.
 */

import { useState } from "react"

export interface AvatarProps {
  name?: string
  id?: string
  /**
   * The picture, already resolved. `avatarSrc()` in ./avatarUrl.ts is what
   * builds one from whichever of the three shapes the API sent; this takes
   * the answer rather than the inputs so that a surface with a URL of its own
   * — a channel's signed one, say — needs no id to pass.
   */
  src?: string | null
  size?: "sm" | "md"
  className?: string
}

/**
 * The four fills an initials disc can take, and what each measures in BOTH
 * scopes — because this package is mounted on a violet-black ground in MShorts
 * and MTube and on a white one in the feed, on the same day.
 *
 * The old note said "all of which carry --mo-ink at AAA". That claim survives,
 * but it was only ever measured against one ground, so here are both:
 *
 *            DARK  (--mo-ink #F1EEF8)       LIGHT (--mo-ink #0F1A14)
 *   raised    #2A2745 ... 12.42  AAA        #F1F4F2 ... 16.09  AAA
 *   overlay   #332F55 ... 10.91  AAA        #FFFFFF ... 17.82  AAA
 *   surface   #1F1D33 ... 14.29  AAA        #FFFFFF ... 17.82  AAA
 *   sunken    #08070E ... 17.50  AAA        #E9EDEB ... 15.08  AAA
 *
 * What does NOT survive is the VARIETY, and that is worth writing down rather
 * than leaving for somebody to file as a bug. In a light zone `surface` and
 * `overlay` are both #FFFFFF — the same white as the page — so four fills
 * collapse to three tones, two of which are the page itself. Half the initials
 * discs in a light feed are therefore defined entirely by their `ring-1
 * ring-mo` hairline.
 *
 * That is the light theme's elevation model applied honestly rather than a
 * defect here: a card IS the page colour there, and tokens.css states the
 * consequence as a rule — a surface in a light zone must carry a line or a
 * shadow or it is invisible. This component has carried the line since it was
 * written, which is the only reason the collapse is survivable at all.
 *
 * It is not licence to hash to a hue instead. A generated colour lands
 * wherever it lands, including on the green that means "pressable" and the
 * gold that means "money", and it would do it on some avatars and not others.
 * Three distinguishable discs with a guaranteed 15:1 label beats four
 * distinguishable discs that occasionally say something untrue.
 */
const SURFACES = ["bg-mo-raised", "bg-mo-overlay", "bg-mo-surface", "bg-mo-sunken"] as const

function initials(name: string | undefined): string {
  if (!name) return "?"
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return "?"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function surfaceFor(id: string | undefined): string {
  if (!id) return SURFACES[0]
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return SURFACES[hash % SURFACES.length]
}

export function Avatar({ name, id, src, size = "md", className }: AvatarProps) {
  const box = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
  // The url that failed, not a boolean — see the header. Null means nothing
  // has failed yet, which is also the state a fresh url returns to.
  const [broken, setBroken] = useState<string | null>(null)

  if (src && src !== broken) {
    return (
      // Not `next/image`. These are signed, short-lived redirects to a media
      // host and an optimizer would cache a URL that stops working — the same
      // reason PostMedia opts out. The initials sit under it as the fallback,
      // so a failure is a swap rather than a hole in the row.
      // eslint-disable-next-line @next/next/no-img-element -- see PostMedia.
      <img
        src={src}
        alt=""
        // Decorative for the same reason the initials are: the name is beside
        // it as real text, so announcing it twice is noise.
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        onError={() => setBroken(src)}
        className={`${box} shrink-0 rounded-mo-pill object-cover ring-1 ring-mo ${className ?? ""}`}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={[
        box,
        surfaceFor(id),
        "flex shrink-0 items-center justify-center rounded-mo-pill font-semibold text-mo-ink ring-1 ring-mo",
        className ?? "",
      ].join(" ")}
    >
      {initials(name)}
    </div>
  )
}
