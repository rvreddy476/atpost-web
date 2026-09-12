// A product's photographs, before and while they are on the wire.
//
// The rules a gallery editor has to hold at once: at most eight, the first is
// the cover, an image is not "on the product" until media-service has said
// ready and passed, and the order the seller sees is the order the server is
// told. Every one of those is a pure function of a list, so they are here and
// the component only draws the list.

/** The gallery cap, mirroring `postgres.MaxProductMedia` in commerce-service. */
export const MAX_GALLERY_IMAGES = 8

/** What `/v1/media/init` will take for a product photograph. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** What the `<input type="file">` advertises. */
export const IMAGE_ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

/**
 * Where one image is on its way from the disk to the product.
 *
 *   queued      picked, not yet sent
 *   uploading   bytes in flight to storage
 *   processing  confirmed; media-service is transcoding or moderating
 *   ready       ready AND passed; may be attached
 *   failed      any step refused; `error` says which, in the seller's words
 *
 * `attached` is a separate axis: an image already on the product (loaded from
 * the server on an edit) is `ready` from the start.
 */
export type GalleryStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'failed'

export interface GalleryItem {
  /** Stable for the life of the row, so a reorder does not remount previews. */
  key: string
  /** Set once media-service has reserved an id. */
  mediaId: string | null
  /** An object URL for a picked file, or the server's URL for an attached one. */
  previewUrl: string | null
  fileName: string
  status: GalleryStatus
  /** 0..1 while uploading. */
  progress: number
  error: string | null
  /** The File, kept so a failed upload can be retried without re-picking. */
  file?: File
}

export interface AddResult {
  items: GalleryItem[]
  /** Files that were not added, with the reason, so the editor can say so. */
  rejected: Array<{ fileName: string; reason: string }>
}

let keySeq = 0
/** A key for a new row. Counter-based so it is deterministic in tests. */
export function nextGalleryKey(): string {
  keySeq += 1
  return `g${keySeq}`
}

/**
 * Picked files onto the end of the gallery, up to the cap.
 *
 * Over-the-cap files are refused by name rather than silently dropped: a
 * seller who picked twelve and sees eight needs to know which four did not
 * make it, and "the first eight" is only obvious to the person who wrote
 * this. A wrong type is refused the same way, before any bytes move.
 */
export function addToGallery(
  items: readonly GalleryItem[],
  files: readonly File[],
  makeKey: () => string = nextGalleryKey,
  makePreview: (file: File) => string | null = () => null,
): AddResult {
  const out = items.slice()
  const rejected: AddResult['rejected'] = []
  for (const file of files) {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      rejected.push({ fileName: file.name, reason: 'Only JPEG, PNG and WebP images can be uploaded.' })
      continue
    }
    if (out.length >= MAX_GALLERY_IMAGES) {
      rejected.push({ fileName: file.name, reason: `A product carries at most ${MAX_GALLERY_IMAGES} images.` })
      continue
    }
    out.push({
      key: makeKey(),
      mediaId: null,
      previewUrl: makePreview(file),
      fileName: file.name,
      status: 'queued',
      progress: 0,
      error: null,
      file,
    })
  }
  return { items: out, rejected }
}

/** The row at `from`, now at `to`. Out-of-range moves return the same list. */
export function moveGalleryItem(items: readonly GalleryItem[], from: number, to: number): GalleryItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items.slice()
  const out = items.slice()
  const [moved] = out.splice(from, 1)
  out.splice(to, 0, moved)
  return out
}

export function removeGalleryItem(items: readonly GalleryItem[], key: string): GalleryItem[] {
  return items.filter((item) => item.key !== key)
}

/** One row, updated in place by key. */
export function patchGalleryItem(
  items: readonly GalleryItem[],
  key: string,
  patch: Partial<GalleryItem>,
): GalleryItem[] {
  return items.map((item) => (item.key === key ? { ...item, ...patch } : item))
}

/** The cover is the first row, whatever its state. Explicit so no caller has
 *  to know that "index 0" is the rule. */
export function coverOf(items: readonly GalleryItem[]): GalleryItem | null {
  return items[0] ?? null
}

/**
 * What `POST …/media {"media_ids"}` is sent: every READY row's id, in order.
 *
 * A row that is still uploading, or that failed, is left out rather than
 * blocking the save. Commerce-service refuses an id that is not ready and
 * passed, and it refuses the WHOLE batch, so one slow upload in a list of
 * eight would otherwise fail seven good ones.
 */
export function galleryMediaIds(items: readonly GalleryItem[]): string[] {
  const out: string[] = []
  for (const item of items) {
    if (item.status === 'ready' && item.mediaId && !out.includes(item.mediaId)) out.push(item.mediaId)
  }
  return out
}

/** Whether anything is still on its way. The save waits on this. */
export function galleryBusy(items: readonly GalleryItem[]): boolean {
  return items.some((item) => item.status === 'queued' || item.status === 'uploading' || item.status === 'processing')
}

/**
 * The one-line reason a save is not possible yet, or null when it is.
 * Ordered by what the seller can do about it: wait, then fix, then pick.
 */
export function galleryProblem(items: readonly GalleryItem[]): string | null {
  if (galleryBusy(items)) return 'Images are still uploading.'
  if (items.length > 0 && galleryMediaIds(items).length === 0) return 'None of these images is ready to attach.'
  return null
}

/** An already-attached image, as `GET …/media` returns it, as a gallery row. */
export function attachedGalleryItem(entry: {
  media_id: string
  image_url?: string
  thumbnail_url?: string
}, makeKey: () => string = nextGalleryKey): GalleryItem {
  return {
    key: makeKey(),
    mediaId: entry.media_id,
    previewUrl: entry.thumbnail_url || entry.image_url || null,
    fileName: '',
    status: 'ready',
    progress: 1,
    error: null,
  }
}
