import { describe, expect, it, vi } from "vitest"
import {
  CANVAS_MAX_AREA,
  CANVAS_MAX_SIDE,
  KYC_DOCUMENT_LABELS,
  KYC_VIEW_MESSAGES,
  WATERMARK_MAX_TILES,
  WATERMARK_TAG,
  backingRatio,
  disposeKycView,
  drawKycView,
  fetchKycImage,
  formatWatermarkTime,
  isBlockedShortcut,
  kycDocumentLabel,
  kycDocumentViewPath,
  kycDocumentsPath,
  kycStatus,
  kycViewErrorMessage,
  nextRotation,
  parseKycDocuments,
  projectImagePoint,
  stepUpWindowOpen,
  toWatermarkFrame,
  tokenColour,
  viewGeometry,
  viewKycDocument,
  watermarkLayout,
  watermarkLines,
  type KycCanvasContext,
  type KycFetchResult,
  type KycRotation,
  type KycZoom,
} from "./kycView"

/**
 * Seller KYC documents are VIEW ONLY in the console (founder, 1 Oct 2026).
 * These are the rules that hold without a browser: the step-up comes before
 * any bytes, the errors say the right thing, the watermark covers the whole
 * canvas on every redraw, and closing leaves nothing behind.
 */

describe("routes", () => {
  it("are the pinned admin-service paths, with ids encoded", () => {
    expect(kycDocumentsPath("s-1")).toBe("/v1/admin/commerce/sellers/s-1/documents")
    expect(kycDocumentViewPath("s-1", "d-2")).toBe("/v1/admin/commerce/sellers/s-1/documents/d-2/view")
    expect(kycDocumentViewPath("a/b", "c?d")).toBe("/v1/admin/commerce/sellers/a%2Fb/documents/c%3Fd/view")
  })
})

describe("document labels", () => {
  it("names every document type commerce accepts", () => {
    const commerceTypes = [
      "gst_certificate",
      "pan_card",
      "aadhaar",
      "passport",
      "business_registration",
      "address_proof",
      "cancelled_cheque",
      "other",
    ]
    for (const type of commerceTypes) expect(KYC_DOCUMENT_LABELS[type]).toBeTruthy()
    expect(kycDocumentLabel("pan_card")).toBe("PAN card")
    expect(kycDocumentLabel("gst_certificate")).toBe("GST certificate")
    expect(kycDocumentLabel("cancelled_cheque")).toBe("Cancelled cheque")
    expect(kycDocumentLabel("aadhaar")).toBe("Aadhaar")
  })

  it("humanises a type it does not know rather than showing the raw key", () => {
    expect(kycDocumentLabel("trade_licence")).toBe("Trade licence")
    expect(kycDocumentLabel("")).toBe("Document")
  })

  it("labels and tones the verification statuses", () => {
    expect(kycStatus("verified")).toEqual({ label: "Verified", tone: "good" })
    expect(kycStatus("rejected")).toEqual({ label: "Rejected", tone: "bad" })
    expect(kycStatus("needs_correction")).toEqual({ label: "Needs correction", tone: "warn" })
    expect(kycStatus("pending").label).toBe("Pending")
  })
})

describe("parseKycDocuments", () => {
  it("reads the envelope and keeps only what the console shows", () => {
    const docs = parseKycDocuments({
      data: [
        { id: "d1", document_type: "pan_card", verification_status: "pending", uploaded_at: "2026-09-30T10:00:00Z", viewable: true, media_id: "m1", url: "https://x" },
        { id: "d2", document_type: "aadhaar", verification_status: "verified", viewable: false },
        { document_type: "passport" },
      ],
    })
    expect(docs).toEqual([
      { id: "d1", documentType: "pan_card", verificationStatus: "pending", uploadedAt: "2026-09-30T10:00:00Z", viewable: true },
      { id: "d2", documentType: "aadhaar", verificationStatus: "verified", uploadedAt: null, viewable: false },
    ])
  })

  it("treats anything but literal true as not viewable", () => {
    const [doc] = parseKycDocuments([{ id: "d1", viewable: "true" }])
    expect(doc.viewable).toBe(false)
  })

  it("reads nonsense as no documents", () => {
    expect(parseKycDocuments(null)).toEqual([])
    expect(parseKycDocuments({ data: { id: "x" } })).toEqual([])
  })
})

