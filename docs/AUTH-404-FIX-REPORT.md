# Auth 404 Fix Report — 30 July 2026

## Root cause

**Wouter nested-router path double-prefixing** inside `/earn` and `/brands` sections.

`EarnSection` and `BrandSection` are mounted with `<Route path="/earn" nest>` / `<Route path="/brands" nest>`. Inside a nested router, wouter resolves links and redirects as `router.base + path`. Components were using **fully-qualified** paths such as `/earn/login` and `/brands/register` from **inside** those nested routers, which produced client-side URLs like:

| Intended | Actual (broken) |
|----------|-----------------|
| `/earn/login` | `/earn/earn/login` |
| `/earn/register` | `/earn/earn/register` |
| `/brands/login` | `/brands/brands/login` |
| `/brands/register` | `/brands/brands/register` |

The server SPA fallback still returned **HTTP 200** (serves `index.html`), but React routing had no match → **404 page shown in the browser**. This matches user symptoms: API validation worked (duplicate email errors) but post-submit navigation and auth links showed 404.

Secondary issues fixed:
- Missing top-level `/register` redirect (legacy bare path)
- Brands not-found page linked to typo `/brand/login`

## Files changed

| File | Change |
|------|--------|
| `app/src/App.tsx` | Added `/register` → `/earn/register` redirect |
| `app/src/earn/section.tsx` | Protected redirect `to="/login"` (not `/earn/login`) |
| `app/src/brands/section.tsx` | Protected redirect `to="/login"` (not `/brands/login`) |
| `app/src/earn/components/layout/Navbar.tsx` | Relative auth links (`/login`, `/register`, `/dashboard`) |
| `app/src/earn/pages/Login.tsx` | Register link → `/register` |
| `app/src/earn/pages/Register.tsx` | Sign-in link → `/login` |
| `app/src/earn/pages/Landing.tsx` | Sign-in link → `/login` |
| `app/src/brands/pages/Login.tsx` | Register link → `/register` |
| `app/src/brands/pages/Register.tsx` | Sign-in link → `/login` |
| `app/src/brands/pages/not-found.tsx` | Fixed `/brand/login` → `/brands/login` |
| `scripts/package-staging.mjs` | Dated alt zip → `adspotlatest30july.zip` |

**Convention:** Inside nested sections use relative paths (`/login`, `/dashboard`). Outside sections (landing nav, `RoleEntry`, `window.location.href`) keep full paths (`/earn/login`, `/brands/login`).

## curl evidence (SPA routes — all HTTP 200)

Server started with:
```bash
PORT=3199 STATIC_DIR=./app/dist AUDIT_PARTNER_MOCK=1 node server/dist/index.mjs
```

```
200 /
200 /earn
200 /earn/login
200 /earn/register
200 /earn/dashboard
200 /brands
200 /brands/login
200 /brands/register
200 /brands/admin/dashboard
200 /login
200 /register
200 /admin
```

## API auth endpoints (not 404 — correct error codes)

```
POST /api/auth/login   {}  → HTTP 400 (validation_error — route exists)
POST /api/auth/register {} → HTTP 400 (validation_error — route exists)
GET  /api/auth/me         → HTTP 401 (unauthorized — route exists)
```

## Hostile audit — Tier 2 MOCK (auth routes)

```
node scripts/hostile-audit.mjs --mock-only --skip-install --force-mock
```

Result: **20 pass, 0 fail** on Tier 2 MOCK including:
- route 200: earn login
- route 200: earn register
- route 200: brands login
- /login not broken (SPA serves app)
- no bare /login links in SPA bundle

## Build & package

```bash
npx pnpm@9 run build          # ✓ success
node scripts/package-staging.mjs  # ✓ success
```

Output zips:
- `/Users/olufemiadeagbo/Downloads/AdSpot-partner-portal-staging.zip`
- `/Users/olufemiadeagbo/Downloads/adspotlatest30july.zip`

## Deploy note

Ensure `STATIC_DIR=./app/dist` is set when starting the server so SPA fallback serves auth pages. API-only mode (no `STATIC_DIR`) will return real HTTP 404 for `/earn/login` etc.
