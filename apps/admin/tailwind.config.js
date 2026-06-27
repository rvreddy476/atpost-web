const preset = require("@atpost/config/tailwind-preset")

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [preset],
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    // Include @atpost/ui source so its brand-* classes aren't purged.
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
}
