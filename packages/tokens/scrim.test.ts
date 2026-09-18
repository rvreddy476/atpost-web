/**
 * The scrim, as an invariant of the stylesheet rather than a promise in a
 * comment.
 *
 * Everything else in this package is a colour decision, and a colour decision
 * that lives in a class string does not get a test — the class either resolves
 * or it does not, and the compiler and the page both say so. This one is
 * different in kind: `--mo-scrim` is the only token in the file whose
 * correctness is a RELATIONSHIP between two scopes, and the relationship is
 * invisible from either one of them on its own.
 *
 * The property is: declared once, in `:root`, and NOT redeclared in
 * `.mo-light`. That is what makes a veil over a photograph the same dark
 * colour on a white page as on a violet-black one, which is the whole point of
 * the token. And it is precisely the kind of thing a later reader "fixes" —
 * the light block is full of tokens that LOOK like duplicates of :root and are
 * not (the substitution trap), so somebody working through it with a
 * consistency pass in mind has every reason to add the missing pair, and the
 * result would be white-on-white text over bright media in the feed with no
 * error anywhere.
 *
 * The file is parsed rather than imported because it is CSS: this reads the
 * shipped artefact, so a test passing means the thing the browser loads has
 * the property, not that a fixture in this directory does.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

const css = readFileSync(join(import.meta.dir, "tokens.css"), "utf8")
const preset = readFileSync(join(import.meta.dir, "tailwind-preset.js"), "utf8")

/**
 * The body of one top-level rule, by selector.
 *
 * Deliberately simple: this sheet has no nesting and no at-rules wrapping a
 * token block, so "from the selector to the next `}` at the start of a line"
 * is the whole grammar that matters here. A parser would be more correct and
 * would also be a dependency this package does not have — it ships one
 * stylesheet and no JavaScript, and the test should not be the thing that
 * changes that.
 */
function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `no rule for ${selector}`).toBeGreaterThan(-1)
  const end = css.indexOf("\n}", start)
  expect(end, `unterminated rule for ${selector}`).toBeGreaterThan(start)
  return css.slice(start, end)
}

/** Every declaration of `name`, anywhere in the sheet, with its value. */
function declarations(name: string): string[] {
  const found: string[] = []
  const re = new RegExp(`^\\s*${name}:\\s*([^;]+);`, "gm")
  for (const match of css.matchAll(re)) found.push(match[1].trim())
  return found
}

describe("--mo-scrim", () => {
  it("is declared exactly once in the whole sheet", () => {
    // Once, not once-per-scope. A second declaration is the failure this file
    // exists to catch, wherever it is.
    expect(declarations("--mo-scrim")).toHaveLength(1)
    expect(declarations("--mo-on-scrim")).toHaveLength(1)
  })

  it("is declared in :root and not in .mo-light", () => {
    const root = block(":root")
    const light = block(".mo-light")

    expect(root).toContain("--mo-scrim:")
    expect(root).toContain("--mo-on-scrim:")
    expect(light).not.toContain("--mo-scrim:")
    expect(light).not.toContain("--mo-on-scrim:")
  })

  it("is dark, and its ink is light — in the only scope that declares them", () => {
    // Not a ratio assertion, which would be a second copy of a number the
    // comment already carries. This asserts the SHAPE the ratios depend on:
    // the veil is near-black and the type on it is near-white. A swap, or a
    // well-meaning "make the scrim follow the theme", fails here.
    const [scrim] = declarations("--mo-scrim")
    const [onScrim] = declarations("--mo-on-scrim")

    const channels = (value: string) => value.split(/\s+/).map(Number)
    const darkest = Math.max(...channels(scrim))
    const lightest = Math.min(...channels(onScrim))

    expect(darkest).toBeLessThan(32)
    expect(lightest).toBeGreaterThan(223)
  })

  it("is a bare triplet, because every use of it carries an alpha", () => {
    // `rgb(8 7 14)` would compile in the preset and then silently ignore
    // `/ <alpha-value>`, so `bg-mo-scrim/70` would paint an opaque veil over
    // the media it is supposed to sit on top of. Same failure shape the light
    // block's note describes for --brand-*: the wrong VALUE SHAPE, not the
    // wrong value.
    for (const name of ["--mo-scrim", "--mo-on-scrim"]) {
      const [value] = declarations(name)
      expect(value, name).toMatch(/^\d+ \d+ \d+$/)
    }
  })

  it("is named by the preset in the alpha-capable form", () => {
    expect(preset).toContain('scrim: "rgb(var(--mo-scrim) / <alpha-value>)"')
    expect(preset).toContain('"on-scrim": "rgb(var(--mo-on-scrim) / <alpha-value>)"')
  })
})

/**
 * The other half of the same property, from the consumers' side.
 *
 * A veil that is correct in tokens.css and a component that veils with
 * `bg-mo-bg/60` are not a working system, and the second one is what the code
 * actually looked like. This walks the packages that draw over media and
 * asserts that none of them has gone back to painting with the page.
 *
 * It is a grep, and a grep is a blunt instrument — but the thing being
 * asserted is genuinely lexical ("no component veils with the ground"), and a
 * rendering test could only catch it one component at a time.
 */
describe("no component veils media with the page ground", () => {
  const files = [
    "../content/src/CommentSheet.tsx",
    "../content/src/PostCard.tsx",
    "../content/src/PostCarousel.tsx",
    "../content/src/PostMedia.tsx",
  ]

  for (const relative of files) {
    it(relative.split("/").pop() as string, () => {
      const source = readFileSync(join(import.meta.dir, relative), "utf8")
      // Class strings only. The comments in these files discuss `bg-mo-bg/60`
      // by name — they are the record of why it is wrong — so the match has to
      // be anchored to something a comment does not contain.
      const offenders = [...source.matchAll(/className=(?:"|\{`)[^"`]*\bbg-mo-bg\/\d+/g)]
      expect(offenders.map((m) => m[0])).toEqual([])
    })
  }
})
