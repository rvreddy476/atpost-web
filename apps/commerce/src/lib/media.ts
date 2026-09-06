/**
 * Where a catalogue image actually lives from the browser's point of view.
 *
 * The zone is served under a basePath (`/shop`), and the `/v1/:path*` →
 * `/api/proxy/:path*` rewrite in next.config lives under that basePath too.
 * A root-relative `/v1/media/…` therefore misses the zone entirely and 404s,
 * which is why every product photograph in the shop was rendering as a broken
 * image. NEXT_PUBLIC_API_BASE_URL is already the agreed name for this prefix
 * (see apps/commerce/.env.example) — axios uses the same value — so the fix is
 * to build media URLs through it rather than hard-coding the path anywhere.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")

export interface MediaOptions {
  /** Requested width in CSS pixels. The service picks the nearest rendition. */
  width?: number
  /** JPEG/WebP quality, 1-100. */
  quality?: number
}

/** Absolute-for-this-origin URL for a media id served by the gateway. */
export function mediaUrl(mediaId: string, { width = 600, quality = 82 }: MediaOptions = {}): string {
  return `${API_BASE}/v1/media/${mediaId}/serve?w=${width}&q=${quality}`
}

/**
 * The best image URL for a record that may carry a media id, a presigned
 * absolute URL from the catalogue read model, or a legacy source URL — in that
 * order of preference. Returns null when the record has no image at all, so
 * callers render the empty plate rather than an image element with no src.
 */
export function productImage(
  source: {
    primary_image_media_id?: string | null
    image_media_id?: string | null
    image_url?: string | null
    thumbnail_url?: string | null
    source_image_url?: string | null
  } | null
  | undefined,
  options?: MediaOptions,
): string | null {
  if (!source) return null
  const mediaId = source.image_media_id || source.primary_image_media_id
  if (mediaId) return mediaUrl(mediaId, options)
  return source.image_url || source.source_image_url || source.thumbnail_url || null
}
