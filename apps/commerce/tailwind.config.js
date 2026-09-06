const preset = require("@atpost/config/tailwind-preset")

/**
 * Commerce zone Tailwind config.
 *
 * The shared preset maps `brand-*` onto the --brand-* variables that
 * @atpost/ui reads; those are redefined for navy in this zone's globals.css,
 * which is what restyles the shared primitives here WITHOUT touching
 * packages/ui (and so without touching the admin console).
 *
 * The `shop-*` scale below is zone-local storefront vocabulary — ground,
 * surface, gold, and the light plate product photography sits on. It also
 * resolves to CSS variables in globals.css, so the palette stays in one file.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    // Include @atpost/ui source so its brand-* classes aren't purged.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        shop: {
          bg: "rgb(var(--shop-bg) / <alpha-value>)",
          surface: "rgb(var(--shop-surface) / <alpha-value>)",
          raised: "rgb(var(--shop-raised) / <alpha-value>)",
          sunken: "rgb(var(--shop-sunken) / <alpha-value>)",
          ink: "rgb(var(--shop-ink) / <alpha-value>)",
          muted: "rgb(var(--shop-muted) / <alpha-value>)",
          faint: "rgb(var(--shop-faint) / <alpha-value>)",
          gold: "rgb(var(--shop-gold) / <alpha-value>)",
          "gold-deep": "rgb(var(--shop-gold-deep) / <alpha-value>)",
          "gold-light": "rgb(var(--shop-gold-light) / <alpha-value>)",
          plate: "rgb(var(--shop-plate) / <alpha-value>)",
          "plate-ink": "rgb(var(--shop-plate-ink) / <alpha-value>)",
          good: "rgb(var(--shop-good) / <alpha-value>)",
          bad: "rgb(var(--shop-bad) / <alpha-value>)",
          warn: "rgb(var(--shop-warn) / <alpha-value>)",
        },
      },
      borderColor: {
        line: "var(--shop-line)",
        "line-strong": "var(--shop-line-strong)",
      },
    },
  },
}
