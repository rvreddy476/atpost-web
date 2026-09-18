/**
 * @momentum/tokens — Tailwind preset.
 *
 * This file NAMES the variables declared in tokens.css. It never declares a
 * colour of its own, which is the point: there is one place a Momentum colour
 * is decided, and a zone that only wants the classes still has to import the
 * stylesheet for them to resolve to anything.
 *
 *   // tailwind.config.js
 *   module.exports = {
 *     presets: [
 *       require("@atpost/config/tailwind-preset"),
 *       require("@momentum/tokens/tailwind-preset"),
 *     ],
 *     content: ["./src/**\/*.{ts,tsx}"],
 *   }
 *
 *   // globals.css, before @tailwind base
 *   @import "@momentum/tokens/tokens.css";
 *
 * The `rgb(var(--x) / <alpha-value>)` form is what lets `bg-mo-surface/60`
 * work, and it is the convention the shop's own scale already uses — so the
 * two vocabularies compose rather than compete.
 *
 * ── The ember button is not a colour class ────────────────────────────────
 * The primary action is a gradient, so `bg-mo-primary` gets you the RED END
 * ONLY — the flat fallback, not the button. The real thing is
 * `bg-mo-ember` / `bg-mo-ember-hover` under backgroundImage, and it comes
 * with a size-and-weight obligation the utility cannot enforce: dark ink on
 * the red end measures 4.03, which is legible only as large text. Use
 * `text-mo-ember-label font-bold`, the `.mo-btn-primary` class in tokens.css,
 * or set >=18.66px bold yourself. A `bg-mo-ember` with a 14px label is an
 * accessibility bug that Tailwind will happily compile.
 *
 * ── mo-muted-lg carries its limit in its name ─────────────────────────────
 * `text-mo-muted-lg` is 3.57 on the ground and 3.01 on a card: large text and
 * non-text only, and it fails outright on `bg-mo-raised` (2.61). It replaced
 * the old `mo-faint`, which was safe for small text on the old near-black and
 * is not safe on this one. Small secondary text is `text-mo-body`.
 *
 * `mo-gold*` is included, but the variables behind it are declared only under
 * `.mo-commerce`. A gold class used outside that subtree resolves to nothing
 * and renders transparent, which is a loud enough failure to catch in review
 * and is deliberately not softened with a fallback.
 *
 * ── The light theme needs nothing from this file ──────────────────────────
 * `.mo-light` in tokens.css redefines the variables these classes already
 * name, so every utility below re-resolves inside a light zone with no new
 * class and no dark: variant — `bg-mo-bg` is white there, `bg-mo-ember` is the
 * green ramp, `border-mo` is a dark hairline, `shadow-mo` is the light
 * elevation. That is the whole reason the preset never declares a colour.
 *
 * One exception, and it is additive:
 *
 * `mo-accent` / `mo-on-accent` are THE attention colour, and the variables
 * behind them are declared in BOTH scopes — orange under `.mo-light`, the
 * dark theme's cyan in `:root`. That is unlike `mo-gold*`, deliberately: gold
 * means money and a zone outside the shop has no business painting it, but
 * every zone has unread counts, and a package that draws one cannot know
 * which scope it will be mounted under. tokens.css carries the argument.
 *
 * ── ORANGE CANNOT CARRY SMALL TEXT, AND THIS FILE CANNOT STOP YOU ─────────
 * `text-mo-accent` is 3.77 on white: large text (>=18.66px bold / >=24px) and
 * non-text ONLY. A `text-mo-accent text-sm` is an accessibility bug that
 * Tailwind will happily compile, exactly like `bg-mo-ember` with a 14px label.
 * The dark scope's cyan is 8.01 and asks no such question, which is exactly
 * why the constraint has to be written against the class rather than the
 * value: the same utility is safe in one zone and not in the other.
 * The sanctioned forms are `text-mo-accent text-mo-accent-label` for a word,
 * or — better, and legal at any size in either scope — `bg-mo-accent
 * text-mo-on-accent` for a badge, pill or count (4.72 light, 8.01 dark).
 * `text-white` on `bg-mo-accent` is 3.77 and is never correct.
 *
 * `mo-accent-label` is the 19px/700 floor for orange as text. It is the same
 * two variables as `mo-ember-label`, deliberately aliased rather than
 * duplicated: in a light zone the primary button no longer needs the floor
 * (white on the green ramp is 4.83 at its worst) and orange does, so the
 * constraint moved colours without moving values. The reasoning is in
 * tokens.css; the alias exists so the class you write says which rule you are
 * obeying.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        mo: {
          bg: "rgb(var(--mo-bg) / <alpha-value>)",
          surface: "rgb(var(--mo-surface) / <alpha-value>)",
          raised: "rgb(var(--mo-raised) / <alpha-value>)",
          sunken: "rgb(var(--mo-sunken) / <alpha-value>)",
          overlay: "rgb(var(--mo-overlay) / <alpha-value>)",

          ink: "rgb(var(--mo-ink) / <alpha-value>)",
          body: "rgb(var(--mo-body) / <alpha-value>)",
          // Large text (>=18.66px bold / >=24px) and non-text only. See above.
          "muted-lg": "rgb(var(--mo-muted-lg) / <alpha-value>)",

          // The flat ends of the ember ramp. `primary` is the red end, which
          // is both the gradient's start and its solid fallback.
          primary: "rgb(var(--mo-primary) / <alpha-value>)",
          "primary-to": "rgb(var(--mo-primary-to) / <alpha-value>)",
          "primary-hover": "rgb(var(--mo-primary-hover) / <alpha-value>)",
          "primary-hover-to": "rgb(var(--mo-primary-hover-to) / <alpha-value>)",
          "on-primary": "rgb(var(--mo-on-primary) / <alpha-value>)",

          // One job each — cyan is interactive, purple is presence. The
          // reasoning, and the measurements it rests on, are in tokens.css.
          cyan: "rgb(var(--mo-cyan) / <alpha-value>)",
          purple: "rgb(var(--mo-purple) / <alpha-value>)",

          // THE attention colour, in both scopes — unread marks, new/live
          // pills, count bubbles, active tab rules. Orange under `.mo-light`
          // and cyan under a bare `.mo-root`, same job either way. As a FILL
          // under `on-accent` it is legal at any size in both (4.72 light,
          // 8.01 dark); as TEXT on a ground, the LIGHT value is
          // large-text-and-non-text only (3.77 on white), so write the fill.
          accent: "rgb(var(--mo-accent) / <alpha-value>)",
          "on-accent": "rgb(var(--mo-on-accent) / <alpha-value>)",

          // The media veil, and the one pair here that is the SAME colour in
          // both scopes — `bg-mo-scrim/70` is dark on a white page too. Why a
          // scrim does not follow the theme is in tokens.css; what this file
          // has to add is that it is only ever used WITH an alpha, and that
          // the alphas were measured against pure white media, the worst
          // ground a veil can have: .60 is 4.68, .70 is 6.86, .80 is 10.02 and
          // .40 is 2.38 and may never carry a word.
          // Type on it is `text-mo-on-scrim` or `text-mo-on-scrim-body` and
          // nothing else — `text-mo-ink` and `text-mo-body` both flip dark in
          // a light zone and would be dark-on-dark here, which is the exact
          // failure the pair exists to prevent (`text-mo-body` over a white
          // frame measures 1.63).
          // `on-scrim-body` is the veil's SECONDARY voice, what `body` is to
          // `ink` on a ground: 5.11 on the thinnest band the player's control
          // gradient puts a word on (.736) over pure white media, 7.07 through
          // the middle of that row, 9.73 on a .92 veil. Below .70 it does not
          // clear 4.5 and nothing may be written on a veil that thin anyway.
          scrim: "rgb(var(--mo-scrim) / <alpha-value>)",
          "on-scrim": "rgb(var(--mo-on-scrim) / <alpha-value>)",
          "on-scrim-body": "rgb(var(--mo-on-scrim-body) / <alpha-value>)",

          good: "rgb(var(--mo-good) / <alpha-value>)",
          bad: "rgb(var(--mo-bad) / <alpha-value>)",
          warn: "rgb(var(--mo-warn) / <alpha-value>)",
          info: "rgb(var(--mo-info) / <alpha-value>)",

          // Commerce surfaces only — see the note above.
          gold: "rgb(var(--mo-gold) / <alpha-value>)",
          "gold-deep": "rgb(var(--mo-gold-deep) / <alpha-value>)",
          "gold-light": "rgb(var(--mo-gold-light) / <alpha-value>)",
          "on-gold": "rgb(var(--mo-on-gold) / <alpha-value>)",
        },
      },
      backgroundImage: {
        "mo-ember": "var(--mo-ember)",
        "mo-ember-hover": "var(--mo-ember-hover)",
      },
      borderColor: {
        mo: {
          DEFAULT: "var(--mo-line)",
          strong: "var(--mo-line-strong)",
          focus: "var(--mo-focus)",
          gold: "var(--mo-gold-line)",
        },
      },
      outlineColor: {
        mo: "var(--mo-focus)",
      },
      ringColor: {
        mo: "var(--mo-focus)",
      },
      borderRadius: {
        mo: "var(--mo-radius)",
        "mo-sm": "var(--mo-radius-sm)",
        "mo-lg": "var(--mo-radius-lg)",
        "mo-pill": "var(--mo-radius-pill)",
      },
      boxShadow: {
        mo: "var(--mo-shadow)",
        "mo-sm": "var(--mo-shadow-sm)",
        "mo-lift": "var(--mo-shadow-lift)",
        "mo-ember": "var(--mo-ember-glow)",
        "mo-ember-hover": "var(--mo-ember-glow-hover)",
      },
      fontFamily: {
        "mo-display": "var(--mo-font-display)",
        "mo-sans": "var(--mo-font-sans)",
        "mo-mono": "var(--mo-font-mono)",
      },
      fontSize: {
        // The minimum a label on the ember gradient may be set at.
        "mo-ember-label": [
          "var(--mo-ember-label-size)",
          { lineHeight: "1", fontWeight: "var(--mo-ember-label-weight)" },
        ],
        // The same two variables, named for the other rule they enforce: the
        // minimum size orange may be set at as TEXT in a light zone.
        "mo-accent-label": [
          "var(--mo-ember-label-size)",
          { lineHeight: "1", fontWeight: "var(--mo-ember-label-weight)" },
        ],
      },
      letterSpacing: {
        "mo-display": "var(--mo-tracking-display)",
        "mo-eyebrow": "var(--mo-tracking-eyebrow)",
      },
      transitionTimingFunction: {
        mo: "var(--mo-ease)",
      },
    },
  },
}
