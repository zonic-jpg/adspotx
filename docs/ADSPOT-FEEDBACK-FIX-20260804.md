# AdSpot Feedback Fix — 4 August 2026

Proactive audit and fix pass after user report that "things still not working" (no specific bugs listed).

## Hostile audit result

```
Tier 1 BUILD: 8 pass, 0 fail
Tier 2 MOCK:  41 pass, 0 fail
VERDICT: PASS
```

Command: `node scripts/hostile-audit.mjs --mock-only --skip-install --force-mock`

## Issues found and fixed

### 1. Typecheck gate failing (BUILD tier)

**Symptom:** `pnpm typecheck` failed in fresh/unzipped workspaces.

| Sub-issue | Cause | Fix |
|-----------|-------|-----|
| `lib/db` — `tsc: command not found` | `typescript` devDependency not linked until `pnpm install` | Documented; run `npx pnpm@9 install` after unzip |
| `app` — partner-portal project reference | `partner-portal/tsconfig.json` lacked `composite: true` | Added composite + `emitDeclarationOnly` pattern matching other workspace libs |
| `server` — OpenAI exports | Stale/broken declarations in `integrations-openai-ai-server` image/audio re-exports | Re-export `openai` from `openai-instance`; added `typecheck` script + `typescript` devDep |

### 2. Login broken without Postgres (MOCK/demo mode)

**Symptom:** `/api/auth/login` returned `503 service_unavailable` when `DATABASE_URL` unset, even with `AUDIT_PARTNER_MOCK=1`. Admin API tests passed (audit crafts JWTs directly) but **browser login failed** — users saw "Database is not reachable".

**Fix:** When `AUDIT_PARTNER_MOCK=1`, `/api/auth/login` and `/api/auth/me` use in-memory demo accounts from `admin-memory-store.ts`:

| Email | Role | Password |
|-------|------|----------|
| `admin@adspot.demo` | admin | `password123` |
| `oadeagbo@gmail.com` | super_admin | `password123` |
| `brand@adspot.demo` | brand | `password123` |
| `alice@reviewer.demo` | reviewer | `password123` |

**Files:** `server/src/lib/admin-memory-store.ts`, `server/src/routes/auth.ts`

### 3. Routing regressions — none found

Prior fixes (Jul 31) for wouter nested-router double-prefix (`/brands/brands/login`) remain correct. Verified:

| Route | HTTP | Browser |
|-------|------|---------|
| `/` | 200 | Landing renders, Start earning CTA visible |
| `/earn/login` | 200 | Reviewer login form |
| `/earn/register` | 200 | OK |
| `/brands` | 200 | Redirects to `/brands/login` (not double-prefix) |
| `/brands/login` | 200 | Brand/admin login form |
| `/brands/dashboard` | 200 | SPA serves (auth-gated client-side) |
| `/brands/admin/dashboard` | 200 | SPA serves (auth-gated client-side) |
| `/brands/admin/adspotx` | 200 | AdSpotX admin page in bundle |
| `/login` | 200 | Legacy → earn login |
| `/admin/dashboard` | 301 | → `/brands/admin/dashboard` |

Admin login race fix (deferred redirect via `useEffect` + `sessionUserRef`) from `docs/ADSPOT-ADMIN-LOGIN-FIX.md` is present and verified: `admin@adspot.demo` → `/brands/admin/dashboard` with sidebar (Overview, Users, Financials, AdSpotX, Event Log).

## UX notes (not bugs)

- **Reviewer ad playback** requires a real Postgres DB + seed (`pnpm --filter @workspace/db run seed:accounts`). Skipped in mock audit tier.
- **Landing public stats/packages** show placeholders when API has no DB — expected in demo mode.
- **Production deploy** must set real `DATABASE_URL` in `server/.env`; mock auth is for `AUDIT_PARTNER_MOCK=1` / local demo only.

## Files changed

| File | Change |
|------|--------|
| `partner-portal/tsconfig.json` | `composite` + `emitDeclarationOnly` for project references |
| `partner-portal/package.json` | typecheck without `--noEmit` |
| `lib/integrations-openai-ai-server/package.json` | Added `typecheck` script + `typescript` devDep |
| `lib/integrations-openai-ai-server/src/image/index.ts` | Fix `openai` re-export |
| `lib/integrations-openai-ai-server/src/audio/index.ts` | Fix `openai` re-export |
| `server/src/lib/admin-memory-store.ts` | `tryMockLogin`, `getMockUserByEmail/Id`, `MOCK_DEMO_PASSWORD` |
| `server/src/routes/auth.ts` | Mock login + `/auth/me` fallback when `AUDIT_PARTNER_MOCK=1` |

## Verification steps

```bash
cd AdSpot-Unified-3
npx pnpm@9 install
npx pnpm@9 run typecheck   # all 8 workspace packages pass
npx pnpm@9 run build
node scripts/hostile-audit.mjs --mock-only --skip-install --force-mock   # VERDICT: PASS

# Demo mode (no Postgres)
PORT=3001 STATIC_DIR=./app/dist AUDIT_PARTNER_MOCK=1 node server/dist/index.mjs

# API login without DB
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@adspot.demo","password":"password123"}' | jq '.user.role'
# → "admin"

# Browser
open http://localhost:3001/brands/login
# Sign in admin@adspot.demo / password123 → /brands/admin/dashboard
```

## Package

Zip artifact: `~/Downloads/adspotlatest04aug.zip`
