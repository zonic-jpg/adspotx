# AdSpotX Integration

AdSpotX is the branded, integrated network partner product inside the main AdSpot unified app. It combines the standalone **partner-portal** module with admin tooling so operators can onboard publishers, activate AdSpot routing, and view network analytics from one console.

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│  AdSpot Unified SPA (app/)                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ /earn/*     │  │ /brands/*    │  │ /partners/*      │  │
│  │ Reviewers   │  │ Brands+Admin │  │ AdSpotX Portal   │  │
│  └─────────────┘  │ /admin/      │  │ (partner-portal) │  │
│                   │  adspotx     │  └──────────────────┘  │
│                   └──────────────┘                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ /api/*
┌───────────────────────────▼─────────────────────────────────┐
│  Express API (server/)                                      │
│  /api/partners — CRUD, integration, analytics               │
│  /api/admin/*  — platform admin (auth required)             │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ Postgres (live)           │
              │ network_partners          │
              │ partner_integrations      │
              └───────────────────────────┘
```

### Modules

| Module | Path | Role |
|--------|------|------|
| `partner-portal/` | Standalone + embedded | Publisher-facing portal (dashboard, slots, revenue, integrate button) |
| `app/src/brands/pages/admin/AdminAdSpotX.tsx` | `/brands/admin/adspotx` | Admin partner directory, analytics, integration control |
| `server/src/routes/partners.ts` | `/api/partners` | Partner API (list, create, integration, analytics) |

Partner portal remains **modular**: run standalone with `pnpm dev:partners` or mount inside the main SPA at `/partners`.

## Routes

### Admin (requires admin/super_admin login at `/brands/login`)

| Route | Description |
|-------|-------------|
| `/brands/admin/adspotx` | AdSpotX admin console — partner CRUD, analytics, integrate button |
| `/brands/admin/partners` | Alias → redirects to `/brands/admin/adspotx` |

Admin sidebar includes **AdSpotX** under the admin nav.

### Partner portal (public SPA routes)

| Route | Description |
|-------|-------------|
| `/partners` | Partner dashboard |
| `/partners/integration` | Integration status + Integrate with AdSpot |
| `/partners/slots` | Inventory slots |
| `/partners/revenue` | Rev-share (populated after integration) |
| `/partners/partners` | Network directory (demo list) |

### API

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/partners` | Admin | List partners with integration status |
| `POST` | `/api/partners` | — | Create partner (+ inactive integration row) |
| `GET` | `/api/partners/:id` | — | Partner profile |
| `GET` | `/api/partners/:id/analytics` | — | Network analytics (mock/live metrics) |
| `GET` | `/api/partners/:id/integration` | — | Integration status (default inactive) |
| `POST` | `/api/partners/:id/integration/activate` | — | Activate AdSpot link |
| `POST` | `/api/partners/:id/integration/deactivate` | — | Deactivate |

See [PARTNER_PORTAL_INTEGRATION.md](./PARTNER_PORTAL_INTEGRATION.md) for the integrate-button contract.

## How to use (admin)

1. Sign in at `/brands/login` as `admin@adspot.demo` or `oadeagbo@gmail.com` (after `seed:accounts`).
2. Open **AdSpotX** in the admin sidebar (or go to `/brands/admin/adspotx`).
3. Click **Add partner** to create a network outlet record.
4. Select a partner in the directory table.
5. Review analytics in the right panel (mock metrics until live campaign data is wired).
6. Use **Integration control** → **Integrate with AdSpot** to activate routing (inactive by default).
7. Open **Partner portal** to preview the publisher-facing UI at `/partners`.

## How to use (publisher)

Partners can use the standalone portal or the embedded `/partners` routes. Integration starts **inactive** until they confirm activation — see PARTNER_PORTAL_INTEGRATION.md.

## Environment

| Variable | Purpose |
|----------|---------|
| `AUDIT_PARTNER_MOCK=1` | In-memory partner store for hostile audit Tier 2 |
| `ADSPOT_PUBLIC_URL` | Base URL in embed script |
| `VITE_PARTNER_ID` | Default partner UUID in portal UI |

## Testing

```bash
pnpm run build
node scripts/hostile-audit.mjs --mock-only   # BUILD + MOCK
node scripts/hostile-audit.mjs             # + LIVE if DATABASE_URL set
```

AdSpotX-specific audit checks: admin route 200, partner list auth, partner create, analytics API, integrate inactive→active chain.

## Related docs

- [PARTNER_PORTAL_INTEGRATION.md](./PARTNER_PORTAL_INTEGRATION.md)
- [ADSPOT_NETWORK_PARTNER_PROGRAM.md](./ADSPOT_NETWORK_PARTNER_PROGRAM.md)
- [ADSPOTX-CHANGELOG.md](./ADSPOTX-CHANGELOG.md)
