const atpost = require("@atpost/config/tailwind-preset")
const momentum = require("@momentum/tokens/tailwind-preset")

/**
 * Admin console Tailwind config — Momentum, like the shop and the feed.
 *
 * @atpost/config supplies `brand-*` (what @atpost/ui renders through, pointed
 * at Momentum by tokens.css); @momentum/tokens supplies `mo-*`, which is what
 * new console code is written in.
 *
 * ── The legacy scales are aliases, not colours ─────────────────────────────
 * The catalogue editor and the commerce queues (~200 class names over 2,700
 * lines) were written in Tailwind's grey/red/amber/emerald on a white page.
 * Rather than rewrite a working editor for a palette change, those scales are
 * re-pointed here at Momentum ROLES on the dark ground:
 *
 *   gray-50 … gray-100   grounds and raised surfaces
 *   gray-200 … gray-300  hairlines (ink at low alpha)
 *   gray-400 … gray-600  secondary text (mo-body — safe for small text)
 *   gray-700 … gray-900  primary text, and the inverted "dark button"
 *   white                a card surface; as text, the ink on a gray-900 button
 *   black                the hover of that button
 *   red / amber / emerald  mo-bad / mo-warn / mo-good
 *
 * So `bg-gray-900 text-white` still reads as the strong button, now light on
 * dark, and `text-gray-400` never lands on the large-text-only grey. These
 * aliases exist ONLY in this app; do not use them in new code.
 *
 * @type {import('tailwindcss').Config}
 */
const role = (name, alpha) => (alpha === undefined ? `rgb(var(--mo-${name}) / <alpha-value>)` : `rgb(var(--mo-${name}) / ${alpha})`)

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
        white: role("surface"),
        black: role("ink"),
        gray: {
          50: role("bg"),
          100: role("raised"),
          200: role("ink", 0.12),
          300: role("ink", 0.2),
          400: role("body"),
          500: role("body"),
          600: role("body"),
          700: role("ink"),
          800: role("ink"),
          900: role("ink"),
        },
        red: {
          50: role("bad", 0.1),
          100: role("bad", 0.16),
          200: role("bad", 0.3),
          300: role("bad", 0.45),
          400: role("bad", 0.6),
          500: role("bad"),
          600: role("bad"),
          700: role("bad"),
          800: role("bad"),
          900: role("bad"),
        },
        amber: {
          50: role("warn", 0.1),
          100: role("warn", 0.16),
          200: role("warn", 0.3),
          300: role("warn", 0.45),
          400: role("warn"),
          500: role("warn"),
          600: role("warn"),
          700: role("warn"),
          800: role("warn"),
          900: role("warn"),
        },
        emerald: {
          50: role("good", 0.1),
          100: role("good", 0.16),
          500: role("good"),
          600: role("good"),
          700: role("good"),
        },
      },
    },
  },
}
