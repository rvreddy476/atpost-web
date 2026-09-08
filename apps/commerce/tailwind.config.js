const atpost = require("@atpost/config/tailwind-preset")
const momentum = require("@momentum/tokens/tailwind-preset")

/**
 * Commerce zone Tailwind config.
 *
 * Two presets, in this order — the same pairing apps/social uses.
 *
 * @atpost/config supplies the `brand-*` scale @atpost/ui renders through.
 * Those variables are no longer redefined by this zone: globals.css imports
 * @momentum/tokens, which points every one of them at a Momentum value, so a
 * shared Button, Input, Table or RoleSwitcher lands in the shop looking exactly
 * as it does in the feed. Deleting that navy override is a large part of what
 * stopped the shop reading as a second product.
 *
 * @momentum/tokens supplies the `mo-*` vocabulary. The shop does not need much
 * of it directly — its own `shop-*` scale below is an alias layer over the same
 * variables — but having it available means a new surface here can be built in
 * the platform's words instead of inventing a fourteenth grey.
 *
 * The `shop-*` scale is what six hundred lines of globals.css and fifty class
 * names in .tsx already speak. It resolves to CSS variables that now resolve to
 * Momentum's, so the palette still lives in exactly one file.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [atpost, momentum],
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
          overlay: "rgb(var(--shop-overlay) / <alpha-value>)",
          ink: "rgb(var(--shop-ink) / <alpha-value>)",
          // `muted` and `faint` are deliberately the same value now — Momentum
          // has two greys that may carry running text, not three. See the
          // header of globals.css. Both names are kept so no .tsx had to move.
          muted: "rgb(var(--shop-muted) / <alpha-value>)",
          faint: "rgb(var(--shop-faint) / <alpha-value>)",
          // Everything that used to be tinted gold merely for being clickable.
          interactive: "rgb(var(--shop-interactive) / <alpha-value>)",
          // Money, and only money. The variables behind these are declared
          // under .mo-commerce, so a gold class used outside that subtree
          // resolves to nothing and renders transparent — a loud enough
          // failure to catch in review, and deliberately not softened.
          gold: "rgb(var(--shop-gold) / <alpha-value>)",
          "gold-deep": "rgb(var(--shop-gold-deep) / <alpha-value>)",
          "gold-light": "rgb(var(--shop-gold-light) / <alpha-value>)",
          // The ONLY type colour permitted on a gold fill. White is 2.10.
          "on-gold": "rgb(var(--shop-on-gold) / <alpha-value>)",
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
