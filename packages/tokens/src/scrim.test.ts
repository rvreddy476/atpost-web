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
 *
 * ── Why a package with no JavaScript has a `src/` ─────────────────────────
 * Because both runners look for one. `scripts/run-bun-tests.ts` skips any
 * workspace with no `src/` and then runs `bun test --preload <shim> src`, so
 * this file at the package root was invisible to `bun run test:bun tokens` —
 * which reported zero files and a green table, the worst shape a test can
 * have. The runner's rule is a reasonable one and every other workspace
 * already obeys it; this was the single exception, so the exception moved
 * rather than the rule. Nothing here is published: `files` in package.json
 * lists the stylesheet and the preset and nothing else, so the package still
 * ships no JavaScript.
 */

import { describe, expect, it } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

/** The package root, one up from here — where the two shipped files live. */
const PKG = join(import.meta.dir, "..")
const css = readFileSync(join(PKG, "tokens.css"), "utf8")
const preset = readFileSync(join(PKG, "tailwind-preset.js"), "utf8")

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

/**
 * Before any of the token assertions: does the sheet PARSE?
 *
 * Every test in this file greps text, and text is not what a browser loads.
 * Writing this one cost a stray comment terminator in the middle of a comment
 * block, three lines above the scrim. The sheet still "contained" it, so
 * every assertion below passed — and the browser, recovering from the bad
 * declaration by skipping to the next semicolon, swallowed `--mo-scrim` with
 * it. The token resolved to nothing, `bg-mo-scrim/[0.92]` painted
 * `rgba(0, 0, 0, 0)`, and the veil was gone. The neighbouring
 * `--mo-on-scrim` on the next line was untouched, which is what makes this so
 * quiet: the failure is one token wide and leaves no mark anywhere.
 *
 * So the grammar gets checked too. It is the same deliberately simple grammar
 * `block()` below assumes — this sheet has no nesting and no at-rule wrapping
 * a token block — and the point is not to be a CSS parser but to notice that
 * the file has stopped being the shape everything else here relies on.
 */
describe("tokens.css", () => {
  /** The sheet with every comment blanked out, line numbers preserved. */
  const stripped = (() => {
    let out = ""
    for (let i = 0; i < css.length; ) {
      if (css.startsWith("/*", i)) {
        const end = css.indexOf("*/", i + 2)
        expect(end, `unterminated comment near line ${css.slice(0, i).split("\n").length}`).toBeGreaterThan(-1)
        out += css.slice(i, end + 2).replace(/[^\n]/g, " ")
        i = end + 2
      } else {
        out += css[i]
        i++
      }
    }
    return out
  })()

  it("has no stray comment terminator", () => {
    // The exact bug above: a `*/` that survives the strip is one that never
    // opened, so everything after it until the next `;` is being read as CSS.
    const at = stripped.indexOf("*/")
    const line = at < 0 ? null : stripped.slice(0, at).split("\n").length
    expect(line, "stray */ outside any comment").toBeNull()
  })

  it("contains nothing but selectors, declarations and braces", () => {
    const strays: string[] = []
    let depth = 0
    stripped.split("\n").forEach((raw, index) => {
      const line = raw.trim()
      if (!line) return
      if (line.endsWith("{")) return void depth++
      if (line === "}") return void depth--
      // A declaration ends in a semicolon; a selector waiting for the rest of
      // its comma-separated list ends in a comma, and does so at both depths —
      // `.mo-light,` at the top level and `.mo-root *,` inside the
      // reduced-motion at-rule. Those two endings are the whole grammar. Prose
      // that has escaped a comment ends in a word or a full stop, which is
      // exactly what this catches.
      if (!line.endsWith(";") && !line.endsWith(",")) {
        strays.push(`line ${index + 1}: ${line.slice(0, 72)}`)
      }
    })
    expect(strays).toEqual([])
    expect(depth, "unbalanced braces").toBe(0)
  })
})

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
 * The veil's SECOND ink, and it is the same property as the first.
 *
 * `--mo-on-scrim-body` is what a quieter word on a veil takes — a total
 * duration beside a running clock, a chapter name, a settings row's current
 * value. It has to be declared exactly where the scrim is, and nowhere else,
 * for exactly the same reason: a veil is dark in both themes, so its inks are
 * too, and the moment this one is redeclared under `.mo-light` it becomes a
 * near-black word on a near-black veil. That is the failure the component this
 * token was cut for actually had — `--mo-body` over a white video frame
 * measures 1.63 — so the invariant is worth holding here rather than
 * rediscovering there.
 */
