#!/usr/bin/env bash
# One-command ship: build → push main → ping Netlify.
# Tokens live once in .env (gitignored). API/DB still need server/.env on the Node host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

load_env() {
  local f="$1"
  [[ -f "$f" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      export "$line"
    fi
  done < "$f"
}

load_env "$ROOT/.env"
load_env "$ROOT/.env.local"
load_env "$ROOT/server/.env"

BRANCH="${GITHUB_BRANCH:-main}"
REPO="${GITHUB_REPO:-zonic-jpg/adspotx}"
SKIP_BUILD="${SHIP_SKIP_BUILD:-0}"
SKIP_PUSH="${SHIP_SKIP_PUSH:-0}"
SKIP_NETLIFY="${SHIP_SKIP_NETLIFY:-0}"

echo "==> AdSpotX ship ($REPO @ $BRANCH)"

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "Building…"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm run build
  else
    npx pnpm@9 run build
  fi
fi

if [[ "$SKIP_PUSH" != "1" ]]; then
  if [[ -n "$(git status --porcelain 2>/dev/null || true)" ]]; then
    echo
    echo "Uncommitted changes — commit first, then re-run pnpm ship:"
    echo "  git add -A && git commit -m \"your message\" && pnpm ship"
    echo "Or deploy without push: SHIP_SKIP_PUSH=1 pnpm ship"
    git status -sb
    exit 1
  fi
  echo "Pushing $BRANCH → origin…"
  git push -u origin "$BRANCH"
else
  echo "Skip git push (SHIP_SKIP_PUSH=1)"
fi

if [[ "$SKIP_NETLIFY" != "1" && -n "${NETLIFY_BUILD_HOOK:-}" ]]; then
  echo "Pinging Netlify build hook…"
  curl -fsS -X POST "$NETLIFY_BUILD_HOOK" >/dev/null && echo "Netlify build queued."
elif [[ "$SKIP_NETLIFY" != "1" ]]; then
  echo "No NETLIFY_BUILD_HOOK — relying on Netlify GitHub auto-deploy from push to main."
fi

echo
echo "Ship complete."
echo "Note: SPA on Netlify is static; full /api needs Node + DATABASE_URL (see docs/ADSPOTX-DEPLOY-GUIDE.md)."
