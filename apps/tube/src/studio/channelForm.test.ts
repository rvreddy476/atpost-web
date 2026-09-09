import { describe, expect, it } from "vitest"
import {
  CHANNEL_HANDLE_MAX,
  CHANNEL_HANDLE_MIN,
  CHANNEL_NAME_MAX,
  CHANNEL_NAME_MIN,
  handleNote,
  handleShapeError,
  nameShapeError,
} from "./channelForm"

describe("handleShapeError", () => {
  it("accepts the handle the test channel actually holds", () => {
    expect(handleShapeError("tubetest001")).toBeNull()
  })

  it("accepts dots and underscores in the middle", () => {
    expect(handleShapeError("call.userb")).toBeNull()
    expect(handleShapeError("a_b.c1")).toBeNull()
  })

  it("enforces the length bounds", () => {
    expect(handleShapeError("ab")).toMatch(new RegExp(`${CHANNEL_HANDLE_MIN}`))
    expect(handleShapeError("abc")).toBeNull()
    expect(handleShapeError("a".repeat(CHANNEL_HANDLE_MAX))).toBeNull()
    expect(handleShapeError("a".repeat(CHANNEL_HANDLE_MAX + 1))).toMatch(
      new RegExp(`${CHANNEL_HANDLE_MAX}`)
    )
  })

  // This is the exact case that makes the server's answer ambiguous:
  // `definitely-free-9931` is refused for its hyphens, not because anyone
  // holds it.
  it("refuses a hyphen, which is the trap the server's answer hides", () => {
    expect(handleShapeError("definitely-free-9931")).toMatch(/dots and underscores/i)
  })

  it("refuses a leading or trailing dot or underscore", () => {
    expect(handleShapeError(".leading")).not.toBeNull()
    expect(handleShapeError("trailing.")).not.toBeNull()
    expect(handleShapeError("_leading")).not.toBeNull()
    expect(handleShapeError("trailing_")).not.toBeNull()
  })

  it("says 'lowercase' rather than 'malformed' for a capital", () => {
    expect(handleShapeError("TubeTest")).toBe("A handle is lowercase.")
  })

  it("checks the length before the shape, so a half-typed handle reads sensibly", () => {
    expect(handleShapeError("A")).toMatch(new RegExp(`${CHANNEL_HANDLE_MIN}`))
  })

  it("refuses spaces and everything else", () => {
    for (const bad of ["two words", "emoji🎬here", "has/slash", "at@sign"]) {
      expect(handleShapeError(bad)).not.toBeNull()
    }
  })

  it("asks for something when there is nothing", () => {
    expect(handleShapeError("")).toBe("Pick a handle.")
  })
})

describe("nameShapeError", () => {
  it("enforces the bounds on the trimmed value", () => {
    expect(nameShapeError("  ab  ")).toMatch(new RegExp(`${CHANNEL_NAME_MIN}`))
    expect(nameShapeError("  abc  ")).toBeNull()
    expect(nameShapeError("a".repeat(CHANNEL_NAME_MAX))).toBeNull()
    expect(nameShapeError("a".repeat(CHANNEL_NAME_MAX + 1))).toMatch(
      new RegExp(`${CHANNEL_NAME_MAX}`)
    )
  })

  it("treats whitespace as empty", () => {
    expect(nameShapeError("   ")).toBe("Pick a channel name.")
  })
})

describe("handleNote", () => {
  it("says nothing at all for an empty field", () => {
    expect(handleNote({ handle: "", checking: false, available: null })).toBeNull()
  })

  // The shape wins over everything: no point saying "Checking…" for a handle
  // the server is not going to be asked about.
  it("reports the shape before anything else", () => {
    expect(
      handleNote({ handle: "bad-handle", checking: true, available: false })
    ).toEqual({ tone: "bad", text: expect.stringMatching(/dots and underscores/i) })
  })

  it("reports the check in progress", () => {
    expect(handleNote({ handle: "goodname", checking: true, available: null })).toEqual({
      tone: "muted",
      text: "Checking…",
    })
  })

  it("reports a free handle", () => {
    expect(handleNote({ handle: "goodname", checking: false, available: true })).toEqual({
      tone: "good",
      text: "Available.",
    })
  })

  it("offers a suggestion only when it differs from what was typed", () => {
    expect(
      handleNote({
        handle: "goodname",
        checking: false,
        available: false,
        suggestion: "goodname2",
      })
    ).toEqual({ tone: "bad", text: "Taken. goodname2 is free." })

    // The server echoes the input back as its own suggestion; "Taken.
    // goodname is free." reads as a bug.
    expect(
      handleNote({
        handle: "goodname",
        checking: false,
        available: false,
        suggestion: "goodname",
      })
    ).toEqual({ tone: "bad", text: "That handle is already taken. Try another." })
  })

  // A failed availability check is not a taken handle — the create call is the
  // authority, and blocking somebody over a network blip strands them here.
  it("says nothing when the check has no answer", () => {
    expect(handleNote({ handle: "goodname", checking: false, available: null })).toBeNull()
  })
})
