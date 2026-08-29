# AdSpotX Version Fix Log

> **Living document** — append a new section for each release. Do not overwrite prior versions.

---

## Version 1.0.0 — AdSpotX v1.0 (5 August 2026)

**Package:** `adspotxv1.0.zip`  
**Audit:** `node scripts/hostile-audit.mjs --mock-only --skip-install --force-mock` → **PASS** (Tier 1: 9 pass; Tier 2: 57 pass; 0 fail)  
**Testing reference:** `ADSPOT-TESTING-REPORT6.pdf`

This release consolidates all fixes from the July–August 2026 hardening session into the first production-ready AdSpotX drop.

---

### Fix 1 — Auth route 404s (wouter nested routes)

**Issues**

- `/earn/login`, `/earn/register`, `/brands/login`, `/brands/register` showed in-browser 404 pages despite HTTP 200 from the server.
- URLs doubled path segments: `/earn/earn/login`, `/brands/brands/login`.
- Legacy `/register` had no redirect; brands not-found linked to typo `/brand/login`.

**Why initially missed**

- Server SPA fallback always returns 200 for unknown client routes, masking routing bugs in curl-only checks.
- Wouter nested routers resolve `router.base + path`; fully-qualified paths inside `<Route path="/earn" nest>` / `<Route path="/brands" nest>` double-prefix silently.
- API auth endpoints (`/api/auth/login`) worked, so failures looked like frontend-only issues.

**Fix applied**

| File | Change |
|------|--------|
| `app/src/App.tsx` | `/register` → `/earn/register` redirect |
| `app/src/earn/section.tsx` | Protected redirect `to="/login"` (nested-relative) |
| `app/src/brands/section.tsx` | Protected redirect `to="/login"` |
| `app/src/earn/components/layout/Navbar.tsx` | Relative auth links |
| `app/src/earn/pages/Login.tsx`, `Register.tsx`, `Landing.tsx` | Relative sign-in/register links |
| `app/src/brands/pages/Login.tsx`, `Register.tsx`, `not-found.tsx` | Relative links; typo fix |

**Convention:** Inside nested sections use `/login`, `/dashboard`. Outside sections use full paths (`/earn/login`, `/brands/login`).

**Future prevention**

- Hostile audit Tier 2: route 200 checks for `/earn/login`, `/brands/login`, `/login not broken`, `no bare /login links in SPA bundle`.
- See `docs/AUTH-404-FIX-REPORT.md`.

**Deploy notes**

- Set `STATIC_DIR=./app/dist` on Railway/AWS or auth pages will return real HTTP 404 in API-only mode.

---

### Fix 2 — Landing "Start earning" CTA missing

**Issues**

- Primary "Start earning" button hidden when public videos API returned an empty list (fresh deploy, no active ads).
- Outline button variant blended into muted backgrounds on some themes.

**Why initially missed**

- CTA was nested inside `{videos.videos.length > 0 && (...)}` — only visible after seed data existed.
- Manual testing on seeded environments did not reproduce empty-feed state.

**Fix applied**

| File | Change |
|------|--------|
| `app/src/landing/pages/Landing.tsx` | Always render Live campaigns header + CTA; hero CTA (`landing-start-earning-hero`); conditional carousel only |
| `app/src/landing/components/Navbar.tsx` | Navbar CTA (`landing-start-earning-nav`); explicit `text-foreground` |

**Future prevention**

- Hostile audit bundle checks: `landing hero Start earning CTA`, `landing navbar Start earning CTA`, `navbar Start earning always visible`.

**Deploy notes**

- No env vars required. Verify `/` shows CTA before DB seed.

---

### Fix 3 — Admin login race (deferred redirect)

**Issues**

- Admin sign-in at `/brands/login` bounced back to login, looped, or landed on brand dashboard instead of `/brands/admin/dashboard`.
- `ProtectedRoute` saw `user === null` because `setLocation` ran before React auth context updated.

**Why initially missed**

