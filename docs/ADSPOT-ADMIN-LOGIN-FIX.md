# AdSpot Admin Login Fix — 4 August 2026

## Symptom
Admin accounts (`admin@adspot.demo`, `oadeagbo@gmail.com`) could sign in at `/brands/login` but did not reliably reach `/brands/admin/dashboard`. Users reported being bounced back to login, stuck on the login form, or landing on the brand dashboard instead of the admin console.

## Root cause
**Post-login navigation raced ahead of React auth state.**

`Login.tsx` called `setLocation("/admin/dashboard")` synchronously inside the login mutation `onSuccess` callback, immediately after `setAuth(token, user)`. At that moment:

1. `AuthProvider` had not re-rendered yet — context `user` was still `null`
2. `ProtectedRoute` on `/admin/dashboard` saw no user → `<Redirect to="/login" />`
3. User appeared stuck on login or briefly looped between login and admin routes

Brand-only users sometimes appeared to work because the race was timing-dependent; admin routes hit `adminOnly` checks while `user` was still null, making the failure more visible.

Secondary hardening:
- Brand portal `useGetMe` now uses query key `["/api/auth/me", "brand"]` to avoid stale `/api/auth/me` cache collisions
- `sessionUserRef` in `AuthProvider` exposes the login response user synchronously on the next render while react-query catches up

## Fix

| File | Change |
|------|--------|
| `app/src/brands/contexts/AuthContext.tsx` | `sessionUserRef` for immediate post-login user; brand-scoped me query key; `isLoading` skips when session user present |
| `app/src/brands/pages/Login.tsx` | Remove immediate `setLocation` from `onSuccess`; `useEffect` redirects once `user` is in context |
| `app/src/brands/pages/Register.tsx` | Same deferred-redirect pattern (brand register) |

In-router paths remain **nested-relative** (`/login`, `/admin/dashboard`) — do not use `/brands/...` inside `BrandSection` (see `docs/ADSPOT-BRAND-PAGE-FIX.md`).

## Verify

### 1. Build
```bash
cd /Users/olufemiadeagbo/Downloads/AdSpot-Unified-3
pnpm run build
```

### 2. Start server (requires real `DATABASE_URL` + seed)
```bash
# server/.env: set DATABASE_URL and JWT_SECRET
pnpm --filter @workspace/db run seed:accounts   # if DB is fresh
PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs
```

### 3. curl — SPA routes (HTTP 200)
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/login
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/admin/dashboard
curl -sI http://localhost:3001/admin/dashboard | grep -i location
# → Location: /brands/admin/dashboard
```

### 4. curl — API login returns admin role
```bash
curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@adspot.demo","password":"password123"}' | jq '.user.role'
# → "admin"

curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"oadeagbo@gmail.com","password":"password123"}' | jq '.user.role'
# → "super_admin"
```

### 5. Manual browser
1. Open `http://localhost:3001/brands/login`
2. Sign in as `admin@adspot.demo` / `password123`
3. **Expected:** URL is `/brands/admin/dashboard`, sidebar shows **AdSpot Admin** with Overview, Users, Financials, AdSpotX, Event Log
4. Repeat with `oadeagbo@gmail.com` / `password123` (super_admin — same admin console)

### Seed credentials
| Role | Email | Password |
|------|-------|----------|
| Super admin | `oadeagbo@gmail.com` | `password123` |
| Admin | `admin@adspot.demo` | `password123` |

## Package
Zip artifact: `~/Downloads/adspotlatest04aug.zip`
