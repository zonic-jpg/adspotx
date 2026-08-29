# AdSpot admin seed status

## Code (GitHub Contents API pushed 2026-08-29)
- Act-as switcher for admin/super_admin → brand/admin/reviewer
- requireRole elevates admin/super_admin (no unauthorized on admin APIs)
- Reviewer public display_name (Settings + earn Profile + leaderboard)
- ComNavig ×20 campaigns SQL + ops schema parts
- Netlify build: scripts/netlify-build.sh applies SQL then builds SPA

## SQL apply
- Prefer Netlify build env SUPABASE_ACCESS_TOKEN → scripts/apply-adspot-sql.mjs
- Files: ops_00..03 + 20260829_adspot_comnavig_seed.sql
- Soft-fail so deploy still ships if management API flaky

## Brand
- ComNavig attached to oadeagbo@gmail.com
- 20 campaign titles, questions, sessions, ledger, redemptions, leaderboard snapshot
- Reviewer display name: Femi Reviews
