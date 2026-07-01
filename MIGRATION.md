# postbook-ui → atpost-web migration (strangler-fig)

Source monolith: `../postbook-ui` — ~140k LOC, 618 files, 48 route domains in one
Next.js App Router app. We move it here incrementally; the monolith keeps shipping
until each zone is carved out.

## Status
- [x] **P0 (scaffold)** — Turborepo root, shared configuration, UI package,
  API client, types, and non-interactive lint/typecheck/test/build tasks.
- [x] **P1 (shared packages)**:
  - [x] `@atpost/api-client` — extracted `src/lib/api.ts` (axios client) +
    `src/app/api/proxy` + `src/app/api/auth/refresh` (the cookie/CSRF-aware
    proxy + refresh) into the package; apps re-export the handlers in one line.
  - [x] `@atpost/types` — `src/types` (pure, self-contained) copied verbatim +
    barrel `index.ts`.
  - Domain-specific hooks remain inside their owning apps. Promote a hook only
    after a second app needs the same behavior; this avoids a new shared monolith.
  - [x] Codemod provided: `scripts/codemod-dedup.sh` (conservative remap of the
    extracted symbols, optional/gradual, post-move).
- [x] **Shell host** — `apps/shell` provides local Multi-Zone composition on
  port 3000. Production should route zone prefixes directly at the edge.
- [~] **P2 (active zones)** — commerce and admin contain migrated functionality.
  Commerce has storefront, cart, authoritative quote, idempotent checkout,
  Razorpay confirmation, orders, seller onboarding, and checkout safety tests.
- [~] **P3 (remaining zones)** — dating, messenger, live, community, creator,
  memories, miniapps, and social are independently buildable placeholders; their
  product functionality still needs migration from `postbook-ui`.
- [ ] **P4 (deploy/scale)** — per-app Helm release (reuse `charts/atpost-service`
  + ArgoCD ApplicationSet), CloudFront/ALB path routing, per-app HPA.

## First active zone — `apps/commerce` (`/shop`)
Commerce is the reference implementation for an active zone. Shared production
defaults come from `@atpost/config/next`; domain hooks and components remain
inside the app. Copy a placeholder zone—not commerce business code—when creating
a new product zone.

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

New zones can be generated with `scripts/new-zone.sh <name> <basePath> <port>`;
also add their local and production origins to `apps/shell/next.config.ts`.

## Performance (Next.js) — enabled by default in every zone
Runtime: **React 19** + **SWC** compiler (no Babel; no `.babelrc`). React
Compiler intentionally **not** enabled (adds a Babel pass / experimental).
- `experimental.optimizePackageImports: ["@atpost/ui","@atpost/types","lucide-react"]`
  — rewrites barrel imports to direct imports so only used components ship (big
  win vs the @atpost/ui barrel + lucide-react's icon set).
- `@atpost/ui`/`@atpost/api-client` `"sideEffects": false` → tree-shaking.
- `images.formats: ["image/avif","image/webp"]` + `minimumCacheTTL: 30d` →
  smaller, long-cached images (matters for a media-heavy app).
- `compress: true`, `poweredByHeader: false`.
- `output: "standalone"` → minimal Docker images per zone.
- `next dev --turbopack` → fast local dev (build still uses webpack).
- Multi-Zones means each zone bundles its own React/@atpost copies (the cost of
  independent deploys); per-zone code-splitting + edge HTTP caching keep payloads
  small.

**Safe to add later (verify per-zone):** `next/font` when fonts move in (zero
layout-shift, self-hosted); route-segment `revalidate`/`dynamic` per route;
`experimental.optimizeCss` (critical-CSS inlining — needs `critters`, watch for
FOUC); a CloudFront image loader. Left off by default to keep the "don't change
behavior" guarantee.

## Local multi-zone development
Run `bun run dev` to start every zone, or start `@atpost/shell` and only the
zones being changed with Turbo filters. The shell defaults to localhost ports
and accepts `*_ZONE_URL` overrides defined in `apps/shell/next.config.ts`.

## Notes / gotchas
- Per-zone `assetPrefix` is mandatory or static assets collide across zones.
- Shared chrome (nav/header) comes from `@atpost/ui`; cross-zone nav is a hard
  reload (the documented Multi-Zones trade-off).
- Auth/session works across path zones via the apex-domain httpOnly cookie
  (already implemented in the auth-hardening work).
