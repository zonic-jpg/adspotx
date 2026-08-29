# AdSpot Fix Report — 31 July 2026

Four production bugs fixed in `AdSpot-Unified-3`: landing CTA visibility, AI analytics summary failures, admin console routing after brand-portal login, and a brand-page regression from the admin-routing fix.

---

## Bug 1: Landing page — "Start earning" button not displayed

### Root cause
The only "Start earning" control lived inside the **Live campaigns** section, which was wrapped in `{videos?.videos && videos.videos.length > 0 && (...)}`. When the public videos API returned an empty list (fresh deploy, no active ads), the entire section — including the CTA — was omitted from the DOM.

The outline `Button` variant also inherited background/text without explicit `text-foreground`, making it easy to blend into `bg-muted/20` sections on some themes.

### Evidence
- `app/src/landing/pages/Landing.tsx` line 241 (pre-fix): conditional render gated on `videos.videos.length > 0`
- Hostile audit Tier 2 now checks the built SPA bundle for `landing-start-earning` / "Start earning"

### Fix
1. **Always render** the Live campaigns header + "Start earning" link (`data-testid="landing-start-earning"`)
2. Show the video carousel only when videos exist; empty state copy when none
3. Added hero + navbar CTAs (`landing-start-earning-hero`, `landing-start-earning-nav`) linking to `/earn/register`
4. Explicit `text-foreground border-border` on outline buttons

### Verify
```bash
pnpm run build
# Open http://localhost:3001/ — "Start earning" visible in navbar, hero, and Live campaigns (even with zero videos)
node scripts/hostile-audit.mjs --mock-only --skip-install
```

---

## Bug 2: AI analytics summary not working

### Root cause
1. OpenAI client required `AI_INTEGRATIONS_OPENAI_*` env vars only — deployments using standard `OPENAI_API_KEY` failed silently at lazy init
2. Placeholder key `sk-...` in `.env.example` was treated as valid until the API call failed
3. `POST /api/brands/analytics/ai-summary` returned generic 500 / stream errors without a clear configuration message
4. `AISummaryPanel` parsed non-OK responses as raw text instead of JSON `message`

### Evidence
- `lib/integrations-openai-ai-server/src/openai-instance.ts` — threw only on `AI_INTEGRATIONS_OPENAI_API_KEY`
- `server/src/routes/brands.ts` — no pre-flight config check before SSE stream

### Fix
1. `resolveOpenAIConfig()` — accepts `AI_INTEGRATIONS_OPENAI_*` **or** `OPENAI_API_KEY` / `OPENAI_BASE_URL`
2. `isOpenAIConfigured()` / `getOpenAIConfigError()` — rejects empty and placeholder keys
3. AI summary route returns **503** with explicit message when not configured
4. `AISummaryPanel` parses JSON error bodies and surfaces `message` to the user
5. `server/.env.example` documents both env naming conventions

### Required env (pick one pair)
```env
AI_INTEGRATIONS_OPENAI_API_KEY=sk-your-real-key
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
# OR
OPENAI_API_KEY=sk-your-real-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### Verify
```bash
# Without key — expect 503 with clear message in brand dashboard AI panel
curl -X POST http://localhost:3001/api/brands/analytics/ai-summary \
  -H "Authorization: Bearer <brand-token>" -H "Content-Type: application/json" -d '{}'

# With valid key — streaming SSE summary in brand dashboard → Generate AI Summary
```

---

## Bug 3: Admin login only grants brand portal access

### Root cause
Admin routing used **root-level** paths (`/admin/dashboard`) while the admin console lives under the nested brands router at `/brands/admin/*`.

`app/src/App.tsx` mapped legacy `/admin/*` → `/brands/login`, so after admin login:
1. `setLocation("/admin/dashboard")` hit the root catch-all
2. User was bounced to `/brands/login` or stuck on brand routes
3. `ProtectedRoute` redirects also used `/admin/dashboard` (root) instead of `/brands/admin/dashboard`

Brand users worked because `/brands/dashboard` stayed inside the nested router.

### Evidence
- `app/src/App.tsx` (pre-fix): `<Route path="/admin/*">{() => <Redirect to="/brands/login" />}</Route>`
- `app/src/brands/pages/Login.tsx` (pre-fix): `setLocation("/admin/dashboard")`
- Seed accounts: `oadeagbo@gmail.com` → `super_admin`, `admin@adspot.demo` → `admin` (`lib/db/src/seed-accounts.ts`)

### Fix
1. Legacy `/admin` and `/admin/:rest*` now redirect to `/brands/admin/dashboard` and `/brands/admin/:rest`
2. Login success + `ProtectedRoute` use full paths `/brands/admin/dashboard` and `/brands/dashboard`
3. Login page auto-redirects authenticated admin/super_admin users to admin console
4. Hostile audit: `/brands/admin/dashboard` route 200 + legacy `/admin/dashboard` forward check

### Verify
```bash
pnpm run build && PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs
# Login at /brands/login as admin@adspot.demo / password123 (after seed)
# → lands on /brands/admin/dashboard with Admin nav (Overview, Users, Financials, …)
# oadeagbo@gmail.com / password123 → full super_admin access
curl -I http://localhost:3001/admin/dashboard  # should not 302 to /brands/login
```

---

## Bug 4: Brand page not loading (regression from Bug 3 fix)

### Root cause
Bug 3 changed in-router `Redirect` and `setLocation` targets to full `/brands/...` paths. Inside wouter's nested `<Route path="/brands" nest>`, those resolve to double-prefixed URLs like `/brands/brands/login`, so no route matched and the brand portal appeared blank.

### Fix
Use nested-relative paths in `section.tsx` and `Login.tsx` (`/login`, `/dashboard`, `/admin/dashboard`). Root-level `/admin/*` redirects in `App.tsx` and `server/src/app.ts` stay as full `/brands/admin/*` paths.

See `docs/ADSPOT-BRAND-PAGE-FIX.md` for full details.

### Verify
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/brands/login  # 200
# Open /brands/login in browser — login form renders; post-login lands on dashboard
```

---

## Files changed

| File | Change |
|------|--------|
| `app/src/landing/pages/Landing.tsx` | Always-visible Start earning CTA; conditional carousel only |
| `app/src/landing/components/Navbar.tsx` | Navbar Start earning button |
| `app/src/App.tsx` | Legacy `/admin/*` → `/brands/admin/*` |
| `app/src/brands/pages/Login.tsx` | Post-login `setLocation` uses nested-relative paths; auto-redirect if session exists |
| `app/src/brands/section.tsx` | ProtectedRoute redirects use nested-relative paths (`/login`, `/dashboard`, `/admin/dashboard`) |
| `app/src/brands/components/AISummaryPanel.tsx` | JSON error parsing |
| `lib/integrations-openai-ai-server/src/openai-instance.ts` | Env fallbacks + config helpers |
| `lib/integrations-openai-ai-server/src/client.ts` | Export config helpers |
| `server/src/routes/brands.ts` | Pre-flight OpenAI check; clearer errors |
| `server/src/app.ts` | Server-side 301 redirect `/admin/*` → `/brands/admin/*` |
| `server/.env.example` | Document OPENAI_* fallbacks |
| `scripts/hostile-audit.mjs` | Landing CTA + admin route checks |

---

## Build & package

```bash
cd /Users/olufemiadeagbo/Downloads/AdSpot-Unified-3
pnpm run build
node scripts/hostile-audit.mjs --mock-only --skip-install
```

Zip artifact: `~/Downloads/adspotlatest31july.zip`
