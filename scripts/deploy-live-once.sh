#!/usr/bin/env bash
# One paste: fix git → commit → GitHub repo → Netlify prod → verify 200
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

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

REPO="${GITHUB_REPO:-zonic-jpg/adspotx}"
BRANCH="${GITHUB_BRANCH:-main}"
SITE_URL="${ADSPOT_PUBLIC_URL:-https://adspotx.netlify.app}"

echo "==> 1/5 Git (re-init if broken)"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  rm -rf .git
  git init -b "$BRANCH"
fi
git add -A
if git diff --cached --name-only | grep -qE '(^|/)\.env$'; then
  echo "ERROR: .env is staged — check .gitignore"; exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  git commit -m "Initial commit: AdSpotX for Netlify production deploy."
fi

echo "==> 2/5 GitHub ($REPO)"
if gh auth status >/dev/null 2>&1; then
  if ! gh repo view "$REPO" >/dev/null 2>&1; then
    gh repo create "$REPO" --private --source=. --remote=origin --push
  else
    git remote remove origin 2>/dev/null || true
    git remote add origin "https://github.com/$REPO.git"
    git push -u origin "$BRANCH"
  fi
else
  echo "SKIP: gh not authenticated — run: gh auth login -h github.com"
fi

echo "==> 3/5 Build"
npx pnpm@9 run build

echo "==> 4/5 Netlify prod deploy"
if [[ -z "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  echo "ERROR: NETLIFY_AUTH_TOKEN empty in .env"
  echo "  Netlify → User settings → Applications → Personal access token"
  echo "  Also set NETLIFY_SITE_ID (Site configuration → General → Site ID)"
  exit 1
fi
export NETLIFY_AUTH_TOKEN
SITE="${NETLIFY_SITE_ID:-}"
if [[ -z "$SITE" ]]; then
  echo "Creating/linking site adspotx on Netlify…"
  netlify sites:create --name adspotx --account-slug zonic-jpg 2>/dev/null || \
  netlify link --name adspotx 2>/dev/null || true
  SITE="${NETLIFY_SITE_ID:-}"
fi
if [[ -z "$SITE" ]]; then
  SITE="$(netlify api listSites | python3 -c "import json,sys; sites=json.load(sys.stdin); print(next((s['id'] for s in sites if s.get('name')=='adspotx' or 'adspotx' in (s.get('url') or '')), ''))" 2>/dev/null || true)"
fi
if [[ -z "$SITE" ]]; then
  echo "ERROR: set NETLIFY_SITE_ID in .env (could not auto-detect adspotx site)"
  exit 1
fi
netlify deploy --prod --dir=app/dist --site "$SITE"

echo "==> 5/5 Verify $SITE_URL"
CODE="$(curl -sS -o /dev/null -w '%{http_code}' -L "$SITE_URL" || echo 000)"
echo "HTTP $CODE for $SITE_URL"
[[ "$CODE" == "200" ]] && echo "DEPLOY SUCCESS" || echo "DEPLOY DONE — check URL (got $CODE)"
