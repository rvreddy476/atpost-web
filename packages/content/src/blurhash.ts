/**
 * BlurHash, decoded.
 *
 * ── Why this is worth doing at all ────────────────────────────────────────
 * Every media item the feed returns carries a `blurhash`. It is roughly thirty
 * characters that already encode the picture's colours and rough composition,
 * computed once at upload. Rendering a grey rectangle over it is throwing away
 * a signal the server went to the trouble of producing — and the difference is
 * not cosmetic: a placeholder in the photograph's own colours makes the load
 * read as "arriving", where a grey box reads as "broken, probably".
 *
 * ── Why it is implemented here rather than installed ──────────────────────
 * The reference decoder is about ninety lines of arithmetic with no
 * dependencies and a frozen spec. Taking a package for it would add a
 * dependency to every zone that renders a picture, and — more to the point —
 * the algorithm is exactly the kind of thing that is easy to get subtly wrong
 * and impossible to notice, so it is better to have it where it can be tested
 * against known vectors than behind an import.
 *
 * Two details in here are the ones that go wrong when people transcribe it:
 *
 *   · The DC term is in sRGB and every AC term is in LINEAR light. Mixing them
 *     produces an image that is recognisably right but washed out, which looks
 *     like a design choice rather than a bug.
 *   · The basis function is cos(pi*x*i/width) * cos(pi*y*j/height) — the
 *     component indices multiply the PIXEL position, not the other way round.
 *
 * Nothing here touches the DOM; ./BlurhashCanvas does that.
 */

const DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

/** Base-83, the alphabet BlurHash uses so a hash is URL- and HTML-safe. */
function decode83(str: string): number {
  let value = 0
  for (const char of str) {
    const digit = DIGITS.indexOf(char)
    if (digit === -1) throw new Error(`invalid blurhash character: ${char}`)
    value = value * 83 + digit
  }
  return value
}

/** sRGB 0..255 to linear 0..1. The transfer curve, not a divide by 255. */
function sRGBToLinear(value: number): number {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

/** Linear 0..1 back to sRGB 0..255, clamped. */
function linearTosRGB(value: number): number {
  const v = Math.max(0, Math.min(1, value))
  return v <= 0.0031308
    ? Math.round(v * 12.92 * 255 + 0.5)
    : Math.round((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5)
}

const signPow = (val: number, exp: number): number =>
  Math.sign(val) * Math.pow(Math.abs(val), exp)

function decodeDC(value: number): [number, number, number] {
  return [
    sRGBToLinear(value >> 16),
    sRGBToLinear((value >> 8) & 255),
    sRGBToLinear(value & 255),
  ]
}

function decodeAC(value: number, maximumValue: number): [number, number, number] {
  const quantR = Math.floor(value / (19 * 19))
  const quantG = Math.floor(value / 19) % 19
  const quantB = value % 19
  return [
    signPow((quantR - 9) / 9, 2) * maximumValue,
    signPow((quantG - 9) / 9, 2) * maximumValue,
    signPow((quantB - 9) / 9, 2) * maximumValue,
  ]
}

/**
 * Is this a hash we can decode?
 *
 * Called before decoding rather than relying on a throw because a malformed
 * hash from the server must produce a plain surface, not a broken card. The
 * length check is the real test: the number of components is encoded in the
 * first character and the string length has to match it exactly.
 */
export function isValidBlurhash(blurhash: string | undefined | null): blurhash is string {
  if (!blurhash || blurhash.length < 6) return false
  try {
    const sizeFlag = decode83(blurhash[0])
    const numY = Math.floor(sizeFlag / 9) + 1
    const numX = (sizeFlag % 9) + 1
    return blurhash.length === 4 + 2 * numX * numY
  } catch {
    return false
  }
}

/**
 * Decode to RGBA pixels.
 *
 * `width`/`height` are the size of the OUTPUT, and should be tiny — 32x32 is
 * plenty, because the result is blurred by definition and will be scaled up by
 * the browser for free. The cost is O(width * height * components), so asking
 * for the card's real pixel size would burn milliseconds per post to produce
 * exactly the same picture.
 */
export function decodeBlurhash(
  blurhash: string,
  width: number,
  height: number,
  punch = 1
): Uint8ClampedArray {
  if (!isValidBlurhash(blurhash)) throw new Error("invalid blurhash")

  const sizeFlag = decode83(blurhash[0])
  const numY = Math.floor(sizeFlag / 9) + 1
  const numX = (sizeFlag % 9) + 1

  const quantisedMaximumValue = decode83(blurhash[1])
  const maximumValue = (quantisedMaximumValue + 1) / 166

  const colors: [number, number, number][] = new Array(numX * numY)
  // The DC term carries the average colour and is packed as sRGB; every AC
  // term after it is a linear-light offset from it.
  colors[0] = decodeDC(decode83(blurhash.substring(2, 6)))
  for (let i = 1; i < numX * numY; i++) {
    const value = decode83(blurhash.substring(4 + i * 2, 6 + i * 2))
    colors[i] = decodeAC(value, maximumValue * punch)
  }

  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis =
            Math.cos((Math.PI * x * i) / width) * Math.cos((Math.PI * y * j) / height)
          const color = colors[i + j * numX]
          r += color[0] * basis
          g += color[1] * basis
          b += color[2] * basis
        }
      }
      const index = 4 * (x + y * width)
      pixels[index] = linearTosRGB(r)
      pixels[index + 1] = linearTosRGB(g)
      pixels[index + 2] = linearTosRGB(b)
      pixels[index + 3] = 255
    }
  }
  return pixels
}

/**
 * The hash's single average colour, as a CSS rgb() string.
 *
 * A one-pixel decode, essentially free, and it is what makes the placeholder
 * work before a canvas has painted — and on the server, where there is no
 * canvas at all. So the first HTML the browser receives already has the
 * photograph's colour in it, and the canvas only sharpens it.
 */
export function blurhashAverageColor(blurhash: string): string | null {
  if (!isValidBlurhash(blurhash)) return null
  try {
    const [r, g, b] = decodeDC(decode83(blurhash.substring(2, 6)))
    return `rgb(${linearTosRGB(r)}, ${linearTosRGB(g)}, ${linearTosRGB(b)})`
  } catch {
    return null
  }
}
