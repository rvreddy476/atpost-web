/**
 * bun-vitest-shim — run this repo's vitest suites under `bun test`.
 *
 * Why this exists: the authoritative runner is vitest on Node (`bun run test`
 * -> `turbo run test` -> `vitest run` in each workspace). On a machine with no
 * Node on PATH, vitest cannot start at all — vite-node dies in worker startup
 * with `TypeError: File URL path must be an absolute path` and
 * `port.addListener is not a function` (see apps/reels/.turbo/turbo-test.log).
 *
 * Bun 1.3 already resolves `import ... from "vitest"` to a built-in bridge over
 * `bun:test`, which covers describe / it / test / expect / the before and after
 * hooks / spyOn / vi.fn / vi.mock. What it does NOT cover is the vitest-only
 * helpers these test files use. This preload fills exactly those gaps, on the
 * live `vi` singleton, and makes everything it genuinely cannot emulate throw
 * loudly instead of silently passing.
 *
 * The surface was taken from a grep over apps/*&#47;src and packages/*&#47;src, not
 * guessed. Used there today: describe, it, expect, beforeEach, afterEach, vi.fn,
 * vi.mock, vi.hoisted, vi.stubGlobal, vi.unstubAllGlobals. No fake timers, no
 * snapshots, no vi.spyOn, no beforeAll/afterAll.
 *
 * This is a LOCAL CONVENIENCE. See README "Running the tests".
 */

import { vi } from "vitest"

type Vi = Record<string, unknown>
const target = vi as unknown as Vi

function unsupported(name: string, why: string): never {
  throw new Error(
    `[bun-vitest-shim] ${name} is not supported under \`bun test\`: ${why}\n` +
      `This file needs the authoritative runner: install Node, then \`bun run test\`.`,
  )
}

/** Define only what Bun's bridge is missing, so native behaviour always wins. */
function fill(name: string, value: unknown) {
  if (typeof target[name] === "undefined") target[name] = value
}

/**
 * vitest hoists `vi.hoisted` above the import block so `vi.mock` factories can
 * close over it. Bun does not hoist, so the factory just runs where it is
 * written. That is equivalent for every caller in this repo, because each one
 * declares the state above the `vi.mock` calls that read it.
 */
fill("hoisted", <T>(factory: () => T): T => factory())

const stubbed: Array<{ key: string; had: boolean; previous: unknown }> = []

fill("stubGlobal", (key: string, value: unknown) => {
  const globals = globalThis as unknown as Record<string, unknown>
  stubbed.push({ key, had: key in globals, previous: globals[key] })
  globals[key] = value
  return vi
})

fill("unstubAllGlobals", () => {
  const globals = globalThis as unknown as Record<string, unknown>
  while (stubbed.length) {
    const { key, had, previous } = stubbed.pop()!
    if (had) globals[key] = previous
    else delete globals[key]
  }
  return vi
})

fill("stubEnv", (key: string, value: string) => {
  process.env[key] = value
  return vi
})

// No honest mapping exists for these on bun:test — fail loudly, never silently.
fill("importActual", () => unsupported("vi.importActual", "bun:test cannot un-mock a patched module"))
fill("importMock", () => unsupported("vi.importMock", "bun:test has no automocker"))
fill("unmock", () => unsupported("vi.unmock", "bun:test cannot restore a patched module"))
fill("doMock", () => unsupported("vi.doMock", "bun applies vi.mock eagerly; there is no deferred form"))
fill("unstubAllEnvs", () => unsupported("vi.unstubAllEnvs", "process.env is not snapshotted here"))

// Sanity check: if a future Bun drops part of the bridge, say so at preload time
// rather than letting a suite report a green run it did not actually do.
for (const required of ["fn", "mock", "spyOn"]) {
  if (typeof target[required] !== "function") {
    throw new Error(
      `[bun-vitest-shim] this Bun (${Bun.version}) does not expose vi.${required}; the shim is out of date.`,
    )
  }
}