describe("--mo-on-scrim-body", () => {
  it("is declared exactly once, in :root and not in .mo-light", () => {
    expect(declarations("--mo-on-scrim-body")).toHaveLength(1)
    expect(block(":root")).toContain("--mo-on-scrim-body:")
    expect(block(".mo-light")).not.toContain("--mo-on-scrim-body:")
  })

  it("is a bare triplet, lighter than the veil and quieter than its ink", () => {
    const channels = (value: string) => value.split(/\s+/).map(Number)
    const [value] = declarations("--mo-on-scrim-body")
    expect(value).toMatch(/^\d+ \d+ \d+$/)

    const secondary = channels(value)
    const primary = channels(declarations("--mo-on-scrim")[0])
    const veil = channels(declarations("--mo-scrim")[0])

    // Light enough to read on a dark veil, and a real step below the primary
    // ink rather than a second copy of it — otherwise the hierarchy the token
    // exists to express does not exist.
    expect(Math.min(...secondary)).toBeGreaterThan(Math.max(...veil))
    for (let i = 0; i < 3; i++) expect(secondary[i]).toBeLessThan(primary[i])
  })

  it("is named by the preset in the alpha-capable form", () => {
    expect(preset).toContain('"on-scrim-body": "rgb(var(--mo-on-scrim-body) / <alpha-value>)"')
  })
})

/**
 * The accent, and the property that is the MIRROR of the scrim's.
 *
 * The scrim is declared once because it is the same colour in both themes.
 * The accent must be declared TWICE — once per scope — because it is the same
 * JOB in both themes and a different hue in each, and a component that draws an
 * unread count cannot know which scope it is mounted under. A pair that exists
 * in only one scope renders `rgba(0, 0, 0, 0)` in the other, which is a silent
 * failure rather than a loud one: the badge is not wrong, it is absent.
 *
 * That is what `@momentum/notifications` hit under `apps/tube`'s `.mo-root`,
 * and it is why the bell carried a `var(--mo-accent, var(--mo-cyan))` chain for
 * a while. This test is what lets that chain stay deleted.
 */
describe("--mo-accent", () => {
  it("is declared in BOTH scopes, unlike the scrim", () => {
    for (const name of ["--mo-accent", "--mo-on-accent"]) {
      expect(declarations(name), name).toHaveLength(2)
      expect(block(":root"), name).toContain(`${name}:`)
      expect(block(".mo-light"), name).toContain(`${name}:`)
    }
  })

  it("is a bare triplet in both, and carries a dark ink in both", () => {
    const channels = (value: string) => value.split(/\s+/).map(Number)
    for (const name of ["--mo-accent", "--mo-on-accent"]) {
      for (const value of declarations(name)) expect(value, name).toMatch(/^\d+ \d+ \d+$/)
    }
    // Never white on the accent — 3.77 on the light theme's orange, and the
    // same sentence this sheet has carried about gold since the beginning.
    for (const value of declarations("--mo-on-accent")) {
      expect(Math.max(...channels(value)), value).toBeLessThan(64)
    }
  })

  it("is named by the preset in the alpha-capable form", () => {
    expect(preset).toContain('accent: "rgb(var(--mo-accent) / <alpha-value>)"')
    expect(preset).toContain('"on-accent": "rgb(var(--mo-on-accent) / <alpha-value>)"')
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
    "../player/src/SettingsMenu.tsx",
  ]

  for (const relative of files) {
    it(relative.split("/").pop() as string, () => {
      const source = readFileSync(join(PKG, relative), "utf8")
      // Class strings only. The comments in these files discuss `bg-mo-bg/60`
      // by name — they are the record of why it is wrong — so the match has to
      // be anchored to something a comment does not contain.
      //
      // That anchor is the DOUBLE QUOTE, not `className=`. It used to be the
      // latter, and SettingsMenu slipped past it for exactly that reason: it
      // builds its classes as `className={[ "...", "..." ].join(" ")}`, so the
      // offending `bg-mo-bg/92` sat in an array element and not directly after
      // the prop. Every comment in these files writes the token inside
      // backticks in a prose line with no double quote on it, so a
      // double-quoted single-line string literal is the shape that means
      // "class string" here and only that.
      const offenders = [...source.matchAll(/"[^"\n]*\bbg-mo-bg\/\d+[^"\n]*"/g)]
      expect(offenders.map((m) => m[0])).toEqual([])
    })
  }

  /**
   * And the failure one step past that one, which is worse because it is
   * silent in a different way.
   *
   * SettingsMenu veiled with `bg-mo-bg/92`. Both halves of that are wrong, and
   * only the first half is what the tests above look for: 92 is not a step in
   * Tailwind's opacity scale, which runs in fives, so the utility matched
   * nothing and emitted NO CSS AT ALL. The menu had no ground in any zone, and
   * nothing anywhere said so — not the compiler, not the linter, not a review
   * reading a class string that looks exactly like a working one.
   *
   * A veil that does not exist is the same outcome as a veil tinted with the
   * page, so it belongs in the same file. Arbitrary alphas are still available
   * and still correct — they are written `/[0.92]` — and that bracketed form is
   * what this allows through.
   */
  it("uses only alphas Tailwind's opacity scale actually contains", () => {
    const offenders: string[] = []
    for (const relative of files) {
      const source = readFileSync(join(PKG, relative), "utf8")
      // Same anchor as above, and it matters more here: these files discuss
      // `bg-mo-bg/92` by name in the comment recording why it was wrong, so a
      // scan of the raw source would fail on its own evidence.
      for (const literal of source.matchAll(/"[^"\n]*"/g)) {
        for (const m of literal[0].matchAll(/\b(?:bg|text|border|from|via|to)-mo-[a-z-]+\/(\d+)\b/g)) {
          if (Number(m[1]) % 5 !== 0) offenders.push(`${relative}  ${m[0]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
