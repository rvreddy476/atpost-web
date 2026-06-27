#!/usr/bin/env bash
# Scaffold a new Multi-Zone app by cloning apps/commerce and rewriting its
# name / basePath / dev port. Run from the atpost-web/ repo root:
#
#   ./scripts/new-zone.sh <name> <basePath> <port>
#   ./scripts/new-zone.sh admin /admin 3002
#
# Then move that domain's routes into apps/<name>/src/app/ and:
#   bun install && (cd apps/<name> && bun run build)
set -euo pipefail

NAME="${1:?usage: new-zone.sh <name> <basePath> <port>}"
BASEPATH="${2:?missing basePath, e.g. /admin}"
PORT="${3:?missing port, e.g. 3002}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TPL="$HERE/apps/commerce"
DST="$HERE/apps/$NAME"

[ -d "$TPL" ] || { echo "✗ template apps/commerce not found"; exit 1; }
[ -e "$DST" ] && { echo "✗ apps/$NAME already exists"; exit 1; }

echo "→ cloning apps/commerce → apps/$NAME ($BASEPATH, port $PORT)"
# Copy source only (skip build/dep artifacts if present).
rsync -a --exclude node_modules --exclude .next --exclude .turbo "$TPL/" "$DST/"

# Title-case the name for display (admin → Admin, mini-apps → Mini-apps).
TITLE="$(printf '%s' "$NAME" | sed -E 's/(^|-)([a-z])/\1\u\2/g')"

# package.json: name + ports
sed -i -E \
  -e "s#\"@atpost/commerce\"#\"@atpost/$NAME\"#" \
  -e "s#next dev -p 3001#next dev -p $PORT#" \
  -e "s#next start -p 3001#next start -p $PORT#" \
  "$DST/package.json"

# next.config.ts: basePath + assetPrefix
sed -i -E "s#(basePath: \")/shop(\")#\1$BASEPATH\2#; s#(assetPrefix: \")/shop(\")#\1$BASEPATH\2#" \
  "$DST/next.config.ts"

# .env.example: browser base path
sed -i -E "s#(NEXT_PUBLIC_API_BASE_URL=)/shop#\1$BASEPATH#" "$DST/.env.example"

# layout title + placeholder page copy
sed -i -E "s#atPost — Shop#atPost — $TITLE#; s#atPost commerce zone#atPost $NAME zone#" "$DST/src/app/layout.tsx"
sed -i -E "s#Commerce zone#$TITLE zone#g; s#/shop#$BASEPATH#g; s#commerce routes \(cart, checkout, orders, products, seller, rfq\)#$NAME routes#g" "$DST/src/app/page.tsx"

echo "✓ apps/$NAME scaffolded. Next: bun install; move routes into apps/$NAME/src/app/; bun run build"
echo "  Also add the host rewrite for $BASEPATH in apps/shell/next.config.ts (see MIGRATION.md)."
