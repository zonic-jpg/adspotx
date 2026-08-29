#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SITE=913fed63-eeb2-4974-b5f0-7f8833232f81
echo "AdSpotX deploy -> https://adspotx.netlify.app"
npx --yes netlify deploy --prod --dir=app/dist --functions=netlify/functions --site="$SITE" --message "deploy: adspotcl dist + functions"
echo "Health:" && curl -sS -w " HTTP:%{http_code}\n" https://adspotx.netlify.app/api/health
echo "Login:" && curl -sS -w " HTTP:%{http_code}\n" -X POST https://adspotx.netlify.app/api/auth/login -H 'Content-Type: application/json' -d '{"email":"oadeagbo@gmail.com","password":"password123"}'