describe("kycViewErrorMessage", () => {
  it("says permission for a 403 and gone for a 404, exactly", () => {
    expect(kycViewErrorMessage({ status: 403, code: "PERMISSION_DENIED" })).toBe("You don't have permission to view KYC documents.")
    expect(kycViewErrorMessage({ status: 403 })).toBe("You don't have permission to view KYC documents.")
    expect(kycViewErrorMessage({ status: 404, code: "DOCUMENT_NOT_FOUND" })).toBe("This document is no longer available.")
  })

  it("keeps a lingering step-up refusal apart from a permission refusal", () => {
    expect(kycViewErrorMessage({ status: 403, code: "STEP_UP_REQUIRED" })).toBe(KYC_VIEW_MESSAGES.stepUp)
  })

  it("covers sign-out, undecodable bytes and everything else", () => {
    expect(kycViewErrorMessage({ status: 401 })).toBe(KYC_VIEW_MESSAGES.signedOut)
    expect(kycViewErrorMessage({ status: 200, decode: true })).toBe(KYC_VIEW_MESSAGES.unreadable)
    expect(kycViewErrorMessage({ status: 413 })).toBe(KYC_VIEW_MESSAGES.unreadable)
    expect(kycViewErrorMessage({ status: 502 })).toBe(KYC_VIEW_MESSAGES.failed)
    expect(kycViewErrorMessage({ status: null })).toBe(KYC_VIEW_MESSAGES.failed)
  })
})

describe("viewKycDocument: no bytes without a completed step-up", () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
  const ok: KycFetchResult = { ok: true, blob }
  const stepUpNeeded: KycFetchResult = { ok: false, status: 403, code: "STEP_UP_REQUIRED" }

  function harness(answers: boolean[], results: KycFetchResult[]) {
    const order: string[] = []
    const requestStepUp = vi.fn(async () => {
      order.push("step-up")
      return answers.shift() ?? false
    })
    const fetchImage = vi.fn(async () => {
      order.push("fetch")
      return results.shift() ?? ok
    })
    return { order, requestStepUp, fetchImage }
  }

  it("fetches nothing when the step-up prompt is dismissed", async () => {
    const h = harness([false], [ok])
    const outcome = await viewKycDocument({ stepUpWindowOpen: false, requestStepUp: h.requestStepUp, fetchImage: h.fetchImage })
    expect(outcome).toEqual({ kind: "cancelled" })
    expect(h.fetchImage).toHaveBeenCalledTimes(0)
    expect(h.order).toEqual(["step-up"])
  })

  it("asks for the step-up BEFORE the first fetch when no window is open", async () => {
    const h = harness([true], [ok])
    const outcome = await viewKycDocument({ stepUpWindowOpen: false, requestStepUp: h.requestStepUp, fetchImage: h.fetchImage })
    expect(outcome).toEqual({ kind: "ok", blob })
    expect(h.order).toEqual(["step-up", "fetch"])
  })

  it("uses an open step-up window without asking again", async () => {
    const h = harness([], [ok])
    await viewKycDocument({ stepUpWindowOpen: true, requestStepUp: h.requestStepUp, fetchImage: h.fetchImage })
    expect(h.order).toEqual(["fetch"])
  })

  it("re-prompts once and retries once when the window lapsed server-side, never a third fetch", async () => {
    const h = harness([true], [stepUpNeeded, stepUpNeeded, ok])
    const outcome = await viewKycDocument({ stepUpWindowOpen: true, requestStepUp: h.requestStepUp, fetchImage: h.fetchImage })
    expect(h.order).toEqual(["fetch", "step-up", "fetch"])
    expect(outcome).toEqual({ kind: "error", message: KYC_VIEW_MESSAGES.stepUp })
  })

  it("does not retry when that second prompt is dismissed", async () => {
    const h = harness([false], [stepUpNeeded, ok])
    const outcome = await viewKycDocument({ stepUpWindowOpen: true, requestStepUp: h.requestStepUp, fetchImage: h.fetchImage })
    expect(outcome).toEqual({ kind: "cancelled" })
    expect(h.fetchImage).toHaveBeenCalledTimes(1)
  })

  it("turns a refusal into its sentence", async () => {
    const forbidden = harness([], [{ ok: false, status: 403, code: "PERMISSION_DENIED" }])
    expect(await viewKycDocument({ stepUpWindowOpen: true, requestStepUp: forbidden.requestStepUp, fetchImage: forbidden.fetchImage })).toEqual({
      kind: "error",
      message: "You don't have permission to view KYC documents.",
    })
    const gone = harness([], [{ ok: false, status: 404, code: "DOCUMENT_NOT_FOUND" }])
    expect(await viewKycDocument({ stepUpWindowOpen: true, requestStepUp: gone.requestStepUp, fetchImage: gone.fetchImage })).toEqual({
      kind: "error",
      message: "This document is no longer available.",
    })
  })

  it("counts a window about to lapse as closed", () => {
    const now = 1_000_000
    expect(stepUpWindowOpen(null, now)).toBe(false)
    expect(stepUpWindowOpen(now + 5_000, now)).toBe(false)
    expect(stepUpWindowOpen(now - 1, now)).toBe(false)
    expect(stepUpWindowOpen(now + 120_000, now)).toBe(true)
  })
})

