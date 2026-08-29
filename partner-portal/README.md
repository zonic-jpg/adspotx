# AdSpot Network Partner Portal

Distinct module for media partners — **AdSpot integration inactive by default** until they click **Integrate with AdSpot**.

## Quick start

```bash
# From repo root
pnpm install
pnpm dev:api          # terminal 1 — API on :3001
pnpm dev:partners     # terminal 2 — portal on :5174

# Or embedded in main AdSpot app
pnpm dev:app          # includes /partners routes
```

## Build

```bash
pnpm --filter @workspace/partner-portal run build
```

Produces a standalone SPA in `partner-portal/dist/` (open `index.html` via `pnpm preview`).

## Structure

```
partner-portal/src/
  components/IntegrateAdSpotButton.tsx
  lib/adspotBridge.ts, partnerApi.ts, integrationState.ts
  pages/ Dashboard, Integration, Slots, Revenue, Partners
  App.tsx, main.tsx, mount.tsx
```

## Docs

- `docs/ADSPOT_NETWORK_PARTNER_PROGRAM.md`
- `docs/PARTNER_PORTAL_INTEGRATION.md`

## Audit

```bash
pnpm run audit:hostile:mock-only
```
