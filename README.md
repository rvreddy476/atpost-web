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
bun run test        # vitest across packages
bun run build
```

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
