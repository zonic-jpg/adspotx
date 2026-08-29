#!/usr/bin/env bash
# Set Netlify build env from local .env, then trigger deploy.
# AdSpot API secrets (DATABASE_URL, JWT_SECRET) belong on the Node host — not Netlify SPA.
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

echo "==> AdSpotX secrets:deploy"

if [[ -n "${NETLIFY_AUTH_TOKEN:-}" ]]; then
  export NETLIFY_AUTH_TOKEN
  SITE="${NETLIFY_SITE_ID:-${NETLIFY_SITE:-}}"
  if [[ -n "$SITE" ]] && command -v netlify >/dev/null 2>&1; then
    for KEY in VITE_API_BASE_URL ADSPOT_PUBLIC_URL; do
      VAL="${!KEY-}"
      if [[ -n "$VAL" ]]; then
        echo "Setting Netlify env $KEY…"
        netlify env:set "$KEY" "$VAL" --site "$SITE" || true
      fi
    done
  else
    echo "Netlify CLI / NETLIFY_SITE_ID optional — using build hook if set"
  fi
else
  echo "Skip Netlify CLI env — set NETLIFY_AUTH_TOKEN (login blocker)"
fi

if [[ -n "${NETLIFY_BUILD_HOOK:-}" ]]; then
  echo "Triggering Netlify build hook…"
  curl -fsS -X POST "$NETLIFY_BUILD_HOOK" >/dev/null
  echo "Netlify build queued."
else
  echo "Skip build hook — set NETLIFY_BUILD_HOOK or link GitHub in Netlify UI"
fi

# Optional: if AdSpot DATABASE_URL is Supabase Postgres and token present, no edge functions to deploy.
if [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN present — AdSpot uses Express+Postgres (not MyYangaX edge functions)."
  echo "Use DATABASE_URL from a dedicated AdSpot Postgres (Supabase DB URL is fine if separate project)."
fi

echo "Done. Day-to-day: pnpm ship"
