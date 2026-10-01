/**
 * Seller KYC documents in the console: VIEW ONLY.
 *
 * The founder's rule (1 Oct 2026): an admin may SEE a seller's KYC documents
 * inside the console and nowhere else — no download, no file, no link to
 * open elsewhere. This module is the part of that which can be tested without
 * a browser: the routes, the labels, the step-up gate before any bytes are
 * fetched, the error sentences, the watermark text and tiling, and the
 * zoom / rotate geometry the canvas viewer draws with.
 *
 * The chain is bytes, never a URL:
 *
 *   GET /v1/admin/commerce/sellers/:sellerId/documents                     list, no step-up
 *   GET /v1/admin/commerce/sellers/:sellerId/documents/:documentId/view    image bytes; step-up; one audit row per call
 *
 * The bytes go fetch → Blob → createImageBitmap → <canvas>. No <img>, no
 * object URL, no anchor, nothing the browser offers to "save as".
 */

import { STEP_UP_REQUIRED } from "./mutation"
import { isRecord, str } from "./data"

const ADMIN = "/v1/admin/commerce"

export const kycDocumentsPath = (sellerId: string) => `${ADMIN}/sellers/${encodeURIComponent(sellerId)}/documents`

export const kycDocumentViewPath = (sellerId: string, documentId: string) =>
  `${kycDocumentsPath(sellerId)}/${encodeURIComponent(documentId)}/view`

/* ── The list ─────────────────────────────────────────────────────────── */

/** One row of `GET …/documents`. commerce sends no media id, number or URL. */
export interface KycDocument {
  id: string
  documentType: string
  verificationStatus: string
  uploadedAt: string | null
  viewable: boolean
}

/** `{data: [...]}` or a bare array. Rows without an id are dropped; `viewable` must be literally true. */
export function parseKycDocuments(raw: unknown): KycDocument[] {
  const body = isRecord(raw) && "data" in raw ? raw.data : raw
  if (!Array.isArray(body)) return []
  return body.flatMap((row) => {
    if (!isRecord(row)) return []
    const id = str(row.id)
    if (!id) return []
    return [
      {
        id,
        documentType: str(row.document_type) ?? "other",
        verificationStatus: str(row.verification_status) ?? "pending",
        uploadedAt: str(row.uploaded_at),
        viewable: row.viewable === true,
      },
    ]
  })
}

/** commerce's `SellerDocumentTypes` (internal/store/postgres/models.go), in a reviewer's words. */
export const KYC_DOCUMENT_LABELS: Record<string, string> = {
  gst_certificate: "GST certificate",
  pan_card: "PAN card",
  aadhaar: "Aadhaar",
  passport: "Passport",
  business_registration: "Business registration",
  address_proof: "Address proof",
  cancelled_cheque: "Cancelled cheque",
  other: "Other document",
}

export function kycDocumentLabel(type: string): string {
  if (KYC_DOCUMENT_LABELS[type]) return KYC_DOCUMENT_LABELS[type]
  const spaced = type.replace(/[_.-]+/g, " ").trim().toLowerCase()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Document"
}

/** `seller_documents.verification_status` (migration 001's CHECK). */
export const KYC_STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "normal" }> = {
  pending: { label: "Pending", tone: "warn" },
  verified: { label: "Verified", tone: "good" },
  rejected: { label: "Rejected", tone: "bad" },
  needs_correction: { label: "Needs correction", tone: "warn" },
}

export function kycStatus(status: string): { label: string; tone: "good" | "warn" | "bad" | "normal" } {
  return KYC_STATUS[status] ?? { label: kycDocumentLabel(status), tone: "normal" }
}

/* ── Errors ───────────────────────────────────────────────────────────── */

export const KYC_VIEW_MESSAGES = {
  forbidden: "You don't have permission to view KYC documents.",
  notFound: "This document is no longer available.",
  stepUp: "Viewing KYC documents needs a fresh 2FA code.",
  signedOut: "Your session has ended. Sign in again.",
  unreadable: "This document could not be shown.",
  failed: "The document could not be loaded. Try again.",
} as const

/**
 * The sentence for a failed view. `status` null with `decode` means the bytes
 * arrived but were not an image the browser could decode (or were too large).
 */
export function kycViewErrorMessage(failure: { status: number | null; code?: string | null; decode?: boolean }): string {
  if (failure.decode) return KYC_VIEW_MESSAGES.unreadable
  if (failure.status === 403 && failure.code === STEP_UP_REQUIRED) return KYC_VIEW_MESSAGES.stepUp
  if (failure.status === 403) return KYC_VIEW_MESSAGES.forbidden
  if (failure.status === 404) return KYC_VIEW_MESSAGES.notFound
  if (failure.status === 401) return KYC_VIEW_MESSAGES.signedOut
  if (failure.status === 413 || failure.status === 415) return KYC_VIEW_MESSAGES.unreadable
  return KYC_VIEW_MESSAGES.failed
}