describe("fetchKycImage", () => {
  const image = () => new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } })

  it("sends the session cookie, refuses to follow a redirect and bypasses the cache", async () => {
    const fetchImpl = vi.fn(async () => image())
    const result = await fetchKycImage("/v1/x/view", fetchImpl as unknown as typeof fetch)
    expect(result.ok).toBe(true)
    const init = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.credentials).toBe("include")
    expect(init.redirect).toBe("error")
    expect(init.cache).toBe("no-store")
    expect(init.method).toBe("GET")
  })

  it("accepts only an image body", async () => {
    const html = vi.fn(async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }))
    expect(await fetchKycImage("/x", html as unknown as typeof fetch)).toEqual({ ok: false, status: 200, code: null, decode: true })
    const empty = vi.fn(async () => new Response(new Uint8Array([]), { status: 200, headers: { "content-type": "image/jpeg" } }))
    expect((await fetchKycImage("/x", empty as unknown as typeof fetch)).ok).toBe(false)
  })

  it("reads the error code from a JSON refusal", async () => {
    const refused = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "STEP_UP_REQUIRED", message: "x" } }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
    )
    expect(await fetchKycImage("/x", refused as unknown as typeof fetch)).toEqual({ ok: false, status: 403, code: "STEP_UP_REQUIRED" })
  })

  it("reports a network failure (or a refused redirect) as no status", async () => {
    const broken = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    expect(await fetchKycImage("/x", broken as unknown as typeof fetch)).toEqual({ ok: false, status: null, code: null })
  })
})

describe("isBlockedShortcut", () => {
  const key = (k: string, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ key: k, ctrlKey: false, metaKey: false, ...mods })

  it("swallows save and print with Ctrl or Cmd, either case", () => {
    expect(isBlockedShortcut(key("s", { ctrlKey: true }))).toBe(true)
    expect(isBlockedShortcut(key("S", { ctrlKey: true }))).toBe(true)
    expect(isBlockedShortcut(key("p", { metaKey: true }))).toBe(true)
    expect(isBlockedShortcut(key("P", { metaKey: true }))).toBe(true)
  })

  it("leaves everything else alone", () => {
    expect(isBlockedShortcut(key("s"))).toBe(false)
    expect(isBlockedShortcut(key("p"))).toBe(false)
    expect(isBlockedShortcut(key("c", { ctrlKey: true }))).toBe(false)
    expect(isBlockedShortcut(key("Escape"))).toBe(false)
  })
})

describe("watermark text", () => {
  const at = new Date("2026-10-01T14:05:00Z")

  it("formats the viewer's local time with its offset", () => {
    expect(formatWatermarkTime(at, 330)).toBe("2026-10-01 19:35 +05:30")
    expect(formatWatermarkTime(at, 0)).toBe("2026-10-01 14:05 +00:00")
    expect(formatWatermarkTime(at, -300)).toBe("2026-10-01 09:05 -05:00")
  })

  it("names the admin, the time and that this is a view-only KYC copy", () => {
    const lines = watermarkLines("ops@momentum.example", at, 330)
    expect(lines).toEqual(["ops@momentum.example · 2026-10-01 19:35 +05:30", "Momentum · KYC · view only"])
    expect(WATERMARK_TAG).toBe("Momentum · KYC · view only")
  })

  it("never draws an empty name", () => {
    expect(watermarkLines("  ", at, 0)[0]).toBe("unknown admin · 2026-10-01 14:05 +00:00")
  })

  it("draws in token colours, never a literal", () => {
    expect(tokenColour("241 238 248", 0.34)).toBe("rgb(241 238 248 / 0.34)")
    expect(tokenColour(" 13 12 20 ", 0.5)).toBe("rgb(13 12 20 / 0.5)")
    expect(tokenColour("", 0.3)).toBe("rgb(128 128 128 / 0.3)")
    expect(tokenColour("red; background:url(x)", 0.3)).toBe("rgb(128 128 128 / 0.3)")
  })
})

