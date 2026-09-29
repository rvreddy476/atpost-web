import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * vitest for the console. Two things the Next tsconfig does not give vitest:
 * the automatic JSX runtime (tsconfig says `preserve`, for Next), so a
 * component test can render with renderToStaticMarkup, and the `@/` alias
 * the sources import by. `bun run test:bun` ignores this file (bun reads the
 * tsconfig itself).
 */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
})
