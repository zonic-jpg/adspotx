# Partner Portal Integration

How the **Integrate with AdSpot** button works, API contract, and default inactive state.

## Default state: inactive

Every new partner gets `partner_integrations.adspot_linked = false`:

- Partner Portal shows **Not connected** (muted/grey)
- No API key, embed tag, or webhook URL is exposed
- Campaigns do **not** route to AdSpot
- UI never shows “connected” without a successful API response

Local cache (`integrationState.ts`) mirrors API state but is overwritten on every fetch — the server is authoritative.

## Activate flow

```text
User clicks "Integrate with AdSpot"
  → Confirm modal
  → POST /api/partners/:id/integration/activate
  → Server sets adspot_linked=true, generates api_key + embed_config
  → UI shows "AdSpot Connected" + copyable embed tag
```

**Hard rule (hostile audit):** If activate returns without `adspotLinked: true` and `apiKey`, the button must **not** show active.

## API contract

Base path: `/api/partners` (Express router in `server/src/routes/partners.ts`)

| Method | Path | Response |
|--------|------|----------|
| `POST` | `/partners` | `{ partner }` — creates partner + inactive integration row |
| `GET` | `/partners/:id` | `{ partner }` |
| `GET` | `/partners/:id/integration` | `{ status: "inactive"\|"active", adspotLinked, apiKey?, embedScript?, webhookUrl? }` |
| `POST` | `/partners/:id/integration/activate` | Active integration + `message` |
| `POST` | `/partners/:id/integration/deactivate` | Inactive integration + `message` |

### Example — inactive

```json
{
  "status": "inactive",
  "adspotLinked": false,
  "partnerId": "00000000-0000-4000-8000-000000000001",
  "activatedAt": null,
  "deactivatedAt": null
}
```

### Example — after activate

```json
{
  "status": "active",
  "adspotLinked": true,
  "partnerId": "…",
  "apiKey": "asp_…",
  "embedScript": "<script src=\"…\" …></script>",
  "webhookUrl": "https://…/api/partners/…/webhooks/completions",
  "activatedAt": "2026-07-29T…"
}
```

## Client modules (`partner-portal/src/lib/`)

| File | Role |
|------|------|
| `partnerApi.ts` | Fetch wrappers |
| `adspotBridge.ts` | `activateIntegration`, `deactivateIntegration`, `getIntegrationStatus` |
| `integrationState.ts` | localStorage cache; `defaultIntegration()` always inactive |
| `IntegrateAdSpotButton.tsx` | UI with `data-testid` hooks for audit |

## Mount options

### Standalone dev

```bash
pnpm dev:partners   # http://localhost:5174
```

### Embedded in AdSpot SPA

Route: `/partners` (see `app/src/partners/section.tsx`)

### Programmatic mount

```ts
import { mountPartnerPortal } from "@workspace/partner-portal/mount";

const unmount = mountPartnerPortal({ container: document.getElementById("root")! });
```

## Audit / mock mode

When `AUDIT_PARTNER_MOCK=1`, partner routes use an in-memory store (`server/src/lib/partner-memory-store.ts`) so Tier 2 hostile audit can test activate without Postgres.

Audit partner ID: `00000000-0000-4000-8000-000000000001`

## Environment

| Variable | Purpose |
|----------|---------|
| `ADSPOT_PUBLIC_URL` | Base URL in embed script (default: `https://adspot.ng`) |
| `VITE_PARTNER_ID` | Demo partner UUID in portal UI |
| `AUDIT_PARTNER_MOCK` | In-memory partner API for hostile audit |
