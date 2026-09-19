/**
 * The composer's rules, checked against the SERVER's rules.
 *
 * Every case here exists because post-service would refuse the same thing, and
 * the useful question about each is "does this client agree with Go". A rule
 * that only lives in the dialog can only be checked by driving the dialog; a
 * rule that disagrees with the server produces a 400 the person cannot act on.
 *
 * The one rule that is this client's own — photos or one video, never both —
 * is marked as such, with the reason it exists.
 */

import { describe, expect, it } from "vitest"
import { MAX_ATTACHMENTS, MAX_TEXT_RUNES } from "./api"
import {
  EMPTY_DRAFT,
  VISIBILITY_OPTIONS,
  classifyFile,
  createFailureMessage,
  draftProblem,
  hasUnsavedWork,
  postTypeOf,
  textLength,
  uploadFailureMessage,
  type Draft,
  type DraftAttachment,
} from "./draft"

const ACCEPTED = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const

/** An attachment without touching `File`, which bun's runtime has but which
 *  this module only ever reads three fields of. */
function attach(kind: "image" | "video", name = `${kind}.bin`): DraftAttachment {
  return {
    key: `${name}:${kind}`,
    kind,
    previewUrl: `blob:${name}`,
    file: { name, size: 10, type: "", lastModified: 0 } as unknown as File,
  }
}

function draft(over: Partial<Draft> = {}): Draft {
  return { ...EMPTY_DRAFT, ...over }
}

describe("textLength", () => {
  it("counts CODE POINTS, the way Go and Android count them", () => {
    // The whole reason this is not `.length`. An emoji is one code point and
    // two UTF-16 units, so `.length` would charge twice for it — and against a
    // 5,000 ceiling that is a limit that gets stricter the further from ASCII
    // somebody writes. `MaxPostTextRunes`'s own comment names the same
    // problem for bytes and Devanagari.
    expect("👍".length).toBe(2)
    expect(textLength("👍")).toBe(1)
    expect(textLength("नमस्ते")).toBe([..."नमस्ते"].length)
  })
})

describe("draftProblem", () => {
  it("refuses a draft with nothing in it", () => {
    expect(draftProblem(EMPTY_DRAFT)).not.toBeNull()
  })

  it("treats whitespace-only text as empty, exactly as ValidatePostContent does", () => {
    // "a post containing three spaces is not content" — create_guards.go.
    expect(draftProblem(draft({ text: "   " }))).not.toBeNull()
    expect(draftProblem(draft({ text: "\t\n  \r\n" }))).not.toBeNull()
  })

  it("accepts text alone, and media alone", () => {
    expect(draftProblem(draft({ text: "hello" }))).toBeNull()
    expect(draftProblem(draft({ attachments: [attach("image")] }))).toBeNull()
    // Media with whitespace-only text is still fine: the server's rule is
    // "text OR media", not "text AND media".
    expect(draftProblem(draft({ text: "  ", attachments: [attach("image")] }))).toBeNull()
  })

  it("refuses text over the ceiling, and accepts text exactly at it", () => {
    expect(draftProblem(draft({ text: "x".repeat(MAX_TEXT_RUNES) }))).toBeNull()
    expect(draftProblem(draft({ text: "x".repeat(MAX_TEXT_RUNES + 1) }))).not.toBeNull()
  })

  it("counts the RAW text against the ceiling, not the trimmed copy", () => {
    // `ValidatePostContent` says so in a comment: the ceiling is about what
    // gets stored, and the stored value is what the client sent. A draft of
    // 5,000 x's plus a trailing space is over.
    expect(draftProblem(draft({ text: `${"x".repeat(MAX_TEXT_RUNES)} ` }))).not.toBeNull()
  })

  it("refuses more attachments than the handler will take", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => attach("image", `i${i}.jpg`))
    expect(draftProblem(draft({ attachments: many }))).toBeNull()
    expect(
      draftProblem(draft({ attachments: [...many, attach("image", "one-too-many.jpg")] }))
    ).not.toBeNull()
  })

  it("refuses a video beside photos — this client's own rule", () => {
    // post-service would ACCEPT it: `checkMediaCompatibility` only refuses a
    // kind mismatch. It is refused here because `resolveVideoContentType`
    // would then classify the whole post from that video and send a photo
    // album to Reels or Tube. See the note at the branch.
    expect(draftProblem(draft({ attachments: [attach("image"), attach("video")] }))).not.toBeNull()
    expect(draftProblem(draft({ attachments: [attach("video"), attach("video", "b.mp4")] }))).not.toBeNull()
    expect(draftProblem(draft({ attachments: [attach("video")] }))).toBeNull()
  })
})

describe("postTypeOf", () => {
  it("is what stops a video being refused outright", () => {
    // `checkMediaCompatibility` refuses a VIDEO on `post_type: "text"` and
    // refuses a non-image on `"image"`. These three are the mapping that
    // avoids both.
    expect(postTypeOf(draft({ text: "hi" }))).toBe("text")
    expect(postTypeOf(draft({ attachments: [attach("image")] }))).toBe("image")
    expect(postTypeOf(draft({ attachments: [attach("video")] }))).toBe("video")
  })
})

