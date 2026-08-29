# AdSpot Admin Console Fix — 4 August 2026

## Symptom
After the admin login fix, operators could reach `/brands/admin/dashboard` but **Users**, **Event Log**, and **Financials** appeared empty or broken — stats showed dashes, tables said "No users/events found", or API failures were invisible.

## Root causes

### 1. Silent API failures (primary UX bug)
Admin list pages (`AdminUsers`, `AdminEvents`, overview widgets) treated failed queries as **empty data**. When `/api/admin/*` returned 500 (database down) or 403/401 (auth), the UI showed "No users found" / "No recent activity" instead of an error — indistinguishable from a genuinely empty platform.

### 2. Duplicated / inconsistent API helpers
`AdminDashboard` and `AdminFinancials` each inlined `fetch` + token logic while `AdminUsers`/`AdminEvents` used `@workspace/api-client-react` hooks. Mixed paths made debugging harder; error parsing differed between pages.

### 3. Minor routing / nav gaps
- No in-router redirect for bare `/brands/admin` → dashboard
- Sidebar order did not match operator spec (Overview → Users → Financials → AdSpotX → Event Log)
- `AdminAdSpotX` partner portal link used `/partners` inside nested `/brands` router → `/brands/partners` (404); fixed with wouter absolute `~/partners`

### 4. Server query hardening + mock tier data
`GET /admin/users` and `GET /admin/events` use Drizzle `desc(table.createdAt)` for reliable ordering.

When `AUDIT_PARTNER_MOCK=1` (hostile audit Tier 2, no Postgres), admin list endpoints serve **in-memory demo rows** from `server/src/lib/admin-memory-store.ts` so Users / Events / Financials are populated without a database. With a real `DATABASE_URL` + seed, the same routes read from Postgres.

## Fix

| File | Change |
|------|--------|
| `app/src/brands/lib/adminApi.ts` | Shared `adminApiFetch` + error message helper |
| `app/src/brands/components/admin/AdminQueryState.tsx` | Loading / error / empty wrapper for admin tables |
| `app/src/brands/pages/admin/AdminUsers.tsx` | Error states, `super_admin` badge, test ids |
| `app/src/brands/pages/admin/AdminEvents.tsx` | Error states, test ids |
| `app/src/brands/pages/admin/AdminDashboard.tsx` | Shared API helper, error banners for stats & events |
| `app/src/brands/pages/admin/AdminFinancials.tsx` | Shared API helper, stats error banner, test id |
| `app/src/brands/pages/admin/AdminAdSpotX.tsx` | Shared API helper, `~/partners` link fix |
| `app/src/brands/section.tsx` | Redirect `/admin` → `/admin/dashboard` |
| `app/src/brands/components/layout/DashboardLayout.tsx` | Sidebar order: Overview, Users, Financials, AdSpotX, Event Log, All Ads |
| `server/src/routes/admin.ts` | Drizzle `desc()` for users/events ordering; mock memory store when `AUDIT_PARTNER_MOCK=1` |
| `server/src/lib/admin-memory-store.ts` | Demo users, events, stats, redemptions, points, brands for mock tier |
| `scripts/hostile-audit.mjs` | SPA routes + bundle markers + admin API data checks |

## Verify

### 1. Build
```bash
cd /Users/olufemiadeagbo/Downloads/AdSpot-Unified-3
pnpm run build
```

### 2. Start (real `DATABASE_URL` + seed)
```bash
# server/.env: DATABASE_URL, JWT_SECRET
pnpm --filter @workspace/db run seed:accounts   # if fresh
PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs
```

### 3. Hostile audit (mock tier includes admin checks)
```bash
node scripts/hostile-audit.mjs --mock-only
```

### 4. curl — SPA shells (HTTP 200)
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/admin/users
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/admin/events
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/admin/financials
```

### 5. curl — admin APIs (after login)
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@adspot.demo","password":"password123"}' | jq -r '.token')

curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/users?limit=5 | jq '.total, (.users|length)'
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/events?limit=5 | jq '.total, (.events|length)'
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/admin/stats | jq '.totalUsers, .totalPointsIssued'
```

### 6. Manual browser
1. Open `http://localhost:3001/brands/login`
2. Sign in as `admin@adspot.demo` / `password123`
3. Sidebar: **Overview**, **Users**, **Financials**, **AdSpotX**, **Event Log**
4. **Users** → table lists accounts with role badges (after seed)
5. **Event Log** → audit events (run seed or use platform to generate activity)
6. **Financials** → KPI cards + Redemptions / Points Ledger / Brands tabs
7. If database is down, sections show a red **Failed to load data** banner (not silent empty tables)

### Seed credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@adspot.demo` | `password123` |
| Super admin | `oadeagbo@gmail.com` | `password123` |

For demo events/users data, also run full seed when appropriate:
```bash
pnpm --filter @workspace/db run seed
```

## Package
Zip artifact: `~/Downloads/adspotx-latest.zip` (via `pnpm run package:staging`)

Consolidated changelog: `docs/ADSPOTX-RELEASE-NOTES-AUG2026.md`
