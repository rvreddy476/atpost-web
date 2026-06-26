/**
 * Shared Tailwind preset — atPost brand theme. Every app/zone spreads this via
 * `presets: [require("@atpost/config/tailwind-preset")]` so @atpost/ui's
 * brand-* classes resolve identically everywhere. Concrete --brand-* values
 * live in each app's globals.css (light/dark).
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
