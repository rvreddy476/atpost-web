"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ImagePlus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@atpost/ui"
import { useProductMedia, useRemoveProductMedia, useSetProductMedia } from "@/hooks/useCommerce"
import { uploadProductImage } from "@/lib/mediaUpload"
import { apiMessage } from "@/lib/listing"
import {
  IMAGE_ACCEPT_ATTR,
  MAX_GALLERY_IMAGES,
  addToGallery,
  attachedGalleryItem,
  galleryMediaIds,
  galleryProblem,
  moveGalleryItem,
  patchGalleryItem,
  removeGalleryItem,
  type GalleryItem,
} from "@/lib/gallery"

/**
 * The listing's photographs.
 *
 * ── What happens when ────────────────────────────────────────────────
 *
 * Picking files starts their uploads at once: init, PUT, confirm, then a
 * wait for media-service to say ready and passed (lib/mediaUpload.ts says
 * why the wait is not optional). Nothing about that needs the product to
 * exist, so a seller can add photographs before the first save. What DOES
 * need the product is attaching them: "Save photos" posts the whole gallery
 * as `media_ids`, in the order on screen, first is the cover, and that route
 * takes a product id. Until the draft has one the button says so.
 *
 * ── Why the list is the truth ───────────────────────────────────────
 *
 * On an edit, the product's current gallery is loaded once and becomes the
 * list; from then on the list is what the seller is editing and the server
 * is told about it only on save. Removing a photograph removes it from the
 * list, and the replace semantics of the save drop it on the server. The
 * one case the replace route cannot express is "no photographs at all" (it
 * refuses an empty list), so emptying the gallery deletes each remaining
 * one by id instead.
 *
 * Every rule about the list itself (the cap, the cover, what is sent) is in
 * lib/gallery.ts and tested there; this file draws it and moves bytes.
 */