- Race is timing-dependent; brand-only logins sometimes appeared to work.
- API login returned correct role — failure was purely client-side navigation order.

**Fix applied**

| File | Change |
|------|--------|
| `app/src/brands/contexts/AuthContext.tsx` | `sessionUserRef` for synchronous post-login user; brand-scoped `/api/auth/me` query key |
| `app/src/brands/pages/Login.tsx` | Remove immediate `setLocation` from `onSuccess`; `useEffect` redirect once `user` is in context |
| `app/src/brands/pages/Register.tsx` | Same deferred-redirect pattern |

**Future prevention**

- Hostile audit: `admin login routes to /admin/dashboard`, `admin login returns admin role`.
- Manual: admin@adspot.demo → `/brands/admin/dashboard` with full sidebar.

**Deploy notes**

- Requires `DATABASE_URL` + `seed:accounts` in production, or `AUDIT_PARTNER_MOCK=1` for demo.

---

### Fix 4 — Admin console silent failures

**Issues**

- Users, Event Log, and Financials showed empty tables ("No users found") when API returned 500/403/401 — indistinguishable from genuinely empty platform.
- Duplicated fetch helpers across admin pages; inconsistent error parsing.
- Sidebar order wrong; `AdminAdSpotX` partner link used `/partners` inside nested router → `/brands/partners` (404).

**Why initially missed**

- Empty-state UI treated all query failures as zero rows.
- Mock audit tier initially crafted JWTs directly, bypassing browser login path that exposed DB-down errors.

**Fix applied**

| File | Change |
|------|--------|
| `app/src/brands/lib/adminApi.ts` | Shared `adminApiFetch` + error helper |
| `app/src/brands/components/admin/AdminQueryState.tsx` | Loading / error / empty wrapper |
| `app/src/brands/pages/admin/AdminUsers.tsx`, `AdminEvents.tsx`, `AdminDashboard.tsx`, `AdminFinancials.tsx`, `AdminAdSpotX.tsx` | Error banners, shared API helper, test ids |
| `app/src/brands/section.tsx` | `/admin` → `/admin/dashboard` redirect |
| `app/src/brands/components/layout/DashboardLayout.tsx` | Sidebar: Overview → Users → Financials → AdSpotX → Event Log |
| `server/src/routes/admin.ts` | Drizzle `desc()` ordering; mock store when `AUDIT_PARTNER_MOCK=1` |
| `server/src/lib/admin-memory-store.ts` | Demo users, events, stats for mock tier |

**Future prevention**

- Hostile audit: `admin users/events/stats API returns data`, bundle markers for admin sections.
- Red **Failed to load data** banner when DB unreachable (not silent empty).

**Deploy notes**

- Railway/AWS: ensure RDS reachable; run `seed:accounts` + full `seed` for events data.

---

### Fix 5 — Brand page blank (`/brands/brands/login`)

**Issues**

- Entire brand portal blank after admin-routing fix: `/brands`, `/brands/login`, `/brands/dashboard` showed blank or 404.
- Redirect targets doubled prefix: `/brands/brands/login`, `/brands/brands/dashboard`.

**Why initially missed**

- Admin-routing fix (Bug 3, 31 Jul) changed in-router paths from nested-relative to full `/brands/...` paths, reintroducing wouter double-prefix inside `<Route path="/brands" nest>`.

**Fix applied**

| File | Change |
|------|--------|
| `app/src/brands/section.tsx` | Revert to nested-relative `Redirect to="/login"`, `/dashboard`, `/admin/dashboard` |
| `app/src/brands/pages/Login.tsx` | Nested-relative `setLocation("/dashboard")` and `setLocation("/admin/dashboard")` |

**Future prevention**

- Hostile audit: route 200 for `/brands`, `/brands/login`, `/brands/dashboard`.
- Code convention documented in `docs/ADSPOT-BRAND-PAGE-FIX.md`.

**Deploy notes**

