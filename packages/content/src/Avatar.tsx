"use client"

/**
 * An author's avatar — as initials, deliberately.
 *
 * ── Why not the picture ───────────────────────────────────────────────────
 * The feed gives an author `avatar_media_id`, not a URL, and there is no
 * second hop that produces a usable one: `GET /v1/media/{id}` answers with
 * metadata whose `cdn_url` is an UNSIGNED path, and the media host answers 403
 * to an unsigned request. (Verified against the live gateway.) The only way to
 * put a face on this card today would be one extra request per post — twenty
 * per page, on the render path — and the thing it would buy at the end is
 * still a 403.
 *
 * So this draws initials on a colour derived from the author's id: stable,
 * free, no layout shift, and no request. When the API grows a signed avatar
 * URL, this component takes a `src` and nothing else in the feed changes —
 * which is the reason it is a component rather than four lines inside the card.
 *
 * ── The colour ────────────────────────────────────────────────────────────
 * Chosen from a fixed set of token surfaces rather than by hashing to a hue.
 * A generated hue lands wherever it lands, including on the ember red that
 * means "primary action" and the gold that means "money" — and it would do it
 * inconsistently, so the palette would be violated on some avatars and not
 * others.
 */

export interface AvatarProps {
  name?: string
  id?: string
  /** Reserved: a signed URL, once the API can produce one. */
  src?: string | null
  size?: "sm" | "md"
  className?: string
}

/** Surfaces from the palette, all of which carry --mo-ink at AAA. */
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

  if (src) {
    return (
      // These URLs are pre-sized and signed with a short expiry, so putting
      // them through an image optimizer would cache a URL that stops working.
      // eslint-disable-next-line @next/next/no-img-element -- see PostMedia.
      <img
        src={src}
        alt=""
        className={`${box} shrink-0 rounded-mo-pill object-cover ring-1 ring-mo ${className ?? ""}`}
      />
    )
  }

  return (
    <div
      // Decorative: the author's name is right next to it as real text, so a
      // screen reader announcing "raghu varan" twice would be noise.
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
