# AdSpotX Changelog

## v1.2.0 — AdSpotX integrated release (4 Aug 2026)

### Added

- **AdSpotX admin console** at `/brands/admin/adspotx` (alias `/brands/admin/partners`)
  - Partner directory with create form
  - Per-partner analytics panel
  - Integration control using `IntegrateAdSpotButton` from partner-portal
- **API**
  - `GET /api/partners` — admin-only partner list with integration status
  - `GET /api/partners/:id/analytics` — network analytics (mock metrics; live-ready shape)
- **Navigation**
  - Admin sidebar link: **AdSpotX**
  - Admin dashboard quick action
  - Landing footer link: AdSpotX Network → `/partners`
- **Branding**
  - Partner portal header rebranded to **AdSpotX**
- **Docs**
  - `docs/ADSPOTX-INTEGRATION.md` — architecture and usage
  - Hostile audit extended with AdSpotX Tier 2 tests
- **Package**
  - `~/Downloads/adspotx-latest.zip` via `pnpm run package:staging`

### Unchanged (by design)

- Partner portal remains standalone (`pnpm dev:partners`)
- `/partners/*` public routes for publisher UI
- Integration default state: **inactive** until explicit activate
- Wouter nested-relative paths in brands section (`/admin/adspotx`, not `/brands/admin/adspotx` inside components)

### Admin login

Admin login uses nested-relative redirects (`/admin/dashboard` → `/brands/admin/dashboard`). Legacy `/admin/*` URLs redirect server-side and in `App.tsx`.
