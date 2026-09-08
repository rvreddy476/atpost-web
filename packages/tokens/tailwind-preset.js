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