export function ListingImages({ productId }: { productId: string | null }) {
  const existing = useProductMedia(productId)
  const save = useSetProductMedia(productId)
  const removeOnServer = useRemoveProductMedia(productId)

  const [items, setItems] = useState<GalleryItem[]>([])
  const [seeded, setSeeded] = useState(false)
  const [rejected, setRejected] = useState<Array<{ fileName: string; reason: string }>>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Object URLs are revoked on unmount, and a removed row's URL then; a
  // preview kept alive for the life of the page is a leak per photograph.
  const objectUrls = useRef<Set<string>>(new Set())
  useEffect(() => {
    const urls = objectUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [])

  // Seed from the server ONCE, and only into an empty list: a seller who
  // picked a file before the fetch landed must not have it replaced.
  useEffect(() => {
    if (seeded || !existing.data) return
    const rows = existing.data.map((entry) => attachedGalleryItem(entry))
    setItems((current) => (current.length ? current : rows))
    setSeeded(true)
  }, [seeded, existing.data])

  const patch = useCallback(
    (key: string, change: Partial<GalleryItem>) => setItems((current) => patchGalleryItem(current, key, change)),
    [],
  )

  const upload = useCallback(async (row: GalleryItem) => {
    if (!row.file) return
    patch(row.key, { status: "uploading", progress: 0, error: null })
    try {
      const mediaId = await uploadProductImage(row.file, {
        onProgress: (fraction) => patch(row.key, { progress: fraction }),
        onProcessing: () => patch(row.key, { status: "processing", progress: 1 }),
      })
      patch(row.key, { status: "ready", mediaId })
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      patch(row.key, {
        status: "failed",
        error: apiMessage(err, err instanceof Error ? err.message : "The upload failed."),
      })
    }
  }, [patch])

  function pick(files: FileList | null) {
    if (!files || files.length === 0) return
    const preview = (file: File) => {
      const url = URL.createObjectURL(file)
      objectUrls.current.add(url)
      return url
    }
    const result = addToGallery(items, Array.from(files), undefined, preview)
    setItems(result.items)
    setRejected(result.rejected)
    setDirty(true)
    for (const row of result.items.slice(items.length)) void upload(row)
    if (inputRef.current) inputRef.current.value = ""
  }

  function remove(row: GalleryItem) {
    if (row.previewUrl && objectUrls.current.has(row.previewUrl)) {
      URL.revokeObjectURL(row.previewUrl)
      objectUrls.current.delete(row.previewUrl)
    }
    setItems((current) => removeGalleryItem(current, row.key))
    setDirty(true)
  }

  function move(from: number, to: number) {
    setItems((current) => moveGalleryItem(current, from, to))
    setDirty(true)
  }

  async function attach() {
    if (!productId) return
    setNotice(null)
    const ids = galleryMediaIds(items)
    try {
      if (ids.length === 0) {
        // Emptying the gallery: the replace route refuses an empty list.
        for (const entry of existing.data ?? []) await removeOnServer.mutateAsync(entry.media_id)
      } else {
        await save.mutateAsync(ids)
      }
      setSavedAt(Date.now())
      setDirty(false)
    } catch (err) {
      setNotice(apiMessage(err, "The photographs could not be saved. Try again."))
    }
  }

  const problem = galleryProblem(items)
  const saving = save.isPending || removeOnServer.isPending
  const canSave = !!productId && !problem && !saving && (dirty || items.length > 0)

  return (
    <fieldset className="gallery-editor">
      <legend className="text-sm font-medium">Photographs</legend>
      <p className="mt-1 text-xs text-shop-faint">
        Up to {MAX_GALLERY_IMAGES}. The first is the cover. Drag to reorder, or use the arrows.
      </p>

      <div className="gallery-grid mt-4">
        {items.map((row, index) => (
          <div
            key={row.key}
            className={[
              "gallery-tile",
              row.status === "failed" ? "is-failed" : "",
              dragKey === row.key ? "is-dragging" : "",
              overKey === row.key && dragKey !== row.key ? "is-over" : "",
            ].filter(Boolean).join(" ")}
            draggable
            onDragStart={() => setDragKey(row.key)}
            onDragOver={(event) => {
              event.preventDefault()
              if (overKey !== row.key) setOverKey(row.key)
            }}
            onDragLeave={() => setOverKey((current) => (current === row.key ? null : current))}
            onDrop={(event) => {
              event.preventDefault()
              const from = items.findIndex((item) => item.key === dragKey)
              if (from >= 0) move(from, index)
              setDragKey(null)
              setOverKey(null)
            }}
            onDragEnd={() => {
              setDragKey(null)
              setOverKey(null)
            }}
          >
            {row.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.previewUrl} alt={row.fileName || `Photograph ${index + 1}`} />
            ) : (
              <span className="gallery-tile-state">{row.fileName}</span>
            )}
            {index === 0 ? <span className="gallery-tile-cover">COVER</span> : null}
            {row.status === "uploading" ? (
              <>
                <span className="gallery-tile-progress" style={{ width: `${Math.round(row.progress * 100)}%` }} />
                <span className="gallery-tile-state">Uploading {Math.round(row.progress * 100)}%</span>
              </>
            ) : null}
            {row.status === "queued" ? <span className="gallery-tile-state">Waiting</span> : null}
            {row.status === "processing" ? <span className="gallery-tile-state">Processing</span> : null}
            {row.status === "failed" ? (
              <span className="gallery-tile-state is-error" role="alert">
                {row.error}
                {row.file ? (
                  <button type="button" onClick={() => void upload(row)} aria-label={`Retry ${row.fileName}`}>
                    <RefreshCw size={13} aria-hidden="true" /> Retry
                  </button>
                ) : null}
              </span>
            ) : null}
            <span className="gallery-tile-actions">
              <button type="button" onClick={() => move(index, index - 1)} disabled={index === 0} aria-label={`Move photograph ${index + 1} earlier`}>
                <ArrowLeft size={14} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => remove(row)} aria-label={`Remove photograph ${index + 1}`}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => move(index, index + 1)} disabled={index === items.length - 1} aria-label={`Move photograph ${index + 1} later`}>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            </span>
          </div>
        ))}

        {items.length < MAX_GALLERY_IMAGES ? (
          <label className="gallery-drop">
            <ImagePlus size={22} aria-hidden="true" />
            <span>Add photos</span>
            <span className="sr-only">Choose up to {MAX_GALLERY_IMAGES - items.length} more images</span>
            <input
              ref={inputRef}
              type="file"
              accept={IMAGE_ACCEPT_ATTR}
              multiple
              className="sr-only"
              onChange={(event) => pick(event.target.files)}
            />
          </label>
        ) : null}
      </div>

      {rejected.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-shop-warn" role="alert">
          {rejected.map((entry) => (
            <li key={entry.fileName}>{entry.fileName}: {entry.reason}</li>
          ))}
        </ul>
      ) : null}

      {notice ? <p role="alert" className="mt-3 text-sm text-shop-bad">{notice}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!canSave} onClick={() => void attach()}>
          {saving ? "Saving photos…" : "Save photos"}
        </Button>
        <span className="text-xs text-shop-faint">
          {!productId
            ? "Save the draft first, then the photographs can be attached to it."
            : problem
              ? problem
              : savedAt && !dirty
                ? `Photos saved · ${new Date(savedAt).toLocaleTimeString()}`
                : `${items.length} of ${MAX_GALLERY_IMAGES}`}
        </span>
      </div>
    </fieldset>
  )
}