describe("watermarkLayout: the tiles cover the whole canvas", () => {
  const sizes: [number, number][] = [
    [120, 90],
    [800, 600],
    [1920, 400],
    [400, 3000],
    [2400, 2400],
  ]

  for (const [w, h] of sizes) {
    it(`leaves no point of a ${w}×${h} canvas more than one step from a tile`, () => {
      const layout = watermarkLayout(w, h, { stepX: 300, stepY: 110 })
      for (let i = 0; i <= 12; i++) {
        for (let j = 0; j <= 12; j++) {
          const p = toWatermarkFrame(layout, (w * i) / 12, (h * j) / 12)
          const near = layout.tiles.some((t) => Math.abs(t.x - p.x) <= layout.stepX && Math.abs(t.y - p.y) <= layout.stepY)
          expect(near).toBe(true)
        }
      }
    })
  }

  it("is a diagonal brick pattern: odd rows shifted by half a step", () => {
    const layout = watermarkLayout(600, 400, { stepX: 300, stepY: 100 })
    expect(layout.angle).toBeLessThan(0)
    expect(layout.angle).toBeGreaterThan(-Math.PI / 2)
    const row0 = layout.tiles.filter((t) => t.y === 0).map((t) => t.x)
    const row1 = layout.tiles.filter((t) => t.y === 100).map((t) => t.x)
    expect(row0).toContain(0)
    expect(row1).toContain(150)
    expect(row1).not.toContain(0)
  })

  it("widens its steps instead of drawing tens of thousands of tiles", () => {
    const layout = watermarkLayout(16000, 12000, { stepX: 200, stepY: 60 })
    expect(layout.tiles.length).toBeLessThanOrEqual(WATERMARK_MAX_TILES)
    expect(layout.stepX).toBeGreaterThan(200)
  })
})

