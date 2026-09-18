# atpost-web — web monorepo

Turborepo monorepo that decomposes the `postbook-ui` monolith into **independent
apps** (built/tested/deployed/scaled per product area) sharing **versioned
packages**. See the full plan in `MIGRATION.md`.

## Layout
```
apps/        # one independent Next.js app per product zone (Multi-Zones)
packages/
  ui         @atpost/ui      — shared design system (Button, Input, EmailField, DatePicker, validateEmail)
  config     @atpost/config  — shared tsconfig base / presets
  api-client @atpost/api-client — gateway client, proxy and refresh handlers
  types      @atpost/types   — cross-zone API/domain contracts
```

`apps/shell` composes zones locally through Multi-Zone rewrites. Production can
route the same prefixes directly to independent zone deployments at the edge.

## Develop
```bash
bun install
bun run typecheck   # turbo run typecheck --affected
bun run test        # vitest across packages — REQUIRES Node on PATH
bun run build
```

## Running the tests

`bun run test` (→ `turbo run test` → `vitest run` per workspace) is the
**authoritative** runner and the one CI uses. It needs **Node on PATH**. Bun
alone is not enough: vitest's vite-node worker dies at startup under Bun with
`TypeError: File URL path must be an absolute path` and
`port.addListener is not a function`.

Install Node on Windows, then use the real thing:

```powershell
winget install OpenJS.NodeJS.LTS   # or: choco install nodejs-lts
# open a new terminal so PATH is picked up
node -v
bun install
bun run test
```

### `bun run test:bun` — local convenience, no Node needed

```bash
bun run test:bun          # every workspace
bun run test:bun tube     # only workspaces whose path matches "tube"
```

It runs each workspace's `src/**/*.test.ts(x)` through `bun test` with
`scripts/bun-vitest-shim.ts` preloaded, one workspace per process so each
package's own tsconfig `paths` aliases resolve. It prints a per-workspace
pass/fail/skip table and exits non-zero on failure.

The shim is thin on purpose: Bun 1.3 already maps `import … from "vitest"` onto
`bun:test` (describe / it / test / expect / the before and after hooks / spyOn /
`vi.fn` / `vi.mock`). `scripts/bun-vitest-shim.ts` only adds what that bridge is
missing — `vi.hoisted`, `vi.stubGlobal`, `vi.unstubAllGlobals`, `vi.stubEnv` —
and makes `vi.importActual` / `vi.importMock` / `vi.unmock` / `vi.doMock` throw
loudly rather than silently pass.

**Known differences — do not treat a green `test:bun` as a green `test`:**

- `vi.mock` is not hoisted. Bun patches the module registry in place, so a
  module that captured a value at import time keeps the real one.
- `vi.hoisted` runs where it is written rather than above the imports.
- Fake timers, snapshots and vitest's `assert` are untested here; nothing in the
  repo uses them today. Add one and run it under real vitest.
- Test *discovery* differs slightly (Bun also matches `.spec.*`), which is why
  the runner scopes each workspace to `src`, keeping Playwright's `e2e/` out.
- Do not run the whole repo in one `bun test` process: vi.mock and stubbed
  globals leak across workspaces and manufacture failures. Use `test:bun`.

CI and the `test` script are unchanged — this adds a script, it does not replace
one.

## Using shared components
```tsx
import { Button, EmailField, DatePicker, validateEmail } from "@atpost/ui"
```
Each Next app must set `transpilePackages: ["@atpost/ui"]` in `next.config.ts`
(the package ships source TSX — no separate build step in dev).

## Registry (AWS CodeArtifact)
`@atpost/*` are consumed via the workspace internally; published to CodeArtifact
for the mobile side / external reuse. Auth before install/publish:
```bash
aws codeartifact login --tool npm --domain atpost --repository atpost-web --region ap-south-1
```
See `.npmrc` (fill `<ACCOUNT_ID>` once the CodeArtifact Terraform module exists).