- No config change. Verify `/brands` redirects to `/brands/login` (not `/brands/brands/login`).

---

### Fix 6 — AdSpotX partner integration

**Issues**

- Partner network module existed standalone but was not integrated into admin console or unified SPA routing.
- No admin UI for partner CRUD, analytics, or integration activate/deactivate.
- Partner portal not reachable at `/partners` inside main app.

**Why initially missed**

- Partner portal was developed as separate module (`partner-portal/`) without end-to-end wiring to admin nav and API auth.

**Fix applied**

| File | Change |
|------|--------|
| `app/src/brands/pages/admin/AdminAdSpotX.tsx` | Admin partner directory, analytics, integration control |
| `app/src/brands/components/layout/DashboardLayout.tsx` | AdSpotX sidebar entry |
| `server/src/routes/partners.ts` | Partner CRUD, analytics, integration APIs |
| `server/src/lib/partner-memory-store.ts` | In-memory store for mock tier |
| `partner-portal/` | Embedded at `/partners/*` routes |
| `scripts/hostile-audit.mjs` | AdSpotX route + API + integrate flow checks |

**Future prevention**

- Hostile audit: partner inactive → activate → active chain; AdSpotX partner list/create/analytics APIs.
- See `docs/ADSPOTX-INTEGRATION.md`.

**Deploy notes**

- Set `ADSPOT_PUBLIC_URL` for embed script base URL.
- `VITE_PARTNER_ID` for default partner UUID in portal UI.

---

### Fix 7 — Reviewer pipeline (ADS07, ADS09, ADS12, ADS13)

**Reference:** `ADSPOT-TESTING-REPORT6.pdf`

| ID | Issue | Root cause | Fix |
|----|-------|------------|-----|
| **ADS07** | Campaign opens with no video; no points on correct answer | Mock questions used invalid `mcq` type; no mock review complete handler; proverb bonus unwired | `multiple_choice` in mock store; `completeMockReview()`; proverb UI + server bonus |
| **ADS09** | Admin login lands on brand dashboard | Login relied on async redirect after `setAuth` | Immediate role-based navigation (later refined to deferred redirect — Fix 3) |
| **ADS12** | Brand cannot delete ads | No DELETE route or UI | `DELETE /api/brands/ads/:adId`; delete buttons in MyAds + AdDetail |
| **ADS13** | Brand-created ads missing from reviewer feed | New ads created as `draft`; YouTube URLs stored as `video` type | Create with `status: active`; `normalizeAdAsset()` for YouTube/Vimeo |

**Why initially missed**

- Mock tier used different question types than UI expected (`mcq` vs `multiple_choice`).
- Brand create defaulted to `draft` status — reviewer feed filters `active` only.
- End-to-end reviewer flow not exercised until QA testing report.

**Fix applied**

| Area | Files |
|------|-------|
| Mock reviewer | `server/src/lib/reviewer-mock-store.ts` |
| Review API | `server/src/routes/reviews.ts`, `server/src/routes/ads.ts` |
| Brand ads | `server/src/routes/brands.ts`, `server/src/lib/asset-normalize.ts` |
| Reviewer UI | `app/src/earn/pages/ReviewSession.tsx` |
| Brand UI | `CreateAd.tsx`, `MyAds.tsx`, `AdDetail.tsx`, `Login.tsx` |
| E2E | `scripts/test-reviewer-flow.mjs`, `scripts/hostile-audit.mjs` |

**Future prevention**

- `node scripts/test-reviewer-flow.mjs http://127.0.0.1:3001` — full pipeline E2E.
- Hostile audit: reviewer login → feed → start → complete → points → leaderboard; brand delete.

**Deploy notes**

- Run `seed:accounts` for demo reviewers; `seed` for active campaign ads in production.

---

### Fix 8 — Video playback (YouTube URL normalization)

**Issues**

