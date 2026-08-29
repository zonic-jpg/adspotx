# AdSpot — Complete Platform Overview

**Document date: 29 July 2026**  
**Confidential — AdSpot Nigeria / Africa**

---

## Table of Contents

1. [Part A — Features](#part-a-features)
2. [Part B — Technical Implementation](#part-b-technical-implementation)
3. [Part C — Commercial Recommendations](#part-c-commercial-recommendations)

---

## Part A — Features

### Executive Summary

AdSpot is a rewarded-attention advertising platform built for Nigeria and broader Africa. Instead of interruptive banners that users skip, AdSpot pays reviewers to watch brand creatives, answer comprehension questions, and earn points redeemable for airtime, data, and gift vouchers. Brands receive verified attention metrics, first-party survey responses, and fraud-scored engagement — not vanity impressions.

The platform unifies four audiences in one deployable stack: **reviewers** (`/earn`), **brands** (`/brands`), **platform operators** (`/brands/admin`), and **network partners** (`/partners`). Version 1.1 adds the Partner Management Portal with a one-click **Integrate with AdSpot** button, default-inactive integration state, and completion webhooks for publisher rev-share.

---

### A.1 Earn Engine (Reviewer Portal)

| Capability | Description | Route / component |
|------------|-------------|-------------------|
| Landing & registration | Self-serve reviewer onboarding | `/`, `/earn/register` |
| Dashboard & ad feed | Points balance, available campaigns | `/earn/dashboard` |
| Review sessions | Timed watch + question gating | `/earn/review/:id` — `ReviewSession`, `VideoPlayer` |
| Leaderboard | Ranked competition with eligibility rules | `/earn/leaderboard` |
| Referrals | Viral growth via referral codes | `server/routes/referrals.ts` |
| Rewards & gifts | Airtime, data, voucher redemption | `server/routes/gifts.ts`, `ReviewSession` rewards |
| Profile | Reviewer settings and KYC-lite profile | `/earn/profile` |

**Session lifecycle:** Reviewers must meet `minWatchSeconds` on video/image creatives, answer up to 10 brand questions (MCQ, rating, emoji, yes/no, open text), and pass server-side fraud checks before points credit.

---

### A.2 Brands Portal

| Capability | Description | Route / component |
|------------|-------------|-------------------|
| Campaign CRUD | Create, fund, publish, pause ads | `/brands/ads`, `/brands/ads/new` |
| Question builder | Attach comprehension questions to creatives | `CreateAd` |
| Creative upload | Object storage for video/image assets | `@workspace/object-storage-web` |
| Analytics dashboard | Per-ad stats, survey positivity, exports | `/brands/dashboard`, `BrandAnalytics` |
| AI summaries | OpenAI-powered campaign insights | `AISummaryPanel` |
| Package bundles | Prepaid impression bundles | `AllocateBundle`, `server/routes/packages.ts` |
| Brand settings | Wallet, team, notification prefs | `/brands/settings` |

---

### A.3 Admin & Operator Console

| Capability | Description | Route |
|------------|-------------|-------|
| User management | Reviewer/brand account moderation | `/brands/admin/users` |
| Ad moderation | Campaign approval and fraud queues | `/brands/admin/ads` |
| Events log | Platform activity audit trail | `/brands/admin/events` |
| Financial controls | Revenue, payouts, platform settings | `/brands/admin/financials` |
| Fraud enforcement | Manual review of flagged sessions | `server/routes/fraud.ts` |

Roles: `brand`, `admin`, `super_admin`. Super-admin bypass for platform owner (`oadeagbo@gmail.com`).

---

### A.4 Gamification

1. **Points ledger** — Server-authoritative balance; no client-side point manipulation.
2. **Leaderboard** — Weekly/monthly ranks with minimum-session eligibility.
3. **Proverb bonus challenges** — Cultural engagement hooks during review sessions.
4. **Referral bonuses** — Reviewer-to-reviewer growth with brand-funded bounties.
5. **Streak-style UX** — Dashboard cues encourage daily return without dark patterns.

---

### A.5 Partner Portal & Integrate Button

The **Partner Management Portal** (`partner-portal/`) serves newspapers, digital publishers, and media outlets joining the AdSpot Network Partner Program.

| Feature | Behaviour |
|---------|-----------|
| Default state | `adspot_linked = false` — UI shows **Not connected** (muted/grey) |
| Integrate button | One-click activation via `POST /api/partners/:id/integration/activate` |
| After activation | API key, embed script tag, webhook URL exposed; UI shows **AdSpot Connected** |
| Hard audit rule | UI never shows active without API `adspotLinked: true` and `apiKey` |
| Mount options | Standalone (`pnpm dev:partners`), embedded at `/partners`, or programmatic `mountPartnerPortal()` |
| Inventory UI | Partner profile, ad slots, revenue view (pilot) |

**Activation flow:**

```text
User clicks "Integrate with AdSpot"
  → Confirm modal
  → POST /api/partners/:id/integration/activate
  → Server sets adspot_linked=true, generates api_key + embed_config
  → UI shows "AdSpot Connected" + copyable embed tag
```

Embed tag format: `<script src="…/embed/partner.js" data-partner-id="…" data-api-key="…">`

---

## Part B — Technical Implementation

### B.1 Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Unified Node Deploy                       │
│  server/dist/index.mjs  +  STATIC_DIR=./app/dist            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  /earn/*     │  │  /brands/*   │  │  /partners/*     │  │
│  │  Reviewer SPA│  │  Brand SPA   │  │  Partner Portal  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  /api/*  — Express REST (auth, ads, reviews, partners)  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    PostgreSQL (Drizzle ORM)
```

**Split deploy option:** SPA on S3/CloudFront + API on App Runner/ECS with `CORS_ORIGINS` allowlist.

---

### B.2 Monorepo Structure

| Path | Package | Purpose |
|------|---------|---------|
| `app/` | `@workspace/adspot-unified` | Unified React SPA (landing + earn + brands + partners mount) |
| `partner-portal/` | `@workspace/partner-portal` | Standalone partner management module |
| `server/` | `@workspace/api-server` | Express API server |
| `lib/db/` | `@workspace/db` | Drizzle schema, migrations, seeds |
| `lib/api-zod/` | `@workspace/api-zod` | Generated Zod API contracts |
| `lib/api-client/` | `@workspace/api-client` | Typed frontend API client |
| `lib/object-storage-web/` | `@workspace/object-storage-web` | S3-compatible upload helpers |
| `lib/integrations-openai-ai-server/` | OpenAI integration | Lazy-loaded AI summaries |
| `scripts/` | — | Hostile audit, packaging, PDF render |
| `docs/` | — | Integration specs, partner program, audit reports |

**Build order:** `api-server` → `adspot-unified` → `partner-portal`  
**Start command:** `pnpm start` → `PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs`

---

### B.3 API Routes

| Router | Prefix | Key endpoints |
|--------|--------|---------------|
| `health` | `/api/healthz` | DB connectivity probe |
| `auth` | `/api/auth` | register, login, me, logout |
| `ads` | `/api/ads` | Campaign CRUD, publish |
| `reviews` | `/api/reviews` | Session start, watch progress, submit answers |
| `points` | `/api/points` | Ledger, balance |
| `leaderboard` | `/api/leaderboard` | Rankings |
| `brands` | `/api/brands` | Brand profile, wallet |
| `brand-analytics` | `/api/brand-analytics` | Dashboard stats, exports |
| `admin` | `/api/admin` | Users, ads, events, financials |
| `packages` | `/api/packages` | Prepaid bundles |
| `rewards` | `/api/rewards` | Redemption flows |
| `gifts` | `/api/gifts` | Airtime/voucher catalog |
| `referrals` | `/api/referrals` | Referral codes |
| `fraud` | `/api/fraud` | Fraud signals, admin review |
| `storage` | `/api/storage` | Presigned upload URLs |
| `notifications` | `/api/notifications` | In-app notifications |
| `public` | `/api/public` | Public ad feed (no auth) |
| `partners` | `/api/partners` | Partner CRUD, integration activate/deactivate |

**Security:** Helmet headers, rate limiting (300 req/min API, 20 auth attempts/15 min), CORS same-origin default, JWT session tokens, role-separated login portals.

---

### B.4 Partner Integration API

Base path: `/api/partners` (Express router in `server/src/routes/partners.ts`)

| Method | Path | Response |
|--------|------|----------|
| `POST` | `/partners` | `{ partner }` — creates partner + inactive integration row |
| `GET` | `/partners/:id` | `{ partner }` |
| `GET` | `/partners/:id/integration` | `{ status, adspotLinked, apiKey?, embedScript?, webhookUrl? }` |
| `POST` | `/partners/:id/integration/activate` | Active integration + `message` |
| `POST` | `/partners/:id/integration/deactivate` | Inactive integration + `message` |
| `POST` | `/partners/:id/webhooks/completions` | Brand-verified completion events |

**Client modules** (`partner-portal/src/lib/`): `partnerApi.ts`, `adspotBridge.ts`, `integrationState.ts`, `IntegrateAdSpotButton.tsx`

**Mock mode:** `AUDIT_PARTNER_MOCK=1` uses in-memory store for Tier 2 hostile audit without Postgres.

---

### B.5 Hostile Audit — 3-Tier Quality Gate

Canonical script: `scripts/hostile-audit.mjs`  
Report: `docs/HOSTILE_AUDIT_REPORT.md` (auto-generated each run)

| Tier | Name | Checks |
|------|------|--------|
| **Tier 1** | BUILD GATE | `pnpm install`, typecheck, test, build (API + SPA + partner-portal), partner migration exists, docs present |
| **Tier 2** | MOCK | Local unified server boot, SPA routes 200 (`/`, `/earn/*`, `/brands/*`, `/partners`), partner API inactive→active flow, Integrate button DOM verification |
| **Tier 3** | LIVE | `/api/healthz` db connected, auth smoke with seeded accounts, live partner activate |

| Verdict | Condition |
|---------|-----------|
| **FAIL** | Any Tier 1 or Tier 2 failure |
| **PARTIAL** | Tier 1+2 pass; Tier 3 skipped or failed |
| **PASS** | All executed tiers pass |

**Hard rules:** Never pass if routes 404. Never pass if UI shows active without API `adspotLinked: true`.

---

### B.6 Database Schema

PostgreSQL via Drizzle ORM (`lib/db/src/schema/`).

| Table group | Tables | Purpose |
|-------------|--------|---------|
| **Users & auth** | `users`, `profiles` | Accounts, roles, reviewer profiles |
| **Brands** | `brands` | Brand accounts, wallets |
| **Campaigns** | `ads`, `questions` | Creatives, comprehension questions |
| **Sessions** | `reviews`, `points`, `events` | Watch sessions, ledger, audit log |
| **Gamification** | `leaderboard`, `referrals`, `rewards`, `redemptions`, `gifts` | Competition, growth, payouts |
| **Platform** | `packages`, `settings`, `fraud`, `notifications` | Bundles, config, fraud queue |
| **Partners** | `network_partners`, `partner_integrations` | Publisher profiles, integration state (default `adspot_linked = false`) |

Migration: `lib/db/migrations_adspot_partners.sql`

**Seed commands:**

```bash
npx pnpm@9 --filter @workspace/db run push
npx pnpm@9 --filter @workspace/db run seed
npx pnpm@9 --filter @workspace/db run seed:accounts
npx pnpm@9 --filter @workspace/db run seed:settings
```

---

## Part C — Commercial Recommendations

### C.1 Network Partner Program

AdSpot's **Network Partner Program** targets newspapers, digital publishers, and media outlets that want to monetise editorial inventory with verified brand-review campaigns — without building ad tech.

| Stakeholder | Benefit |
|-------------|---------|
| **Publisher** | Rev-share on verified completions; one-click integration; no upfront build cost |
| **Brands** | Reach engaged audiences on trusted media properties |
| **Reviewers** | Earn points on AdSpot for authentic feedback (existing earn portal) |
| **AdSpot** | Platform fee + network effects; publisher distribution at scale |

**Technical default:** Every new partner starts with `adspot_linked = false`. No campaign routing, API keys, or embed tags until the partner explicitly clicks **Integrate with AdSpot**.

---

### C.2 Revenue-Share Model

| Party | Pilot share | Notes |
|-------|-------------|-------|
| **Publisher** | 60% | Net of fraud-adjusted completions |
| **Reviewer pool** | 30% | Points credited via existing earn rails |
| **AdSpot platform** | 10% | Ops, fraud, payout infrastructure |

**Verification:** Completion webhooks + minimum watch-time thresholds before payout. Monthly NGN statements. Settlement via Paystack/Flutterwave (existing AdSpot brand top-up rails).

**Scale terms:** Rev-share negotiable at 10+ publisher partners or NGN 50M+ annual GMV through network inventory.

---

### C.3 Pilot Terms (90-Day Trial)

| Term | Detail |
|------|--------|
| Duration | 90 days from integration activation |
| Minimum inventory | None — partner opts in slot-by-slot |
| Integration cost | Zero — embed tag + API key included |
| Fraud SLA | AdSpot handles bot detection; publisher reports anomalies within 48h |
| Payout cadence | Monthly, NET-15 after statement reconciliation |
| Exit clause | Deactivate integration anytime; no lock-in |
| Data | First-party completion data shared with partner dashboard; brand creative assets remain brand IP |

**Success metrics for pilot graduation:**

- ≥ 500 verified completions/month through partner inventory
- < 3% fraud reversal rate
- Publisher NPS ≥ 7/10
- At least one repeat brand campaign on partner slots

---

### C.4 Go-to-Market Strategy

#### Phase 1 — Lagos Anchor Publishers (Q3 2026)

Target 3–5 digital-native outlets (online newspapers, youth media, campus publications). Offer white-glove onboarding: AdSpot team configures partner record, runs hostile audit Tier 2+3, and co-sells first brand campaign.

#### Phase 2 — Telco & FMCG Co-Sell (Q4 2026)

Bundle partner inventory into existing brand packages. Pitch: "Run your MTN comprehension test on Punch + Guardian + AdSpot earn network." Premium analytics tier (NGN 150k–500k/month) for cohort filters across publisher segments.

#### Phase 3 — West Africa Expansion (2027)

Ghana (Graphic, Joy Online) and Kenya (Nation, Standard) via same partner portal. Localise rev-share settlement currency. API access for agency holding companies (Year 2+ revenue line).

#### Pricing benchmarks

| Metric | Range (NGN) |
|--------|-------------|
| CPM equivalent | 800 – 2,500 |
| Cost per completed review (with questions) | 15 – 45 |
| Premium analytics (monthly) | 150,000 – 500,000 |
| Platform take rate (gross) | 28% – 35% |

---

### C.5 Competitive Moat & Risks

**Moat:**

1. Verified attention graph — proprietary session + question scoring per reviewer
2. Dual-sided liquidity — brands and reviewers on shared ledger
3. Partner network effects — publishers bring inventory; AdSpot brings brands and fraud ops
4. Hostile audit CI gate — automated quality enforcement before every deploy
5. Local payout rails — airtime/data redemption tuned for NGN micro-rewards

**Risks:**

| Risk | Mitigation |
|------|------------|
| Reviewer farming / bots | Fraud module, device signals, admin review |
| Publisher quality variance | Slot-level performance scoring; pause underperforming inventory |
| Regulatory (NDPC, CBN) | Licensed payout partners; data minimisation |
| Brand concentration | Agency channel + self-serve SMB tier |
| Partner churn | No lock-in; transparent monthly statements |

---

### C.6 Financial Outlook (Summary)

| Line item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| Platform revenue (net) | NGN 61M | NGN 322M | NGN 882M |
| Partner / API fees | NGN 0 | NGN 8M | NGN 45M |
| EBITDA | NGN (19M) | NGN 42M | NGN 288M |

Year 1 intentional loss funds Lagos launch and partner pilot ops. Year 2 EBITDA positive on Nigeria scale; Year 3 assumes Ghana + Kenya soft launch with network partner fees as a material revenue line.

---

## Conclusion

AdSpot v1.1 delivers a production-ready rewarded-attention platform with a new **Partner Management Portal** and **Integrate with AdSpot** flow for media network expansion. The unified monorepo (SPA + API + partner module), PostgreSQL schema, 3-tier hostile audit, and default-inactive partner integration provide a trustworthy foundation for publisher rev-share pilots and aggressive Nigeria-first growth.

**Next steps:** Deploy staging per `docs/AWS_RESTAGE.md`, onboard first 3 publisher partners, run live Tier 3 hostile audit, and launch 90-day pilot with co-branded brand campaigns.

---

*AdSpot Complete Platform Overview — 29 July 2026 — Confidential.*