/* ── Fetch, behind the step-up ────────────────────────────────────────── */

/** admin-service caps the stream at 15 MB; anything larger is refused here too. */
export const KYC_MAX_BYTES = 15 * 1024 * 1024

export type KycFetchResult = { ok: true; blob: Blob } | { ok: false; status: number | null; code: string | null; decode?: boolean }

/**
 * One GET of the /view route. `redirect: "error"`: the route never redirects,
 * so a redirect (to a signed URL, say) is treated as a failure rather than
 * followed. Only an image body is accepted.
 */
export async function fetchKycImage(url: string, fetchImpl: typeof fetch = fetch): Promise<KycFetchResult> {
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "image/*" },
    })
  } catch {
    return { ok: false, status: null, code: null }
  }
  if (!response.ok) {
    let code: string | null = null
    if ((response.headers.get("content-type") ?? "").includes("json")) {
      try {
        const body: unknown = await response.json()
        const err = isRecord(body) && isRecord(body.error) ? body.error : body
        code = isRecord(err) ? str(err.code) : null
      } catch {
        code = null
      }
    }
    return { ok: false, status: response.status, code }
  }
  const type = response.headers.get("content-type") ?? ""
  if (!type.toLowerCase().startsWith("image/")) return { ok: false, status: response.status, code: null, decode: true }
  const blob = await response.blob()
  if (blob.size === 0 || blob.size > KYC_MAX_BYTES) return { ok: false, status: response.status, code: null, decode: true }
  return { ok: true, blob }
}

export type KycViewOutcome = { kind: "cancelled" } | { kind: "ok"; blob: Blob } | { kind: "error"; message: string }

/**
 * The step-up gate. The /view route requires step-up on the server; this
 * makes sure the console never even asks for the bytes without one:
 *
 *   · no open step-up window (per /me) → the OTP prompt FIRST; dismissed →
 *     "cancelled", and nothing is fetched;
 *   · the server still answers 403 STEP_UP_REQUIRED (the window lapsed
 *     between /me and the click) → the prompt once more and exactly one
 *     retry; dismissed → "cancelled".
 */
export async function viewKycDocument({
  stepUpWindowOpen,
  requestStepUp,
  fetchImage,
}: {
  stepUpWindowOpen: boolean
  requestStepUp: () => Promise<boolean>
  fetchImage: () => Promise<KycFetchResult>
}): Promise<KycViewOutcome> {
  if (!stepUpWindowOpen && !(await requestStepUp())) return { kind: "cancelled" }
  let result = await fetchImage()
  if (!result.ok && result.status === 403 && result.code === STEP_UP_REQUIRED) {
    if (!(await requestStepUp())) return { kind: "cancelled" }
    result = await fetchImage()
  }
  if (result.ok) return { kind: "ok", blob: result.blob }
  return { kind: "error", message: kycViewErrorMessage(result) }
}

// The window check is shared with every write that asks for the code first (lib/admin/stepUp.ts).
export { STEP_UP_MARGIN_MS, stepUpWindowOpen } from "./stepUp"

/* ── Keyboard ─────────────────────────────────────────────────────────── */

/** Ctrl/Cmd+S (save page) and Ctrl/Cmd+P (print) are swallowed while the viewer is open. */
export function isBlockedShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  if (!event.ctrlKey && !event.metaKey) return false
  const key = event.key.toLowerCase()
  return key === "s" || key === "p"
}

/* ── Watermark ────────────────────────────────────────────────────────── */

export const WATERMARK_TAG = "Momentum · KYC · view only"

const pad = (n: number) => String(n).padStart(2, "0")

/**
 * "2026-10-01 19:35 +05:30": the viewer's local wall-clock time with its
 * offset, so a copy says exactly when it was taken. `offsetMinutes` is east of
 * UTC (India is +330).
 */