describe("zoom and rotate geometry", () => {
  const img = { w: 1200, h: 800 }
  const box = { boxWidth: 600, boxHeight: 600 }

  it("fits the rotated image to the box", () => {
    const upright = viewGeometry({ imageWidth: img.w, imageHeight: img.h, rotation: 0, zoom: "fit", ...box })
    expect(upright.scale).toBeCloseTo(0.5)
    expect([upright.cssWidth, upright.cssHeight]).toEqual([600, 400])
    const turned = viewGeometry({ imageWidth: img.w, imageHeight: img.h, rotation: 90, zoom: "fit", ...box })
    expect(turned.scale).toBeCloseTo(0.5)
    expect([turned.cssWidth, turned.cssHeight]).toEqual([400, 600])
  })

  it("draws 100% at one CSS pixel per image pixel and 200% at two, whatever the box", () => {
    const one = viewGeometry({ imageWidth: img.w, imageHeight: img.h, rotation: 0, zoom: 1, ...box })
    expect([one.scale, one.cssWidth, one.cssHeight]).toEqual([1, 1200, 800])
    const two = viewGeometry({ imageWidth: img.w, imageHeight: img.h, rotation: 270, zoom: 2, ...box })
    expect([two.scale, two.cssWidth, two.cssHeight]).toEqual([2, 1600, 2400])
  })

  it("rotates a quarter turn at a time and comes back upright", () => {
    let r: KycRotation = 0
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      r = nextRotation(r)
      seen.push(r)
    }
    expect(seen).toEqual([90, 180, 270, 0])
  })

  it("lands the image's corners exactly on the canvas corners at every rotation and zoom", () => {
    const zooms: KycZoom[] = ["fit", 1, 2]
    const rotations: KycRotation[] = [0, 90, 180, 270]
    for (const zoom of zooms) {
      for (const rotation of rotations) {
        const g = viewGeometry({ imageWidth: img.w, imageHeight: img.h, rotation, zoom, ...box })
        const corners = [
          [0, 0],
          [img.w, 0],
          [0, img.h],
          [img.w, img.h],
        ].map(([x, y]) => projectImagePoint(g, img.w, img.h, x, y))
        const key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`
        expect(new Set(corners.map(key))).toEqual(new Set(["0,0", `${g.cssWidth},0`, `0,${g.cssHeight}`, `${g.cssWidth},${g.cssHeight}`]))
      }
    }
  })

  it("puts the top-left of the image at the top-right after a quarter turn clockwise", () => {
    const g = viewGeometry({ imageWidth: img.w, imageHeight: img.h, rotation: 90, zoom: 1, ...box })
    const p = projectImagePoint(g, img.w, img.h, 0, 0)
    expect([Math.round(p.x) + 0, Math.round(p.y) + 0]).toEqual([g.cssWidth, 0])
  })

  it("lowers the backing-store ratio before the canvas grows past what a browser allocates", () => {
    expect(backingRatio(800, 600, 2)).toBe(2)
    const r = backingRatio(8000, 6000, 2)
    expect(8000 * r).toBeLessThanOrEqual(CANVAS_MAX_SIDE)
    expect(8000 * r * 6000 * r).toBeLessThanOrEqual(CANVAS_MAX_AREA + 1)
    expect(backingRatio(100, 100, Number.NaN)).toBe(1)
  })
})

/** A 2D context that records what was drawn, in order. */
function recorder() {
  const calls: { op: string; args: unknown[] }[] = []
  const rec =
    (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args })
    }
  const ctx: KycCanvasContext = {
    setTransform: rec("setTransform"),
    clearRect: rec("clearRect"),
    save: rec("save"),
    restore: rec("restore"),
    translate: rec("translate"),
    rotate: rec("rotate"),
    scale: rec("scale"),
    drawImage: rec("drawImage"),
    fillText: rec("fillText"),
    strokeText: rec("strokeText"),
    measureText: (text: string) => ({ width: text.length * 7 }),
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "miter",
  }
  return { ctx, calls }
}

describe("drawKycView", () => {
  const image = { width: 1200, height: 800 } as unknown as CanvasImageSource & { width: number; height: number }
  const lines = watermarkLines("ops@momentum.example", new Date("2026-10-01T14:05:00Z"), 330)

  function draw(rotation: KycRotation, zoom: KycZoom) {
    const { ctx, calls } = recorder()
    const geometry = viewGeometry({ imageWidth: 1200, imageHeight: 800, rotation, zoom, boxWidth: 900, boxHeight: 600 })
    const layout = drawKycView({ ctx, image, geometry, ratio: 2, lines, ink: "rgb(1 2 3 / 0.3)", halo: "rgb(4 5 6 / 0.3)", fontFamily: "Figtree" })
    return { calls, layout, ctx }
  }

  it("clears, draws the image once, then the watermark over it", () => {
    const { calls, layout, ctx } = draw(0, "fit")
    expect(calls[0].op).toBe("setTransform")
    expect(calls[1].op).toBe("clearRect")
    const imageAt = calls.findIndex((c) => c.op === "drawImage")
    expect(calls.filter((c) => c.op === "drawImage")).toHaveLength(1)
    const firstText = calls.findIndex((c) => c.op === "fillText")
    expect(firstText).toBeGreaterThan(imageAt)
    expect(calls.filter((c) => c.op === "fillText")).toHaveLength(layout.tiles.length * lines.length)
    const texts = new Set(calls.filter((c) => c.op === "fillText").map((c) => c.args[0]))
    expect(texts).toEqual(new Set(lines))
    expect(ctx.fillStyle).toBe("rgb(1 2 3 / 0.3)")
  })

  it("redraws the watermark on every rotation and zoom", () => {
    for (const [rotation, zoom] of [
      [90, "fit"],
      [180, 1],
      [270, 2],
    ] as [KycRotation, KycZoom][]) {
      const { calls, layout } = draw(rotation, zoom)
      expect(calls.filter((c) => c.op === "fillText").length).toBe(layout.tiles.length * lines.length)
      expect(layout.tiles.length).toBeGreaterThan(0)
    }
  })
})

describe("disposeKycView", () => {
  it("wipes the canvas, frees its backing store and closes the bitmap", () => {
    const { ctx, calls } = recorder()
    const canvas = { width: 1200, height: 800, getContext: () => ctx }
    const bitmap = { close: vi.fn() }
    disposeKycView(canvas, bitmap)
    expect(calls.map((c) => c.op)).toEqual(["setTransform", "clearRect"])
    expect(calls[1].args).toEqual([0, 0, 1200, 800])
    expect([canvas.width, canvas.height]).toEqual([0, 0])
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it("still closes the bitmap when the canvas is already gone", () => {
    const bitmap = { close: vi.fn() }
    disposeKycView(null, bitmap)
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })
})
