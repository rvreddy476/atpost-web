# Windows / WSL development handoff

## Repository state

- Web repository: `https://github.com/rvreddy476/atpost-web`
- Backend repository: `https://github.com/rvreddy476/modernsmapp`
- Both repositories were synchronized with `origin/main` before migration.
- Package manager: **Bun only**. Do not use npm, pnpm, or Yarn.

## Recommended Windows setup

1. Install Windows Subsystem for Linux with Ubuntu.
2. Install Docker Desktop and enable its WSL 2 integration.
3. Install Git and Bun inside Ubuntu/WSL.
4. Clone both repositories inside the WSL filesystem (for example,
   `~/code/Vchat`), not under `/mnt/c`, for better filesystem performance.
5. Place `atpost-web` and `modernsmapp` next to each other.

## Restore Commerce data

The Linux transfer archive contains `commerce_db.dump`. After PostgreSQL is
running in Docker, restore it with:

```sh
docker cp commerce_db.dump atpost_stack-postgres-1:/tmp/commerce_db.dump
docker exec atpost_stack-postgres-1 pg_restore \
  --clean --if-exists --no-owner \
  -U postgres -d commerce_db /tmp/commerce_db.dump
```

If the dump is unavailable, restore only the imported demonstration catalog:

```sh
cd modernsmapp
bun Architecture/tools/commerce/import-fakestore.ts
```

## Start the project

Start the backend services required by Commerce, then run the web workspace:

```sh
cd atpost-web
bun install
bun run dev
```

Use the shell URL (normally `http://localhost:3000/shop`) rather than opening a
zone port directly. This preserves shared authentication and redirect behavior.

## Current Commerce implementation

- Central VChat login and registration with module return redirects.
- Distinct monochrome VChat Market landing experience.
- Imported Fake Store catalog under `VChat Curated Retailer`.
- Product cards with V-Bag quantity controls.
- Visual V-Bag cart with images, retailer context, promo codes, and checkout.
- Search across title, descriptions, brand, category, retailer, SKU, barcode,
  and search keywords.

## Useful verification commands

```sh
cd atpost-web
bun run lint
bun run typecheck
bun run test
bun run e2e:auth
```

Backend Commerce store tests:

```sh
cd modernsmapp/Architecture/services/commerce-service
go test ./internal/store/postgres
```

Do not commit `.env` files, access tokens, database dumps, or other secrets.