- Brand-created ads appeared in reviewer feed but did not play on `/earn/review/:id`.
- YouTube share URLs with extra query params before `v=` (e.g. `watch?feature=shared&v=ID`) stored as `assetType: "video"` with full URL.
- `VideoPlayer` tried native `<video src="https://youtube.com/...">` → blank player.

**Why initially missed**

- Seed ads use bare YouTube IDs with `assetType: "youtube"` — worked in dev.
- Old regex only matched `watch?v=`, not `watch?feature=…&v=`.
- Normalization gap existed on both client create and server persist paths.

**Fix applied**

| File | Change |
|------|--------|
| `server/src/lib/asset-normalize.ts` | Parse `v=` via `URL.searchParams`; `normalizeAdForPlayback()` on read |
| `app/src/lib/adAssetNormalize.ts` | Same rules at brand create time |
| `app/src/earn/lib/adMedia.ts` | `extractYoutubeId`, `resolvePlayableAdMedia` |
| `app/src/earn/components/VideoPlayer.tsx` | Resolver + error UI for unplayable media |
| `server/src/routes/ads.ts` | Normalize on feed/detail responses |
| `server/src/lib/asset-normalize.test.ts` | Unit tests |

**Future prevention**

- `npx vitest run server/src/lib/asset-normalize.test.ts`
- Hostile audit: `asset-normalize unit tests`, `reviewer VideoPlayer resolves pasted URLs`.
- `test-reviewer-flow.mjs` brand YouTube create check.

**Deploy notes**

- No env change. Re-normalization on read fixes legacy rows without migration.

---

### Fix 9 — Mock auth (`AUDIT_PARTNER_MOCK`)

**Issues**

- `/api/auth/login` returned `503 service_unavailable` when `DATABASE_URL` unset, even with `AUDIT_PARTNER_MOCK=1`.
- Browser login failed with "Database is not reachable" while hostile audit passed (audit crafted JWTs directly).

**Why initially missed**

- Auth route required Postgres before mock tier was extended to cover login/me endpoints.
- Tier 2 audit did not initially exercise browser login path.

**Fix applied**

| File | Change |
|------|--------|
| `server/src/lib/admin-memory-store.ts` | `tryMockLogin`, `getMockUserByEmail/Id`, demo accounts |
| `server/src/routes/auth.ts` | Mock login + `/auth/me` when `AUDIT_PARTNER_MOCK=1` |

**Demo accounts (mock mode only)**

| Email | Role | Password |
|-------|------|----------|
| `admin@adspot.demo` | admin | `password123` |
| `oadeagbo@gmail.com` | super_admin | `password123` |
| `brand@adspot.demo` | brand | `password123` |
| `alice@reviewer.demo` | reviewer | `password123` |

**Future prevention**

- Hostile audit: `reviewer/admin/brand login returns correct role` without live DB.
- **Production:** unset `AUDIT_PARTNER_MOCK`; use real `DATABASE_URL` only.

**Deploy notes**

- Railway demo/staging: `AUDIT_PARTNER_MOCK=1` OK for smoke tests without Postgres addon.
- Production AWS/Railway: **never** set `AUDIT_PARTNER_MOCK=1`; use RDS + seed.

---

## Version history template (for future releases)

```markdown
## Version X.Y.Z — AdSpotX vX.Y (DATE)

**Package:** `adspotxvX.Y.zip`
**Audit:** ...
**Testing reference:** ...

### Fix N — Title

**Issues** — ...
**Why initially missed** — ...
**Fix applied** — ...
**Future prevention** — ...
**Deploy notes** — ...
```

---

## Related documentation

| Doc | Purpose |
|-----|---------|
| `docs/ADSPOTX-DEPLOY-GUIDE.md` | Railway + AWS deployment |
| `docs/HOSTILE_AUDIT_REPORT.md` | Latest audit results |
| `docs/ADSPOTX-INTEGRATION.md` | AdSpotX architecture |
| `docs/AUTH-404-FIX-REPORT.md` | Auth routing deep-dive |
| `STAGING_GUIDANCE.md` | Demo credentials and flows |
