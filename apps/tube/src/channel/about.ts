/**
 * The one line of "about" that fits under a channel's name, and whether there
 * is more of it.
 *
 * ── Why a character count and not "did the CSS clamp it" ──────────────────
 * The truthful way to know whether `line-clamp-2` actually hid anything is to
 * measure the element after layout — `scrollHeight > clientHeight` — and that
 * is a layout read on every render, on a value that changes with the font,
 * the window width and whether the webfont has loaded yet. It also cannot run
 * on the server, so the first HTML would have no control and the button would
 * pop in a beat later, which is the flicker the whole zone avoids elsewhere.
 *
 * So the question is answered from the text instead, and the threshold is
 * chosen to be WRONG IN THE SAFE DIRECTION. At the header's width two lines
 * hold roughly 150 characters; 110 is comfortably under that, so a channel
 * whose about is genuinely two lines may be offered a "more" that reveals
 * little — a small anticlimax — while a channel with six paragraphs is never
 * left with no way to read them, which is the failure that matters. A newline
 * counts too: two short lines are already two lines, however few characters
 * they hold.
 *
 * Pure, and therefore tested rather than trusted. ./about.test.ts.
 */

/** Past this many characters, assume the clamp is hiding something. */
const ABOUT_CLAMP_CHARS = 110

export interface AboutSummary {
  /** The about with its edge whitespace gone. Empty when there is none. */
  text: string
  /** Is there anything to say at all? */
  present: boolean
  /** Should the header offer a way to see the rest? */
  expandable: boolean
}

export function aboutSummary(about: string | null | undefined): AboutSummary {
  const text = (about ?? "").trim()
  if (!text) return { text: "", present: false, expandable: false }
  // A hard line break makes it multi-line regardless of length, and a channel
  // whose about is three short lines is exactly the case a pure length test
  // would miss.
  const multiline = text.includes("\n")
  return {
    text,
    present: true,
    expandable: multiline || text.length > ABOUT_CLAMP_CHARS,
  }
}
