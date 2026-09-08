/**
 * Shared Tailwind preset — the `brand-*` SCALE, not a brand.
 *
 * This file names variables and decides nothing. Every app/zone spreads it via
 * `presets: [require("@atpost/config/tailwind-preset")]` so @atpost/ui's
 * brand-* classes resolve identically everywhere; the concrete --brand-* values
 * come from whichever stylesheet a zone loads — @momentum/tokens for the dark
 * zones, each console's own globals.css for the light ones.
 *
 * "brand" here is a role ("the zone's own palette"), not the product's name.
 * The product's name is a constant in @momentum/brand and appears nowhere in
 * any stylesheet, so a rename never touches a colour.
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "rgb(var(--brand-bg) / <alpha-value>)",
          text: "rgb(var(--brand-text) / <alpha-value>)",
          accent: "rgb(var(--brand-accent) / <alpha-value>)",
          secondary: "rgb(var(--brand-secondary) / <alpha-value>)",
          highlight: "rgb(var(--brand-highlight) / <alpha-value>)",
          divider: "var(--brand-divider)",
          card: "rgb(var(--brand-card) / <alpha-value>)",
        },
      },
    },
  },
}
