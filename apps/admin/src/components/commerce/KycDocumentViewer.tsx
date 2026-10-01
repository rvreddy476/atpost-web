"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Maximize2, RotateCw, ShieldAlert } from "lucide-react"
import { Dialog } from "@/components/blocks/Dialog"
import { buttonPrimary, buttonSecondary } from "@/components/blocks/buttons"
import {
  KYC_ZOOMS,
  backingRatio,
  disposeKycView,
  drawKycView,
  isBlockedShortcut,
  nextRotation,
  tokenColour,
  viewGeometry,
  type KycRotation,
  type KycZoom,
} from "@/lib/admin/kycView"

/**
 * The view-only KYC document viewer: a canvas inside the console's modal.
 *
 * What it does:
 *   · draws the decoded ImageBitmap onto a <canvas> — there is no <img>, no
 *     object URL and no link, so the browser has no "Save image as", "Open
 *     image in new tab" or drag-to-desktop to offer;
 *   · tiles a diagonal watermark (the viewing admin's email, the date and
 *     time, "Momentum · KYC · view only") over the WHOLE canvas on every
 *     redraw — zoom, rotate and resize included;
 *   · prevents the context menu and dragging, sets user-select: none, and
 *     swallows Ctrl/Cmd+S and Ctrl/Cmd+P while open;
 *   · is hidden from print (`.kyc-viewer` in globals.css);
 *   · on close, clears the canvas, shrinks it to 0×0 and closes the bitmap.
 *
 * THE HONEST LIMIT, deliberately not in the UI: no web page can stop a
 * screenshot, a screen recording or a phone camera pointed at the monitor,
 * and someone with the browser's developer tools can read a canvas or the
 * network response. What this guarantees is that the console offers no way
 * to save the file, and that any copy carries who took it and when — and
 * admin-service records one audit row for every view.
 */
export function KycDocumentViewer({
  open,
  title,
  bitmap,
  watermark,
  onClose,
}: {
  open: boolean
  title: string
  /** Owned by the viewer once passed: closing the viewer closes it. */
  bitmap: ImageBitmap | null
  /** The watermark's lines, from watermarkLines(). */
  watermark: readonly string[]
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState<KycZoom>("fit")
  const [rotation, setRotation] = useState<KycRotation>(0)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const watermarkKey = watermark.join("\n")

  // A new document starts at fit, upright.
  useEffect(() => {
    setZoom("fit")
    setRotation(0)
  }, [bitmap])

  // The box decides what "fit" means; follow its size.
  useEffect(() => {
    const el = boxRef.current
    if (!open || !el) return
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [open])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!open || !canvas || !bitmap || box.width === 0 || box.height === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const geometry = viewGeometry({
      imageWidth: bitmap.width,
      imageHeight: bitmap.height,
      rotation,
      zoom,
      boxWidth: box.width,
      boxHeight: box.height,
    })
    const ratio = backingRatio(geometry.cssWidth, geometry.cssHeight, window.devicePixelRatio)
    canvas.width = Math.max(1, Math.round(geometry.cssWidth * ratio))
    canvas.height = Math.max(1, Math.round(geometry.cssHeight * ratio))
    // CSSOM, not a style attribute: the page CSP admits no inline style markup.
    canvas.style.width = `${geometry.cssWidth}px`
    canvas.style.height = `${geometry.cssHeight}px`
    // Theme tokens, read where the canvas sits (custom properties inherit).
    const style = getComputedStyle(canvas)
    drawKycView({
      ctx,
      image: bitmap,
      geometry,
      ratio,
      lines: watermarkKey.split("\n"),
      ink: tokenColour(style.getPropertyValue("--mo-ink"), 0.34),
      halo: tokenColour(style.getPropertyValue("--mo-bg"), 0.34),
      fontFamily: style.fontFamily,
    })
  }, [open, bitmap, zoom, rotation, box, watermarkKey])

  // Ctrl/Cmd+S and Ctrl/Cmd+P, caught before anything else sees them.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (!isBlockedShortcut(event)) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [open])

  // Unmounting while open (navigating away), or a different document replacing
  // this one, disposes the canvas and THIS bitmap too. Closing twice is harmless.
  useEffect(() => {
    if (!open || !bitmap) return
    const canvas = canvasRef.current
    return () => disposeKycView(canvas, bitmap)
  }, [open, bitmap])

  const close = useCallback(() => {
    disposeKycView(canvasRef.current, bitmap)
    onClose()
  }, [bitmap, onClose])

  const block = (event: React.SyntheticEvent) => event.preventDefault()

  return (
    <Dialog open={open} title={title} onClose={close} size="xl" className="kyc-viewer print:hidden">
      <div className="select-none" onContextMenu={block} onDragStart={block} onCopy={block}>
        <div className="mb-3 flex flex-wrap items-center gap-2" role="toolbar" aria-label="View">
          {KYC_ZOOMS.map((z) => (
            <button
              key={String(z.value)}
              type="button"
              aria-pressed={zoom === z.value}
              className={zoom === z.value ? buttonPrimary : buttonSecondary}
              onClick={() => setZoom(z.value)}
            >
              {z.value === "fit" ? <Maximize2 className="h-4 w-4" aria-hidden="true" /> : null}
              {z.label}
            </button>
          ))}
          <button type="button" className={buttonSecondary} onClick={() => setRotation((r) => nextRotation(r))}>
            <RotateCw className="h-4 w-4" aria-hidden="true" /> Rotate
          </button>
        </div>
        <div ref={boxRef} className="flex h-[70vh] overflow-auto rounded-mo-sm bg-mo-sunken">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${title}, view only`}
            draggable={false}
            onContextMenu={block}
            onDragStart={block}
            className="m-auto block select-none"
          />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-sm text-mo-body">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          View only. Every view is recorded.
        </p>
      </div>
    </Dialog>
  )
}
