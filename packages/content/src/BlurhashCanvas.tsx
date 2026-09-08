"use client"

/**
 * The placeholder, painted from the hash.
 *
 * Two layers on purpose:
 *
 *   1. An inline `background-color` of the hash's AVERAGE colour. Present in
 *      the very first HTML — it needs no canvas and no JavaScript, so it is
 *      there on the server render and survives a browser that never runs the
 *      effect below.
 *   2. A 32x32 canvas painted on mount and scaled up by CSS. Thirty-two pixels
 *      because the image is a blur by construction: decoding at the card's
 *      real size would cost tens of milliseconds per post to produce a picture
 *      nobody could distinguish from this one.
 *
 * `aria-hidden`, always. It is the same picture as the image loading on top of
 * it, and announcing it would make a screen reader describe every photograph
 * twice — once as a placeholder with no description, once properly.
 */

import { useEffect, useRef } from "react"
import { blurhashAverageColor, decodeBlurhash, isValidBlurhash } from "./blurhash"

const RESOLUTION = 32

export interface BlurhashCanvasProps {
  hash?: string | null
  className?: string
}

export function BlurhashCanvas({ hash, className }: BlurhashCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const valid = isValidBlurhash(hash)
  const average = valid ? blurhashAverageColor(hash) : null

  useEffect(() => {
    if (!valid) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    try {
      const pixels = decodeBlurhash(hash, RESOLUTION, RESOLUTION)
      const image = ctx.createImageData(RESOLUTION, RESOLUTION)
      image.data.set(pixels)
      ctx.putImageData(image, 0, 0)
    } catch {
      // A malformed hash leaves the average colour showing, which is still
      // better than a grey box and is never worse than one.
    }
  }, [hash, valid])

  return (
    <div
      aria-hidden="true"
      className={`absolute inset-0 ${className ?? ""}`}
      // Not a token: this is a colour computed from the content itself, the
      // one case where a literal is not a palette decision. It falls back to
      // the sunken surface when there is no usable hash.
      style={average ? { backgroundColor: average } : undefined}
    >
      {!average && <div className="h-full w-full bg-mo-sunken" />}
      {valid && (
        <canvas
          ref={canvasRef}
          width={RESOLUTION}
          height={RESOLUTION}
          className="h-full w-full"
          // The browser's own upscaling does the blurring, for nothing.
          style={{ filter: "blur(1px)" }}
        />
      )}
    </div>
  )
}
