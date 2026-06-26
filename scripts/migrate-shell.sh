#!/usr/bin/env bash
# P0 — move the postbook-ui monolith into apps/shell, intact.
#
# Safe by design: the app keeps its own `@/*` alias (→ apps/shell/src), so every
# existing import keeps working with NO codemod. The new @atpost/* packages are
# merely *available* for gradual adoption; nothing is rewritten here. Run from
# the atpost-web/ repo root, then `bun install && bun run build` to verify the
# shell builds identically to today.
#
#   ./scripts/migrate-shell.sh [path-to-postbook-ui]
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"          # atpost-web/
SRC="${1:-$HERE/../postbook-ui}"
DST="$HERE/apps/shell"

[ -d "$SRC/.git" ] || { echo "✗ source repo not found at: $SRC"; exit 1; }
command -v rsync >/dev/null || { echo "✗ rsync required"; exit 1; }

echo "→ Moving git-tracked files: $SRC  →  $DST"
mkdir -p "$DST"
# git-tracked files only (skips node_modules/.next/.git/build artifacts).
git -C "$SRC" ls-files -z | rsync -a --from0 --files-from=- "$SRC/" "$DST/"

echo "→ Wiring apps/shell/package.json (name + @atpost/* workspace deps)"
node - "$DST/package.json" <<'NODE'
const fs = require("fs"); const p = process.argv[2];
const j = JSON.parse(fs.readFileSync(p, "utf8"));
j.name = "@atpost/shell";
j.dependencies = j.dependencies || {};
for (const dep of ["@atpost/ui", "@atpost/api-client", "@atpost/types"]) {
  j.dependencies[dep] = "workspace:*";
}
fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
console.log("  ✓ name=@atpost/shell, added @atpost/* workspace deps");
NODE

cat <<'EONEXT'

→ Two manual edits, then verify:

  1) apps/shell/next.config.ts — let Next transpile the source-only packages:
       const nextConfig = {
         transpilePackages: ["@atpost/ui", "@atpost/api-client", "@atpost/types"],
         // ...keep existing config (output: 'standalone', rewrites(), etc.)
       }

  2) apps/shell/tsconfig.json — extend the shared base (keep the @/* paths):
       { "extends": "@atpost/config/tsconfig.base.json",
         "compilerOptions": { "paths": { "@/*": ["./src/*"] } },
         "include": ["next-env.d.ts", "src/**/*.ts", "src/**/*.tsx", ".next/types/**/*.ts"] }

  3) Verify the move changed nothing:
       cd atpost-web && bun install && bun run build
       # apps/shell should build exactly as postbook-ui did.

  Optional (gradual): ./scripts/codemod-dedup.sh apps/shell  # adopt @atpost/* and delete in-tree dupes
EONEXT
echo "✓ move complete."