export function formatWatermarkTime(at: Date, offsetMinutes = -at.getTimezoneOffset()): string {
  const local = new Date(at.getTime() + offsetMinutes * 60_000)
  const sign = offsetMinutes < 0 ? "-" : "+"
  const abs = Math.abs(offsetMinutes)
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ` +
    `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} ${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** Two lines per tile: who and when, then what this is. */
export function watermarkLines(viewer: string, at: Date, offsetMinutes?: number): [string, string] {
  const who = viewer.trim() || "unknown admin"
  return [`${who} · ${formatWatermarkTime(at, offsetMinutes)}`, WATERMARK_TAG]
}

export interface WatermarkLayout {
  /** Radians; the whole grid is rotated about the canvas centre. */
  angle: number
  centre: { x: number; y: number }
  /** Tile anchors in the ROTATED frame, relative to the centre. */
  tiles: { x: number; y: number }[]
  stepX: number
  stepY: number
}

export const WATERMARK_ANGLE = -Math.PI / 6
export const WATERMARK_MAX_TILES = 4000

/**
 * A brick grid of tiles, rotated by `angle` about the centre, that covers the
 * whole canvas whatever its shape: the grid spans the canvas's half-diagonal
 * (plus one step) in every direction of the rotated frame, which contains the
 * canvas at any angle. Steps grow if a very large canvas would need more than
 * WATERMARK_MAX_TILES.
 */
export function watermarkLayout(
  width: number,
  height: number,
  { stepX = 360, stepY = 120, angle = WATERMARK_ANGLE }: { stepX?: number; stepY?: number; angle?: number } = {},
): WatermarkLayout {
  const radius = Math.hypot(width, height) / 2
  let sx = stepX
  let sy = stepY
  const count = (a: number, b: number) => (2 * Math.ceil(radius / a + 1) + 1) * (2 * Math.ceil(radius / b + 1) + 1)
  while (count(sx, sy) > WATERMARK_MAX_TILES) {
    sx *= 1.25
    sy *= 1.25
  }
  const cols = Math.ceil(radius / sx + 1)
  const rows = Math.ceil(radius / sy + 1)
  const tiles: { x: number; y: number }[] = []
  for (let r = -rows; r <= rows; r++) {
    const shift = Math.abs(r) % 2 === 1 ? sx / 2 : 0
    for (let c = -cols; c <= cols; c++) tiles.push({ x: c * sx + shift, y: r * sy })
  }
  return { angle, centre: { x: width / 2, y: height / 2 }, tiles, stepX: sx, stepY: sy }
}

/** A canvas point in the rotated watermark frame (the inverse of the draw transform). */
export function toWatermarkFrame(layout: WatermarkLayout, x: number, y: number): { x: number; y: number } {
  const dx = x - layout.centre.x
  const dy = y - layout.centre.y
  const c = Math.cos(-layout.angle)
  const s = Math.sin(-layout.angle)
  return { x: dx * c - dy * s, y: dx * s + dy * c }
}

/** `rgb(r g b / a)` from a Momentum token triplet ("232 236 245"). */
export function tokenColour(triplet: string, alpha: number, fallback = "128 128 128"): string {
  const value = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/.test(triplet.trim()) ? triplet.trim() : fallback
  return `rgb(${value} / ${alpha})`
}

/** Font size for the watermark, in CSS pixels: readable on a small canvas, not a wall of text on a big one. */
export function watermarkFontPx(width: number, height: number): number {
  return Math.round(Math.min(22, Math.max(13, Math.min(width, height) / 26)))
}

/* ── Zoom and rotate ──────────────────────────────────────────────────── */

export type KycZoom = "fit" | 1 | 2
export type KycRotation = 0 | 90 | 180 | 270

export const KYC_ZOOMS: { value: KycZoom; label: string }[] = [
  { value: "fit", label: "Fit" },
  { value: 1, label: "100%" },
  { value: 2, label: "200%" },
]

export const nextRotation = (r: KycRotation): KycRotation => ((r + 90) % 360) as KycRotation

export interface ViewGeometry {
  /** Image pixels → CSS pixels. */
  scale: number
  angle: number
  /** The canvas's CSS size: the rotated image at that scale. */
  cssWidth: number
  cssHeight: number
}

/**
 * Where the image lands. Rotating 90° or 270° swaps its width and height;
 * "fit" scales the rotated image to fit the box; 100% and 200% are image
 * pixels at 1 and 2 CSS pixels each (the box scrolls).
 */
export function viewGeometry({
  imageWidth,
  imageHeight,
  rotation,
  zoom,
  boxWidth,
  boxHeight,
}: {
  imageWidth: number
  imageHeight: number
  rotation: KycRotation
  zoom: KycZoom
  boxWidth: number
  boxHeight: number
}): ViewGeometry {
  const quarter = rotation === 90 || rotation === 270
  const rw = quarter ? imageHeight : imageWidth
  const rh = quarter ? imageWidth : imageHeight
  const scale =
    zoom === "fit" ? (rw > 0 && rh > 0 && boxWidth > 0 && boxHeight > 0 ? Math.min(boxWidth / rw, boxHeight / rh) : 1) : zoom
  return {
    scale,
    angle: (rotation * Math.PI) / 180,
    cssWidth: Math.max(1, Math.round(rw * scale)),
    cssHeight: Math.max(1, Math.round(rh * scale)),
  }
}

/**
 * An image pixel's position on the canvas under the transform the viewer
 * draws with: translate(centre) · rotate(angle) · scale(s) · translate(-w/2, -h/2).
 */
export function projectImagePoint(g: ViewGeometry, imageWidth: number, imageHeight: number, x: number, y: number) {
  const px = (x - imageWidth / 2) * g.scale
  const py = (y - imageHeight / 2) * g.scale
  const c = Math.cos(g.angle)
  const s = Math.sin(g.angle)
  return { x: g.cssWidth / 2 + px * c - py * s, y: g.cssHeight / 2 + px * s + py * c }
}

/** Largest backing store the viewer allocates (browsers refuse much beyond this). */
export const CANVAS_MAX_SIDE = 8192
export const CANVAS_MAX_AREA = 32 * 1024 * 1024

/** Device pixels per CSS pixel for the backing store, lowered when the canvas would be too large. */
export function backingRatio(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const dpr = devicePixelRatio > 0 && Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1
  const bySide = CANVAS_MAX_SIDE / Math.max(cssWidth, cssHeight, 1)
  const byArea = Math.sqrt(CANVAS_MAX_AREA / Math.max(cssWidth * cssHeight, 1))
  return Math.min(dpr, bySide, byArea)
}

/* ── Drawing and disposal ─────────────────────────────────────────────── */

/** The slice of CanvasRenderingContext2D the viewer uses, so the drawing order can be tested with a recorder. */
export interface KycCanvasContext {
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  clearRect(x: number, y: number, w: number, h: number): void
  save(): void
  restore(): void
  translate(x: number, y: number): void
  rotate(angle: number): void
  scale(x: number, y: number): void
  drawImage(image: CanvasImageSource, dx: number, dy: number): void
  measureText(text: string): { width: number }
  fillText(text: string, x: number, y: number): void
  strokeText(text: string, x: number, y: number): void
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  fillStyle: string | CanvasGradient | CanvasPattern
  strokeStyle: string | CanvasGradient | CanvasPattern
  lineWidth: number
  lineJoin: CanvasLineJoin
}

/**
 * One full redraw: clear, the image under the zoom/rotate transform, then the
 * watermark over ALL of it. Every zoom, rotate and resize calls this, so there
 * is never a frame with the image and without the watermark.
 */
export function drawKycView({
  ctx,
  image,
  geometry,
  ratio,
  lines,
  ink,
  halo,
  fontFamily,
}: {
  ctx: KycCanvasContext
  image: CanvasImageSource & { width: number; height: number }
  geometry: ViewGeometry
  ratio: number
  lines: readonly string[]
  ink: string
  halo: string
  fontFamily: string
}): WatermarkLayout {
  const { cssWidth: w, cssHeight: h } = geometry
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, w, h)

  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(geometry.angle)
  ctx.scale(geometry.scale, geometry.scale)
  ctx.drawImage(image, -image.width / 2, -image.height / 2)
  ctx.restore()

  const fontPx = watermarkFontPx(w, h)
  const lineHeight = Math.round(fontPx * 1.35)
  ctx.font = `600 ${fontPx}px ${fontFamily || "sans-serif"}`
  const widest = Math.max(...lines.map((line) => ctx.measureText(line).width), 1)
  const layout = watermarkLayout(w, h, {
    stepX: Math.max(widest + fontPx * 3, 160),
    stepY: lineHeight * lines.length + fontPx * 3,
  })

  ctx.save()
  ctx.translate(layout.centre.x, layout.centre.y)
  ctx.rotate(layout.angle)
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineJoin = "round"
  ctx.lineWidth = Math.max(2, fontPx / 6)
  ctx.strokeStyle = halo
  ctx.fillStyle = ink
  for (const tile of layout.tiles) {
    lines.forEach((line, i) => {
      const y = tile.y + (i - (lines.length - 1) / 2) * lineHeight
      // A halo under the ink keeps the mark legible on a dark scan and a white page alike.
      ctx.strokeText(line, tile.x, y)
      ctx.fillText(line, tile.x, y)
    })
  }
  ctx.restore()
  return layout
}

/**
 * Closing the viewer: wipe the pixels, release the backing store (a 0×0
 * canvas), and close the decoded bitmap so nothing of the document is left in
 * the page's memory to fish out afterwards.
 */
export function disposeKycView(
  canvas: { width: number; height: number; getContext(type: "2d"): Pick<KycCanvasContext, "setTransform" | "clearRect"> | null } | null,
  bitmap: { close(): void } | null,
): void {
  if (canvas) {
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    canvas.width = 0
    canvas.height = 0
  }
  bitmap?.close()
}
