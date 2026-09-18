const atpost = require("@atpost/config/tailwind-preset")
const momentum = require("@momentum/tokens/tailwind-preset")

/**
 * Same two presets, same order, as apps/tube: @atpost/config supplies the
 * `brand-*` scale @atpost/ui renders through, @momentum/tokens the `mo-*`
 * vocabulary. The package globs are load-bearing — Tailwind scans files, not
 * dependency graphs, so a class used only inside a shared package is purged
 * unless its source is listed here.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  presets: [atpost, momentum],
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/chrome/src/**/*.{ts,tsx}",
    "../../packages/content/src/**/*.{ts,tsx}",
    "../../packages/interactions/src/**/*.{ts,tsx}",
  ],
}
