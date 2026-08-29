# AdSpot Network Partner Program

Commercial and technical overview for newspapers, digital publishers, and media outlets joining the AdSpot review network.

## Value proposition

| Stakeholder | Benefit |
|-------------|---------|
| **Publisher** | Monetise editorial inventory with verified brand-review campaigns — without building ad tech |
| **Brands** | Reach engaged audiences via short-form video reviews on trusted media properties |
| **Reviewers** | Earn points on AdSpot for authentic feedback (existing earn portal) |

## Commercial model

- **Rev-share:** 60% publisher / 30% reviewer pool / 10% AdSpot platform (pilot terms; negotiable at scale)
- **Verification:** Completion webhooks + minimum watch-time thresholds before payout
- **Pilot:** 90-day trial, no minimum inventory commitment; integration inactive until partner opts in
- **Settlement:** Monthly NGN statements; Paystack/Flutterwave for brand top-ups (existing AdSpot rails)

## Technical architecture

```text
┌─────────────────────┐     default: OFF      ┌──────────────────┐
│ Partner Portal      │ ────────────────────► │ AdSpot core      │
│ (profile, slots,    │  [Integrate button]   │ (earn / brands)  │
│  revenue view)      │ ◄── API key + tag ─── │                  │
└─────────────────────┘                       └──────────────────┘
```

1. **Partner Management Portal** — standalone module (`partner-portal/`) or mounted at `/partners`
2. **Default inactive** — `adspot_linked = false`; no campaign routing until activation
3. **One-click integrate** — issues embed script, API key, webhook URL; flips `adspot_linked = true`
4. **Tag integration** — `<script src="…/embed/partner.js" data-partner-id="…" data-api-key="…">`
5. **Completion webhooks** — `POST /api/partners/:id/webhooks/completions` (brand-verified payouts)

## Database

Tables (see `lib/db/migrations_adspot_partners.sql`):

- `network_partners` — outlet profile
- `partner_integrations` — link state, keys, embed config (default `adspot_linked = false`)

## Onboarding checklist

1. Create partner record (`POST /api/partners`)
2. Configure slots in Partner Portal (inventory UI)
3. When ready: **Integrate with AdSpot** → copy embed tag
4. Run hostile audit Tier 2+ to verify inactive→active flow

## Related docs

- [PARTNER_PORTAL_INTEGRATION.md](./PARTNER_PORTAL_INTEGRATION.md) — API contract and button behaviour
- [HOSTILE_AUDIT_SPEC.md](./HOSTILE_AUDIT_SPEC.md) — automated verification tiers
