# postbook-ui → atpost-web migration (strangler-fig)

Source monolith: `../postbook-ui` — ~140k LOC, 618 files, 48 route domains in one
Next.js App Router app. We move it here incrementally; the monolith keeps shipping
until each zone is carved out.

## Status
- [x] **P0 (scaffold)** — Turborepo root, `@atpost/config`, `@atpost/ui` seed
  (Button, Input, EmailField+validation, DatePicker). *No app moved yet.*
- [~] **P1 (shared packages)** — in progress:
  - [x] `@atpost/api-client` — extracted `src/lib/api.ts` (axios client) +
    `src/app/api/proxy` + `src/app/api/auth/refresh` (the cookie/CSRF-aware
    proxy + refresh) into the package; apps re-export the handlers in one line.
  - [x] `@atpost/types` — `src/types` (pure, self-contained) copied verbatim +
    barrel `index.ts`.
  - [ ] `@atpost/hooks` (`src/hooks`, 83 — coupled to api/types, needs remap),
    grow `@atpost/ui` from `src/components` (188).
  - [x] Codemod provided: `scripts/codemod-dedup.sh` (conservative remap of the
    extracted symbols, optional/gradual, post-move).
- [ ] **P0 move** — `scripts/migrate-shell.sh` moves postbook-ui → `apps/shell`
  intact (the `@/*` alias keeps every import working, **no codemod required**).
  Run it locally + `bun install && bun run build` to verify (build needs network
  this sandbox lacks).
- [ ] **P2 (first zone)** — move one loosely-coupled area into `apps/<zone>`
  (recommend `admin` or `commerce`): set `basePath`, wire Multi-Zones `rewrites`
  in `apps/shell`, deploy + route its path at the edge.
- [ ] **P3 (repeat)** — dating, messenger, live, community, creator, memories,
  miniapps, social, admin.
- [ ] **P4 (deploy/scale)** — per-app Helm release (reuse `charts/atpost-service`
  + ArgoCD ApplicationSet), CloudFront/ALB path routing, per-app HPA.

## First zone template — `apps/commerce` (`/shop`)
A ready-to-fill zone is scaffolded: `next.config.ts` (basePath/assetPrefix
`/shop`, transpilePackages, `/v1`→`/api/proxy` rewrite), Tailwind via the shared
`@atpost/config/tailwind-preset`, a placeholder `page.tsx` using `@atpost/ui`,
and the proxy/refresh routes re-exported from `@atpost/api-client`. Move the
commerce routes (cart, checkout, orders, products, seller, rfq) into
`apps/commerce/src/app/`. Copy this app as the template for each new zone (change
name, basePath, port).

**Host wiring (in `apps/shell/next.config.ts`)** — route `/shop/*` to this zone:
```ts
async rewrites() {
  return { beforeFiles: [
    { source: "/shop",        destination: `${process.env.COMMERCE_ZONE_URL}/shop` },
    { source: "/shop/:path*", destination: `${process.env.COMMERCE_ZONE_URL}/shop/:path*` },
  ] }
}
```
In prod the edge (CloudFront/ALB) routes `/shop/*` to the commerce deployment
directly; the shell rewrite is the local-dev equivalent.

## Zones (scaffolded — `apps/*`, dev ports)
| zone | basePath | port | | zone | basePath | port |
|---|---|---|---|---|---|---|
| commerce | /shop | 3001 | | messenger | /messenger | 3007 |
| admin | /admin | 3002 | | live | /live | 3008 |
| dating | /match | 3003 | | memories | /memories | 3009 |
| social | /social | 3004 | | miniapps | /apps | 3010 |
| community | /community | 3005 | | shell | / (host) | 3000 |
| creator | /creator | 3006 | | | | |

`shell` comes from `migrate-shell.sh` (the moved monolith); the other 10 are
generated via `scripts/new-zone.sh <name> <basePath> <port>`.

## Performance / bundle size
- `experimental.optimizePackageImports: ["@atpost/ui","@atpost/types","lucide-react"]`
  in every zone — rewrites barrel imports to direct module imports so only the
  components actually used are bundled (big win vs the @atpost/ui barrel +
  lucide-react's thousands of icons).
- `@atpost/ui`/`@atpost/api-client` set `"sideEffects": false` → tree-shaking.
- `output: "standalone"` → minimal Docker images per zone.
- Multi-Zones means each zone bundles its own React/@atpost copies (the cost of
  independent deploys) — acceptable per the chosen architecture; shared HTTP
  caching at the edge + per-zone code-splitting keep payloads small.

## How to bring the monolith in (P0 move, run locally — needs `bun install`)
```bash
# from atpost-web/
mkdir -p apps/shell
git -C ../postbook-ui ls-files | grep -v '^node_modules' | \
  rsync -a --files-from=- ../postbook-ui/ apps/shell/   # or git mv within a merged repo
# then in apps/shell: keep its package.json/next.config/tsconfig (extend
# @atpost/config), add "@atpost/ui": "workspace:*", set transpilePackages.
bun install && bun run build   # verify the shell builds unchanged
```

## Notes / gotchas
- Per-zone `assetPrefix` is mandatory or static assets collide across zones.
- Shared chrome (nav/header) comes from `@atpost/ui`; cross-zone nav is a hard
  reload (the documented Multi-Zones trade-off).
- Auth/session works across path zones via the apex-domain httpOnly cookie
  (already implemented in the auth-hardening work).