describe("hasUnsavedWork", () => {
  it("is what decides whether Escape asks before discarding", () => {
    expect(hasUnsavedWork(EMPTY_DRAFT)).toBe(false)
    // Whitespace is not work. A dialog that argues about closing an empty box
    // is a dialog people learn to fight.
    expect(hasUnsavedWork(draft({ text: "   " }))).toBe(false)
    expect(hasUnsavedWork(draft({ text: "a" }))).toBe(true)
    expect(hasUnsavedWork(draft({ attachments: [attach("image")] }))).toBe(true)
  })
})

describe("classifyFile", () => {
  const file = (name: string, type: string) =>
    ({ name, type, size: 1, lastModified: 0 }) as unknown as File

  it("takes the types the pipeline has been exercised with", () => {
    expect(classifyFile(file("a.jpg", "image/jpeg"), ACCEPTED)).toEqual({ kind: "image" })
    expect(classifyFile(file("a.mp4", "video/mp4"), ACCEPTED)).toEqual({ kind: "video" })
  })

  it("is not case sensitive about the mime type", () => {
    expect(classifyFile(file("a.PNG", "IMAGE/PNG"), ACCEPTED)).toEqual({ kind: "image" })
  })

  it("falls back to the extension when the browser reports no type at all", () => {
    // The `.mov` case, and the reason the fallback exists: some browsers
    // report an empty `type` for one until the file has been read.
    expect(classifyFile(file("clip.mov", ""), ACCEPTED)).toEqual({ kind: "video" })
    expect(classifyFile(file("photo.JPEG", ""), ACCEPTED)).toEqual({ kind: "image" })
  })

  it("refuses anything else, by name, rather than silently dropping it", () => {
    const verdict = classifyFile(file("notes.pdf", "application/pdf"), ACCEPTED)
    expect("problem" in verdict).toBe(true)
    if ("problem" in verdict) expect(verdict.problem).toContain("notes.pdf")
  })

  it("does not let an extension override a type the pipeline refuses", () => {
    // A `.jpg` that the browser says is a PDF is a PDF. The extension is only
    // consulted when there is NO type to consult.
    expect("problem" in classifyFile(file("a.jpg", "application/pdf"), ACCEPTED)).toBe(true)
  })
})

describe("VISIBILITY_OPTIONS", () => {
  it("is the four the server takes, widest first", () => {
    // `binding:"required,oneof=public followers private unlisted"`. A fifth
    // value here is a 400 INVALID_REQUEST for whoever picks it.
    expect(VISIBILITY_OPTIONS.map((o) => o.value)).toEqual([
      "public",
      "unlisted",
      "followers",
      "private",
    ])
  })

  it("gives every one of them a sentence", () => {
    // The whole reason the list is not four bare words: "Unlisted" means
    // nothing on its own, and a person choosing an audience is making a
    // decision they cannot take back for the people who already saw it.
    //
    // A full stop rather than a length: "Only you." is the shortest of the
    // four and is exactly right, so a minimum length would be a test that
    // pushes the copy around. What matters is that each one is a sentence.
    for (const option of VISIBILITY_OPTIONS) expect(option.hint.trim()).toMatch(/\.$/)
  })

  it("opens on Public, which is what the phone's audience sheet does", () => {
    expect(EMPTY_DRAFT.visibility).toBe("public")
  })
})

describe("createFailureMessage", () => {
  it("says something different for each of the server's own codes", () => {
    const codes = [
      "EMPTY_POST",
      "TEXT_TOO_LONG",
      "MEDIA_NOT_READY",
      "MEDIA_NOT_FOUND",
      "MEDIA_TYPE_MISMATCH",
      "DUPLICATE_MEDIA",
      "IDEMPOTENCY_KEY_REUSED",
      "RATE_LIMITED",
      "PAYLOAD_TOO_LARGE",
    ]
    const said = codes.map((code) => createFailureMessage({ status: 400, code }))
    // Every one of these means a different next step for the person, so no two
    // may collapse into one sentence.
    expect(new Set(said).size).toBe(codes.length)
  })

  it("tells an expired session apart by hand", () => {
    // Not "posting is broken" — "you are no longer who you were". The next
    // step is different, which is the whole reason 401 is special-cased.
    expect(createFailureMessage({ status: 401, code: null })).toContain("Sign in")
  })

  it("never prints the server's own message", () => {
    // Several of them are written for an operator and one is deliberately
    // vague so as not to disclose anything about another account's assets.
    const said = createFailureMessage({ status: 403, code: "MEDIA_NOT_OWNED" })
    expect(said).not.toContain("media cannot be attached")
  })

  it("says something true when it recognises nothing", () => {
    const said = createFailureMessage({ status: 500, code: "WHAT_IS_THIS" })
    expect(said).toContain("Nothing was published")
  })
})

describe("uploadFailureMessage", () => {
  it("reads a 403 as the clock, which is what it almost always is", () => {
    // The signed URL lives fifteen minutes. "403" reads as "you are not
    // allowed to upload", which is the opposite of what is true.
    expect(uploadFailureMessage(403)).toContain("expired")
  })

  it("has something to say for a cross-origin failure with no status", () => {
    expect(uploadFailureMessage(0)).toContain("connection")
    expect(uploadFailureMessage(null)).toContain("connection")
  })
})
