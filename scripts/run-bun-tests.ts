/**
 * run-bun-tests — `bun run test:bun`
 *
 * Runs every workspace's test files under `bun test` with scripts/bun-vitest-shim.ts
 * preloaded, one workspace at a time so each package's own tsconfig `paths` (the
 * `@/...` aliases) resolve the way they do under vitest. Prints a per-workspace
 * pass/fail/skip table and exits non-zero if anything failed.
 *
 * This is the LOCAL convenience runner. The authority is still `bun run test`
 * (turbo -> vitest run), which needs Node on PATH. See README "Running the tests".
 *
 *   bun run test:bun            # everything
 *   bun run test:bun tube       # only workspaces whose name matches "tube"
 */

import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { join, resolve } from "node:path"

const ROOT = resolve(import.meta.dir, "..")
const SHIM = join(ROOT, "scripts", "bun-vitest-shim.ts")
const filter = process.argv[2] ?? ""

const workspaces: string[] = []
for (const group of ["apps", "packages"]) {
  for (const name of await readdir(join(ROOT, group))) {
    const dir = join(ROOT, group, name)
    if (!existsSync(join(dir, "package.json"))) continue
    if (!existsSync(join(dir, "src"))) continue
    if (filter && !`${group}/${name}`.includes(filter)) continue
    workspaces.push(`${group}/${name}`)
  }
}

type Row = { name: string; pass: number; fail: number; skip: number; files: number; ran: boolean }
const rows: Row[] = []
const failureLines: string[] = []

for (const ws of workspaces) {
  const cwd = join(ROOT, ws)
  const proc = Bun.spawnSync(["bun", "test", "--preload", SHIM, "src"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  })
  const out = `${proc.stdout.toString()}${proc.stderr.toString()}`
  const n = (re: RegExp) => Number(out.match(re)?.[1] ?? 0)
  const row: Row = {
    name: ws,
    pass: n(/(\d+) pass/),
    fail: n(/(\d+) fail/),
    skip: n(/(\d+) skip/),
    files: n(/across (\d+) files?/),
    ran: /Ran \d+ tests?/.test(out),
  }
  rows.push(row)

  for (const line of out.split("\n")) {
    if (line.startsWith("(fail)")) failureLines.push(`${ws}  ${line.slice(7).trim()}`)
  }
  // A workspace with no test files at all is not a failure; a workspace whose
  // files exist but produced no result is.
  if (!row.ran && /\d+ files? were searched/.test(out) === false) {
    failureLines.push(`${ws}  <runner error>  ${out.trim().split("\n").slice(-4).join(" | ")}`)
  }
  process.stdout.write(
    `${ws.padEnd(24)} ${String(row.pass).padStart(5)} pass  ${String(row.fail).padStart(3)} fail  ` +
      `${String(row.skip).padStart(3)} skip  (${row.files} files)\n`,
  )
}

const total = rows.reduce(
  (a, r) => ({ pass: a.pass + r.pass, fail: a.fail + r.fail, skip: a.skip + r.skip, files: a.files + r.files }),
  { pass: 0, fail: 0, skip: 0, files: 0 },
)
process.stdout.write(
  `\n${"TOTAL".padEnd(24)} ${String(total.pass).padStart(5)} pass  ${String(total.fail).padStart(3)} fail  ` +
    `${String(total.skip).padStart(3)} skip  (${total.files} files)\n`,
)

if (failureLines.length) {
  process.stdout.write(`\nFailing tests (${failureLines.length}):\n`)
  for (const line of failureLines) process.stdout.write(`  ${line}\n`)
}

process.exit(total.fail > 0 || failureLines.length > 0 ? 1 : 0)
