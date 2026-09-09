const atpost = require("@atpost/config/tailwind-preset")
const momentum = require("@momentum/tokens/tailwind-preset")

/**
 * Two presets, in this order.
 *
 * @atpost/config supplies the `brand-*` scale that @atpost/ui renders through;
 * @momentum/tokens supplies the `mo-*` vocabulary the feed is built in. They
 * compose rather than compete — tokens.css points every `--brand-*` at a
 * Momentum value, so a shared Button lands in the dark theme without knowing
 * the dark theme exists.
 *
 * The content globs reach into the Momentum packages because their class names
 * only ever appear in THEIR source. Tailwind scans files, not dependency
 * graphs: without these entries every `bg-mo-surface` in a card is purged from
 * the stylesheet and the feed renders as unstyled HTML — a failure that looks
 * like a broken import rather than a missing glob.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [atpost, momentum],
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    // Include the shared component sources so their classes aren't purged.
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/content/src/**/*.{ts,tsx}",
    "../../packages/interactions/src/**/*.{ts,tsx}",
    "../../packages/player/src/**/*.{ts,tsx}",
  ],
}
