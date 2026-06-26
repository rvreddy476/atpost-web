#!/usr/bin/env bash
# OPTIONAL (gradual, post-move) — switch an app's imports from its in-tree copies
# to the shared @atpost/* packages, so the duplicated source can be deleted.
#
# Conservative: only remaps the symbols we've actually extracted and verified.
# Run on ONE app dir, review the diff, `bun run build`, then delete the now-dead
# in-tree files (src/lib/api.ts, src/types, src/components/ui/{button,input}).
#
#   ./scripts/codemod-dedup.sh apps/shell
set -euo pipefail
APP="${1:?usage: codemod-dedup.sh <app-dir>}"
[ -d "$APP/src" ] || { echo "✗ $APP/src not found"; exit 1; }

# sed is intentionally limited to high-confidence, fully-qualified specifiers.
remap() {  # $1=from-regex  $2=to
  grep -rlE "$1" "$APP/src" --include=*.ts --include=*.tsx 2>/dev/null \
    | while read -r f; do sed -i -E "s#$1#$2#g" "$f"; done
}

echo "→ remapping @/lib/api → @atpost/api-client"
remap 'from "@/lib/api"'                 'from "@atpost/api-client"'
echo "→ remapping @/types(/*)?      → @atpost/types"
remap 'from "@/types(/[a-zA-Z0-9_-]+)?"' 'from "@atpost/types"'
echo "→ remapping @/components/ui/button → @atpost/ui"
remap 'from "@/components/ui/button"'    'from "@atpost/ui"'
remap 'from "@/components/ui/input"'     'from "@atpost/ui"'

cat <<'EONEXT'

✓ remap done. Now:
  1) git diff — review (named imports like { Button } from "@atpost/ui" are correct;
     default/namespace imports of api stay `import api from "@atpost/api-client"`).
  2) bun run build  (with the app added to transpilePackages).
  3) delete the now-dead in-tree copies:
       rm src/lib/api.ts ; rm -r src/types ; rm src/components/ui/button.tsx src/components/ui/input.tsx
  4) re-run build; commit.
Grow @atpost/ui from src/components and repeat per symbol as you extract more.
EONEXT
