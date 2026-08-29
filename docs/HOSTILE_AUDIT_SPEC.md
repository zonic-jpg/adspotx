# Hostile Audit Specification — AdSpot

Canonical script: `scripts/hostile-audit.mjs`  
Report: `docs/HOSTILE_AUDIT_REPORT.md` (auto-generated each run)

## Purpose

Mirror what a **real user** experiences — three tiers aligned with the MyYanga v5 model.

## Tiers

### Tier 1 — BUILD GATE

| Check | Proves |
|-------|--------|
| `pnpm install` | Dependencies resolve |
| `pnpm typecheck` | TypeScript clean |
| `pnpm test` | Unit tests pass |
| `pnpm build` | API server + SPA + partner-portal build |
| `migrations_adspot_partners.sql` | Partner tables migration exists |
| Partner program docs | `ADSPOT_NETWORK_PARTNER_PROGRAM.md`, `PARTNER_PORTAL_INTEGRATION.md` |

### Tier 2 — MOCK (local unified server)

| Check | Proves |
|-------|--------|
| Server boot | Built `server/dist` + `app/dist` on audit port |
| SPA routes 200 | `/`, `/earn/*`, `/brands/*`, `/partners`, `/partners/integration` |
| `/login` redirect | Legacy `/login` → `/earn/login` (not 404) |
| Partner integration API | GET inactive → POST activate → GET active with `apiKey` |
| Integrate button UI | Default inactive badge; activate via API confirmed in DOM |
| Internal earn links | No bare `/login` hrefs in built SPA shell |

**Hard rules:** Never pass if routes 404. Never pass if UI shows active without API `adspotLinked: true`.

Server runs with `AUDIT_PARTNER_MOCK=1` for partner API without Postgres.

### Tier 3 — LIVE

Runs when `DATABASE_URL` is set and not a placeholder (from `server/.env` or env).

| Check | Proves |
|-------|--------|
| `/api/healthz` | `db: connected` |
| Auth login smoke | Demo accounts when DB seeded |
| Partner activate (live DB) | Real Postgres integration row |

If no credentials: **SKIPPED** with honest message (verdict may be PARTIAL).

## Verdict

| Verdict | Condition |
|---------|-----------|
| **FAIL** | Any Tier 1 or Tier 2 failure |
| **PARTIAL** | Tier 1+2 pass; Tier 3 skipped or failed |
| **PASS** | All executed tiers pass |

## Scripts

```bash
pnpm run audit:hostile              # all tiers
pnpm run audit:hostile:mock-only    # tier 1 + 2 only
```

Flags: `--tier1-only`, `--skip-install`, `--force-mock`
