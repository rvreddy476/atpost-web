import { describe, expect, it } from "vitest"
import { containerForMime, containerOf, SNIFF_BYTES, sniffRefusal } from "./sniff"

/** `…ftyp<brand>` — the ISO base media header, with a plausible box length. */
function mp4Head(brand = "isom"): Uint8Array {
  const head = new Uint8Array(SNIFF_BYTES)
  head.set([0x00, 0x00, 0x00, 0x20], 0) // box length
  head.set([0x66, 0x74, 0x79, 0x70], 4) // "ftyp"
  for (let i = 0; i < 4; i++) head[8 + i] = brand.charCodeAt(i)
  return head
}

function webmHead(): Uint8Array {
  const head = new Uint8Array(SNIFF_BYTES)
  head.set([0x1a, 0x45, 0xdf, 0xa3], 0)
  return head
}

function junk(): Uint8Array {
  const head = new Uint8Array(SNIFF_BYTES)
  for (let i = 0; i < head.length; i++) head[i] = (i * 7 + 3) & 0xff
  return head
}

describe("containerOf", () => {
  // The four bytes before `ftyp` are the box LENGTH and vary, so the check
  // must start at offset 4 rather than matching from zero.
  it("finds ftyp at offset 4 whatever the box length is", () => {
    expect(containerOf(mp4Head())).toBe("mp4")
    const long = mp4Head()
    long.set([0x00, 0x00, 0x01, 0x8c], 0)
    expect(containerOf(long)).toBe("mp4")
  })

  it("recognises the QuickTime brand as the same family", () => {
    expect(containerOf(mp4Head("qt  "))).toBe("mp4")
  })

  it("recognises EBML", () => {
    expect(containerOf(webmHead())).toBe("webm")
  })

  it("calls anything else unknown rather than invalid", () => {
    expect(containerOf(junk())).toBe("unknown")
    expect(containerOf(new Uint8Array(0))).toBe("unknown")
    expect(containerOf(new Uint8Array(3))).toBe("unknown")
  })
})

describe("containerForMime", () => {
  it("maps the three types the server accepts", () => {
    expect(containerForMime("video/mp4")).toBe("mp4")
    expect(containerForMime("video/quicktime")).toBe("mp4")
    expect(containerForMime("video/webm")).toBe("webm")
  })

  it("is case-insensitive, because browsers are not consistent", () => {
    expect(containerForMime("VIDEO/MP4")).toBe("mp4")
  })

  it("implies nothing for a type it does not know", () => {
    expect(containerForMime("")).toBeNull()
    expect(containerForMime("application/octet-stream")).toBeNull()
  })
})

describe("sniffRefusal", () => {
  it("passes a file that is what it says it is", () => {
    expect(sniffRefusal(mp4Head(), "video/mp4")).toBeNull()
    expect(sniffRefusal(mp4Head("qt  "), "video/quicktime")).toBeNull()
    expect(sniffRefusal(webmHead(), "video/webm")).toBeNull()
  })

  // This is the case the browser found: 200 KB of filler named .mp4, which
  // uploads in full and is refused at confirm with a 500.
  it("refuses a file whose bytes contradict its type", () => {
    expect(sniffRefusal(webmHead(), "video/mp4")).toMatch(/not the video format/i)
    expect(sniffRefusal(mp4Head(), "video/webm")).toMatch(/not the video format/i)
  })

  // Fails OPEN, in both directions. Refusing something the server would have
  // taken is unappealable, and the person cannot find out they were wrong.
  it("allows a container it does not recognise", () => {
    expect(sniffRefusal(junk(), "video/mp4")).toBeNull()
  })

  it("allows a file whose declared type implies no container", () => {
    // Some browsers report an empty type for a .mov off a network drive.
    expect(sniffRefusal(junk(), "")).toBeNull()
    expect(sniffRefusal(webmHead(), "")).toBeNull()
  })

  it("allows a file too short to sniff", () => {
    expect(sniffRefusal(new Uint8Array(2), "video/mp4")).toBeNull()
  })
})
