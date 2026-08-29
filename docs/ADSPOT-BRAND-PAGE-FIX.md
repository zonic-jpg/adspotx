# AdSpot Brand Page Regression Fix — 31 July 2026

## Symptom
Brand portal stopped loading entirely after the admin-routing fix earlier today. `/brands`, `/brands/login`, and `/brands/dashboard` showed a blank screen or 404 — not a pre-existing issue.

## Root cause
**Double-prefixed paths inside wouter's nested `/brands` router.**

`App.tsx` mounts `BrandSection` with `<Route path="/brands" nest>`, so all child routes and `Redirect`/`setLocation` targets are resolved relative to `/brands` via `absolutePath(to, base)`:

```
absolutePath("/brands/login", "/brands") → "/brands/brands/login"  ❌
absolutePath("/login", "/brands")        → "/brands/login"         ✓
```

The prior admin-routing fix (Bug 3) changed `ProtectedRoute` redirects and `Login.tsx` post-login navigation from nested-relative paths (`/login`, `/dashboard`, `/admin/dashboard`) to full paths (`/brands/login`, `/brands/dashboard`, `/brands/admin/dashboard`). That broke every in-router redirect:

| Route visited | Broken redirect target | Result |
|---|---|---|
| `/brands` | `/brands/brands/login` | No matching route → blank / 404 |
| `/brands/login` (after auth) | `/brands/brands/dashboard` | Same |
| Protected routes | `/brands/brands/login` | Redirect loop / blank |

`Register.tsx` was unaffected because it already used nested-relative `setLocation("/dashboard")`.

Root-level redirects in `App.tsx` and `server/src/app.ts` (`/admin/*` → `/brands/admin/*`) are correct — they run outside the nested router.

## Fix
Revert in-router navigation to **nested-relative** paths (matching `Register.tsx` and `earn/section.tsx` conventions):

| File | Change |
|---|---|
| `app/src/brands/section.tsx` | `Redirect to="/login"`, `/dashboard`, `/admin/dashboard` |
| `app/src/brands/pages/Login.tsx` | `setLocation("/dashboard")` and `setLocation("/admin/dashboard")` |

Keep absolute `/brands/...` paths only for **full-page** navigation (`window.location.href`, `<a href>`).

## Files changed
- `app/src/brands/section.tsx`
- `app/src/brands/pages/Login.tsx`

## Verify
```bash
cd /Users/olufemiadeagbo/Downloads/AdSpot-Unified-3
pnpm run build
PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs

# All should return HTTP 200 (SPA shell)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/login
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/dashboard

# Legacy admin redirect still works
curl -sI http://localhost:3001/admin/dashboard | grep -i location
# → /brands/admin/dashboard

# Manual: open /brands/login → sign in → lands on /brands/dashboard (brand) or /brands/admin/dashboard (admin)
```

## Package
Zip artifact: `~/Downloads/adspotlatest31july.zip`
