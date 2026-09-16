import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * The console's building blocks (data table, document viewer, step-up dialog)
 * live in apps/admin on purpose. A consumer zone or a shared package that
 * imports them would ship admin code — and its assumptions about who is
 * looking — to the public site. This walks every other app and package and
 * fails on any import that reaches into apps/admin.
 */
const REPO = fileURLToPath(new URL("../../../../", import.meta.url))
const SKIP = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"])
const SOURCE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else if (SOURCE.test(name)) out.push(path)
  }
  return out
}

const IMPORT = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["'`]([^"'`]+)["'`]/g

function adminImports(file: string, source: string): string[] {
  const hits: string[] = []
  for (const match of source.matchAll(IMPORT)) {
    const spec = match[1]
    if (spec === "@atpost/admin" || spec.startsWith("@atpost/admin/")) hits.push(spec)
    else if (spec.startsWith(".") && /(^|[\\/])apps[\\/]admin([\\/]|$)/.test(join(file, "..", spec))) hits.push(spec)
    else if (/(^|\/)apps\/admin(\/|$)/.test(spec)) hits.push(spec)
  }
  return hits
}

describe("admin import boundary", () => {
  it("detects the import shapes it guards against", () => {
    const file = join(REPO, "apps", "commerce", "src", "x.ts")
    expect(adminImports(file, `import { DataTable } from "@atpost/admin/components"`)).toHaveLength(1)
    expect(adminImports(file, `import x from "../../admin/src/lib/table/state"`)).toHaveLength(1)
    expect(adminImports(file, `const y = await import("../../../apps/admin/src/x")`)).toHaveLength(1)
    expect(adminImports(file, `import { Table } from "@atpost/ui"`)).toHaveLength(0)
  })

  it("no consumer app or shared package imports anything from apps/admin", () => {
    const roots = [
      ...readdirSync(join(REPO, "apps"))
        .filter((name) => name !== "admin")
        .map((name) => join(REPO, "apps", name)),
      join(REPO, "packages"),
    ].filter((dir) => statSync(dir).isDirectory())

    const offenders: string[] = []
    for (const root of roots) {
      for (const file of walk(root)) {
        for (const spec of adminImports(file, readFileSync(file, "utf8"))) {
          offenders.push(`${relative(REPO, file)} → ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
