#!/usr/bin/env bash
# Netlify production build for AdSpotX (SPA + ops SQL seed).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/apply-adspot-sql.mjs || echo "SQL apply soft-fail (continuing build)"
npx pnpm@9 install
npx pnpm@9 --filter @workspace/adspot-unified run build
