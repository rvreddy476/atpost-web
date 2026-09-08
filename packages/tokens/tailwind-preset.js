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
          muted: "rgb(var(--mo-muted) / <alpha-value>)",
          faint: "rgb(var(--mo-faint) / <alpha-value>)",

          primary: "rgb(var(--mo-primary) / <alpha-value>)",
          "primary-hover": "rgb(var(--mo-primary-hover) / <alpha-value>)",
          "primary-press": "rgb(var(--mo-primary-press) / <alpha-value>)",
          "on-primary": "rgb(var(--mo-on-primary) / <alpha-value>)",

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
      borderColor: {
        mo: {
          DEFAULT: "var(--mo-line)",
          strong: "var(--mo-line-strong)",
          gold: "var(--mo-gold-line)",
        },
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
      },
      fontFamily: {
        "mo-display": "var(--mo-font-display)",
        "mo-sans": "var(--mo-font-sans)",
        "mo-mono": "var(--mo-font-mono)",
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
