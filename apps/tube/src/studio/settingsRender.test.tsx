import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { ReviewPreview } from "./ReviewPreview"
import { StepSettings } from "./StepSettings"
import { emptyDraft, type VideoDraft } from "./fields"

/**
 * The settings step and the review preview, rendered.
 *
 * `renderToStaticMarkup` and not a DOM: there is no jsdom in this workspace,
 * and the assertions that matter here are about what the markup SAYS and how
 * it is labelled, not about what happens when it is clicked. The behaviour
 * lives in ./fields.ts and ./machine.ts, which are asserted as functions.
 */

function draft(overrides: Partial<VideoDraft> = {}): VideoDraft {
  return { ...emptyDraft(), title: "A perfectly ordinary title", category: "education", ...overrides }
}

function settings(overrides: Partial<VideoDraft> = {}): string {
  return renderToStaticMarkup(
    <StepSettings draft={draft(overrides)} patch={() => {}} issues={[]} />
  )
}

/**
 * Is the radio with this `value` checked?
 *
 * Read by finding the `<input …>` tag rather than with one regex over the
 * whole document: React emits `checked=""` BEFORE `value="yes"`, attribute
 * order is not part of any contract, and a regex that assumed either order
 * would silently pass the day it changed.
 */
function radioChecked(html: string, value: string): boolean {
  const tag = html
    .split("<input")
    .map((chunk) => chunk.slice(0, chunk.indexOf(">")))
    .find((chunk) => chunk.includes(`value="${value}"`))
  return tag !== undefined && tag.includes("checked")
}

describe("StepSettings — who can see it", () => {
  // The founder's ask, in their words: "who can see, who cannot".
  it("offers exactly the four the server takes", () => {
    const html = settings()
    for (const label of ["Public", "Unlisted", "Followers", "Private"]) {
      expect(html).toContain(label)
    }
    // `"secret"` is 400 INVALID_REQUEST. Nothing may offer a fifth.
    expect(html).not.toContain("Secret")
  })

  it("explains each one in a sentence, not just a word", () => {
    const html = settings()
    expect(html).toContain("Anyone can find and watch it.")
    expect(html).toContain("Only people with the link")
    expect(html).toContain("Only people who follow you.")
    expect(html).toContain("Only you.")
  })

  it("asks the question as a real fieldset legend", () => {
    // `<fieldset>` + `<legend>` is what makes a screen reader announce the
    // question before the four answers.
    expect(settings()).toContain("<legend")
    expect(settings()).toContain("Who can watch this video")
  })

  it("warns that a narrower audience will not be made public", () => {
    expect(settings({ visibility: "private" })).toContain("will not be made public")
    expect(settings({ visibility: "public" })).not.toContain("will not be made public")
  })
})

describe("StepSettings — the rest of the founder's list", () => {
  it("groups comments as one question with three answers", () => {
    const html = settings()
    expect(html).toContain("Comments on")
    expect(html).toContain("Comments on, with approval")
    expect(html).toContain("Comments off")
  })

  it("offers sharing and reuse as their own card", () => {
    const html = settings()
    expect(html).toContain("Allow download")
    expect(html).toContain("Allow embedding")
    expect(html).toContain("Hide share button")
    expect(html).toContain("Remixing")
  })

  it("offers the two distribution switches in plain English", () => {
    const html = settings()
    expect(html).toContain("Tell my subscribers")
    expect(html).toContain("Show in the main feed")
  })

  it("draws the short preview disabled and says why", () => {
    // `create_reel_preview: true` is 400 UNSUPPORTED_DISTRIBUTION. A working
    // switch here would be a switch that fails the publish.
    const html = settings()
    expect(html).toContain("Also make a short preview")
    expect(html).toContain("Not available yet")
    expect(html).toContain("disabled")
  })

  it("carries both disclosures and the licence", () => {
    const html = settings()
    expect(html).toContain("Contains paid promotion")
    expect(html).toContain("Contains altered or synthetic content")
    expect(html).toContain("Licence")
  })

  it("asks the made-for-kids question with no default answer", () => {
    expect(settings()).toContain("Is this made for children?")
    // Neither radio is pre-selected. A default here would be a legal
    // declaration filed by a form rather than made by a person — and
    // `validateDraft` refuses to publish until one is chosen.
    expect(radioChecked(settings(), "yes")).toBe(false)
    expect(radioChecked(settings(), "no")).toBe(false)
    // The answer, once given, IS reflected.
    expect(radioChecked(settings({ madeForKids: true }), "yes")).toBe(true)
    expect(radioChecked(settings({ madeForKids: false }), "no")).toBe(true)
  })

  it("shows the date and time picker only once Schedule is chosen", () => {
    expect(settings({ scheduleMode: "now" })).not.toContain('type="datetime-local"')
    const scheduled = settings({ scheduleMode: "at" })
    expect(scheduled).toContain('type="datetime-local"')
    expect(scheduled).toContain("At least 5 minutes from now")
  })
})

describe("ReviewPreview", () => {
  const preview = (overrides: Partial<VideoDraft> = {}, coverUrl: string | null = null) =>
    renderToStaticMarkup(
      <ReviewPreview
        draft={draft(overrides)}
        coverUrl={coverUrl}
        channelName="The Workshop"
        channelRef="workshop"
      />
    )

  it("shows both places the video will be met", () => {
    const html = preview()
    expect(html).toContain("On the grid")
    expect(html).toContain("On the watch page")
  })

  it("crops the cover to 16:9 exactly as the card will", () => {
    const html = preview({}, "blob:local")
    expect(html).toContain("aspect-video")
    expect(html).toContain("object-cover")
  })

  it("says where the cover comes from when there is not one yet", () => {
    expect(preview()).toContain("Cover made from the video")
  })

  it("clamps the card title to two lines, as the grid does", () => {
    expect(preview()).toContain("line-clamp-2")
  })

  it("names the channel in both previews", () => {
    const html = preview()
    expect(html.match(/The Workshop/g)?.length).toBe(2)
    expect(html).toContain("@workshop")
  })

  it("marks a narrower audience on the watch header", () => {
    expect(preview({ visibility: "unlisted" })).toContain("Unlisted")
    // Public is the unremarkable case and gets no badge.
    expect(preview({ visibility: "public" })).not.toContain("Unlisted")
  })

  it("shows the hashtags the way the watch page will", () => {
    expect(preview({ hashtags: ["lathe", "restoration"] })).toContain("#lathe #restoration")
  })

  it("says plainly when there is no description", () => {
    expect(preview()).toContain("No description")
  })

  it("is not interactive — nothing on it can be focused or pressed", () => {
    const html = preview({}, "blob:local")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<a ")
  })
})
