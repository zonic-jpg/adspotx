# AdSpotX — Complete Platform Overview

**Document date: 4 August 2026**  
**Version: 1.2.0 (AdSpotX integrated release)**  
**Confidential — AdSpot Nigeria / Africa**

---

## Table of Contents

1. Application overview
2. Technical architecture
3. Installation guides (AWS & Railway)
4. Cursor → hosting CI/CD
5. Features by persona
6. Application screenshots
7. Market analysis & SWOT
8. Revenue forecasts
9. Partner flow schematic
10. References & quick start

---

## 1. Application overview

### What is AdSpotX?

**AdSpotX** is the branded, integrated network partner product inside the AdSpot unified platform. It combines:

- The core **AdSpot** rewarded-attention stack (reviewers, brands, admin)
- The modular **partner-portal** for newspapers, digital publishers, and media outlets
- Admin tooling to onboard publishers, activate AdSpot routing, and view network analytics

AdSpotX lets media partners monetise editorial inventory with verified brand-review campaigns **without building ad tech**. Partners embed a one-click **Integrate with AdSpot** flow; campaigns route only after explicit opt-in (`adspot_linked = true`).

### Value proposition

| Stakeholder | Benefit |
|-------------|---------|
| **Publishers / partners** | Rev-share on verified completions; one-click integration; no upfront ad-tech build |
| **Brands** | Reach engaged audiences via short-form video reviews on trusted media properties |
| **Reviewers** | Earn points on the existing earn portal (`/earn`) for authentic feedback |
| **AdSpot platform** | Network distribution, platform fee, fraud-scored completions, first-party survey data |

### Commercial model (pilot)

- **Rev-share:** 60% publisher / 30% reviewer pool / 10% AdSpot platform (negotiable at scale)
- **Verification:** Completion webhooks + minimum watch-time before payout
- **Pilot:** 90-day trial; integration inactive until partner opts in
- **Settlement:** Monthly NGN statements; Paystack/Flutterwave rails for brand top-ups

---

## 2. Technical architecture

### Monorepo structure

| Path | Package | Purpose |
|------|---------|---------|
| `app/` | `@workspace/adspot-unified` | Unified React SPA (landing + earn + brands + partners mount) |
| `partner-portal/` | `@workspace/partner-portal` | Standalone partner module (dashboard, slots, revenue, integrate button) |
| `server/` | `@workspace/api-server` | Express REST API |
| `lib/db/` | `@workspace/db` | Drizzle schema, migrations, seeds |
| `lib/api-zod/` | `@workspace/api-zod` | Zod API contracts |
| `lib/api-client/` | `@workspace/api-client` | Typed frontend client |
| `scripts/` | — | Hostile audit, packaging, PDF render |

**Build order:** `api-server` → `adspot-unified` → `partner-portal`  
**Unified start:** `PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs`

### System architecture

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
│  /api/admin/*  — users, events, financials                │
│  /api/auth, /api/ads, /api/reviews, /api/brands, ...        │
└───────────────────────────┬─────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ PostgreSQL (production)   │
              │ network_partners          │
              │ partner_integrations      │
              └───────────────────────────┘
```

### API routes & auth

| Router | Prefix | Key endpoints |
|--------|--------|---------------|
| `auth` | `/api/auth` | register, login, me |
| `ads` | `/api/ads` | Feed, ad detail (video creatives) |
| `reviews` | `/api/reviews` | start, complete sessions |
| `points` | `/api/points` | balance, ledger |
| `brands` | `/api/brands` | analytics, comments, AI summary |
| `admin` | `/api/admin` | users, events, stats, redemptions |
| `partners` | `/api/partners` | list, create, integration activate/deactivate |
| `health` | `/api/healthz` | DB connectivity |

### Roles

| Role | Portal | Capabilities |
|------|--------|--------------|
| `reviewer` | `/earn/login` | Watch ads, earn points, leaderboard |
| `brand` | `/brands/login` | Campaigns, analytics, AI summaries |
| `admin` | `/brands/login` → `/brands/admin/*` | Users, events, financials, AdSpotX |
| `super_admin` | `/brands/login` | All admin capabilities + owner bypass |

**Hierarchy:** `super_admin` bypasses all role checks; `admin` satisfies admin routes. Demo password: `password123`.

### AdSpotX partner integration

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/partners` | List partners (admin auth) |
| `POST` | `/api/partners` | Create partner + inactive integration |
| `GET` | `/api/partners/:id/integration` | Status (default inactive) |
| `POST` | `/api/partners/:id/integration/activate` | Flip `adspot_linked=true`, issue API key + embed tag |
| `POST` | `/api/partners/:id/integration/deactivate` | Deactivate |

**Environment:** `AUDIT_PARTNER_MOCK=1` enables in-memory partner + reviewer mock data for audit/screenshots without Postgres.

---

## 3. Installation guides

### Prerequisites (all targets)

- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- PostgreSQL 14+ (RDS, Railway Postgres, or local)

### Local / engineer quick start

```bash
cd AdSpot-Unified-3
npx pnpm@9 install
cp server/.env.example server/.env   # set DATABASE_URL, JWT_SECRET
npx pnpm@9 run build
npx pnpm@9 --filter @workspace/db run push
npx pnpm@9 --filter @workspace/db run seed:accounts

PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs
# Mock mode (no DB): AUDIT_PARTNER_MOCK=1
```

Open http://localhost:3001 — landing, `/earn`, `/brands/login`, `/partners` on one origin.

### AWS deployment (expanded)

#### Option A — Unified deploy (recommended)

Single Node process serves SPA + partner portal + API.

**AWS App Runner**

1. Connect repo or push container image.
2. Start command: `node server/dist/index.mjs`
3. Environment:

| Variable | Value |
|----------|-------|
| `PORT` | `8080` |
| `DATABASE_URL` | RDS Postgres connection string |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `STATIC_DIR` | `./app/dist` |
| `ADSPOT_PUBLIC_URL` | `https://your-domain.com` |
| `CORS_ORIGINS` | Empty for same-origin |

4. Run migrations (one-off task or CI):

```bash
npx pnpm@9 --filter @workspace/db run push
npx pnpm@9 --filter @workspace/db run seed:accounts
```

**ECS Fargate / Elastic Beanstalk:** Same env vars; ship `app/dist` + `server/dist` in container.

#### Option B — Split deploy

| Component | AWS service | Notes |
|-----------|-------------|-------|
| Frontend SPA | **S3** + **CloudFront** | Deploy `app/dist/`; 403/404 → `/index.html` |
| Partner portal | Embedded at `/partners` or `partner-portal/dist` on second CloudFront |
| API | App Runner / **ECS** / ALB | `server/dist/index.mjs` |
| Database | **RDS** PostgreSQL 14+ | Private subnet; SG allows 5432 from compute only |

Build split frontend:

```bash
VITE_API_BASE_URL=https://api.yourdomain.com npx pnpm@9 run build
```

Set on API: `CORS_ORIGINS=https://app.yourdomain.com`

#### RDS setup

1. Create PostgreSQL 14+ in private subnet.
2. Security group: inbound 5432 from App Runner / ECS only.
3. `DATABASE_URL=postgresql://user:pass@host:5432/adspot`
4. Migrate and seed (see above).
5. Verify `/api/healthz` returns 200 with `"db":"connected"`.

#### Post-deploy checklist

- [ ] `pnpm build` passes
- [ ] `/api/healthz` → 200
- [ ] `/earn/login`, `/brands/login`, `/partners` → 200
- [ ] Partner integration inactive by default; activate returns `apiKey`
- [ ] `node scripts/hostile-audit.mjs` → PASS or PARTIAL
- [ ] TLS valid; rotate demo passwords before production

### Railway deployment

1. **Create project** — connect GitHub repo `AdSpot-Unified-3`.
2. **Add Postgres** — Railway Postgres plugin; copy `DATABASE_URL` into service variables.
3. **Service settings:**

| Variable | Value |
|----------|-------|
| `PORT` | `${{PORT}}` (Railway injects) |
| `DATABASE_URL` | From Postgres plugin |
| `JWT_SECRET` | Random 64-byte hex |
| `STATIC_DIR` | `./app/dist` |
| `ADSPOT_PUBLIC_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` |
| `NODE_VERSION` | `20` |

4. **Build command:**

```bash
npx pnpm@9 install && npx pnpm@9 run build
```

5. **Start command:**

```bash
node server/dist/index.mjs
```

6. **Release command** (optional, run on deploy):

```bash
npx pnpm@9 --filter @workspace/db run push && npx pnpm@9 --filter @workspace/db run seed:accounts
```

7. Enable **public networking**; Railway auto-deploys on git push to connected branch.

---

## 4. Cursor → hosting CI/CD

### Practical pipeline: edit → commit → push → deploy

```text
Cursor IDE (local edits)
    → git commit + push to GitHub
    → CI (.github/workflows/ci.yml): typecheck, lint, test, build
    → Hosting auto-deploy (Railway / AWS)
    → /api/healthz smoke + hostile-audit (optional)
```

### GitHub Actions (included)

`.github/workflows/ci.yml` runs on every push/PR:

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint` / `pnpm test`
- `pnpm build`

Extend with deploy job:

```yaml
# Example: Railway deploy after CI (add RAILWAY_TOKEN secret)
deploy:
  needs: verify
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - run: npx railway up --service adspot-api
```

### AWS deploy from Cursor

1. Push to `main` → CodePipeline / App Runner auto-build from repo.
2. Or: Cursor Cloud Agent completes feature → PR merge → ECS/App Runner picks up image.
3. Use `scripts/package-staging.mjs` for zip handoff to EC2 if needed.

### Cursor Cloud Agents workflow

1. Open project in Cursor; Cloud Agent implements change on branch.
2. Agent runs `pnpm build` + `node scripts/hostile-audit.mjs --mock-only`.
3. Push branch; open PR; CI verifies.
4. Merge → Railway/AWS auto-deploy.

### Demo credentials (staging)

| Role | Email | Password |
|------|-------|----------|
| Super admin | `oadeagbo@gmail.com` | `password123` |
| Admin | `admin@adspot.demo` | `password123` |
| Reviewer | `alice@reviewer.demo` | `password123` |
| Brand | `brand@adspot.demo` | `password123` |

---

## 5. Features & capabilities by persona

### Reviewers (earn portal — `/earn`)

| Feature | Route / component |
|---------|-------------------|
| Landing hero **Start earning** | `/` — `landing-start-earning-hero` |
| Dashboard, points, ad feed | `/earn/dashboard` |
| Campaign review + video | `/earn/review/:id` — `VideoPlayer`, `review-video-player` |
| Leaderboard | `/earn/leaderboard` |
| Earnings / ledger | Points API, collapsible history |
| Registration | `/earn/register` |

### Brands (`/brands`)

| Feature | Route |
|---------|-------|
| Login / register | `/brands/login`, `/brands/register` |
| Campaign analytics dashboard | `/brands/dashboard` — charts, demographics, filters |
| AI analytics summary | `Generate AI Summary` on dashboard |
| Campaign CRUD | `/brands/ads`, `/brands/ads/new` |
| Settings | `/brands/settings` |

### Admin (`/brands/admin`)

| Feature | Route |
|---------|-------|
| Overview | `/brands/admin/dashboard` |
| User directory | `/brands/admin/users` |
| Event log | `/brands/admin/events` |
| Financials (KPIs, redemptions, ledger) | `/brands/admin/financials` |
| **AdSpotX** partner management | `/brands/admin/adspotx` |
| Ad moderation | `/brands/admin/ads` |

### Partners (AdSpotX portal — `/partners`)

| Feature | Route |
|---------|-------|
| Partner dashboard | `/partners` |
| Integration + **Integrate with AdSpot** | `/partners/integration` |
| Inventory slots | `/partners/slots` |
| Revenue view | `/partners/revenue` |
| Network directory | `/partners/partners` |

---

## 6. Application screenshots

Captured from live unified server (`PORT=3004`, `AUDIT_PARTNER_MOCK=1`, August 2026).

### Landing — Start earning hero

![Landing page with Start earning CTA](adspotx-screenshots/01-landing-hero.png)

### Reviewer dashboard

![Reviewer dashboard with points and available ads](adspotx-screenshots/02-reviewer-dashboard.png)

### Reviewer campaign review (video + survey)

![Campaign review session with video player and questions](adspotx-screenshots/03-reviewer-campaign-review.png)

### Brand login

![Brand and admin sign-in portal](adspotx-screenshots/04-brand-login.png)

### Brand analytics dashboard

![Brand campaign analytics with charts and KPIs](adspotx-screenshots/05-brand-dashboard.png)

### Admin — Users

![Admin user directory with roles](adspotx-screenshots/06-admin-users.png)

### Admin — Event log

![Admin platform event audit trail](adspotx-screenshots/07-admin-events.png)

### Admin — Financials

![Admin financial activity and redemptions](adspotx-screenshots/08-admin-financials.png)

### Admin — AdSpotX

![AdSpotX network partner management console](adspotx-screenshots/09-admin-adspotx.png)

### Partner portal

![Partner portal dashboard](adspotx-screenshots/10-partner-portal.png)

### Partner integration (inactive default)

![Partner integration page with Integrate with AdSpot button](adspotx-screenshots/11-partner-integration.png)

---

## 7. Market analysis & SWOT

### Market context — Africa / Nigeria

| Factor | Insight |
|--------|---------|
| **Digital ad spend** | Nigeria digital ad market growing ~15–20% YoY; mobile-first, video-heavy |
| **VAS & rewards** | Airtime/data rewards familiar via telco VAS; AdSpot aligns with earned-value apps |
| **Influencer / UGC** | Brands shift from vanity impressions to verified attention and comprehension |
| **Publisher pain** | Newspapers and digital outlets need programmatic alternatives without heavy ad-tech capex |
| **Youth demographic** | 18–34 urban Nigerians highly mobile; leaderboard + points drive retention |
| **Payment rails** | Paystack/Flutterwave enable NGN wallets and reviewer redemptions |

### SWOT — AdSpotX

| Category | Detail |
|----------|--------|
| **Strengths** | Verified watch-time + survey gating; unified monorepo; one-click partner integration; hostile-audit quality gate; role-separated portals |
| **Weaknesses** | Requires Postgres ops; YouTube embed regional limits; early-stage brand pipeline; mock tier needed without DB |
| **Opportunities** | Newspaper/network embed via AdSpotX; telco bundle partnerships; FMCG/telco CPE budgets; West/East Africa expansion |
| **Threats** | Social platforms' native ad products; fraud in reward apps; FX/NGN volatility; regulatory scrutiny on data/rewards |

---

## 8. Revenue forecasts (3-year scenarios)

**Base currency:** NGN millions  
**Accounting year:** August–July, starting FY2026–27  
**FX assumption:** USD 1 = NGN 1,550

### Assumptions by scenario

| Assumption | Base case | Growth case | Partner-embedded case |
|------------|-----------|-------------|------------------------|
| Active reviewers (Y3 monthly) | 150k | 400k | 600k |
| Paying brands (Y3) | 80 | 200 | 280 |
| Avg brand monthly spend | NGN 2.5M | NGN 4.0M | NGN 3.5M |
| Network partners (Y3) | 5 | 15 | 45 |
| Platform take rate | 28% | 32% | 30% (+ partner rev-share) |
| Partner traffic share (Y3) | 10% | 25% | 55% |

### Base case P&L (NGN millions)

| Line item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| Gross brand spend (GMV) | 180 | 720 | 1,920 |
| Platform net revenue | 50 | 205 | 538 |
| Partner payouts (net) | 8 | 35 | 95 |
| Operating costs | 42 | 95 | 180 |
| **EBITDA** | **0** | **60** | **223** |

### Growth case P&L (NGN millions)

| Line item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| Gross brand spend (GMV) | 220 | 1,200 | 3,360 |
| Platform net revenue | 62 | 384 | 1,075 |
| Partner payouts | 12 | 72 | 210 |
| Operating costs | 48 | 140 | 320 |
| **EBITDA** | **2** | **124** | **505** |

### Partner-embedded case P&L (NGN millions)

| Line item | Year 1 | Year 2 | Year 3 |
|-----------|--------|--------|--------|
| Gross brand spend (GMV) | 200 | 1,050 | 2,940 |
| Platform net revenue | 56 | 315 | 882 |
| Publisher rev-share (60% of partner GMV) | 18 | 95 | 280 |
| Operating costs | 45 | 120 | 250 |
| **EBITDA** | **(5)** | **100** | **352** |

*Partner-embedded case assumes newspapers/media with existing followership drive reviewer acquisition at lower CAC; platform fee on routed completions remains 10% of gross partner campaign value.*

---

## 9. Partner flow schematic

### Embed flow (newspaper / media partner)

```mermaid
flowchart TD
    A[Publisher signs AdSpotX pilot] --> B[Admin creates network_partners record]
    B --> C[Partner configures slots in /partners]
    C --> D{adspot_linked?}
    D -->|false default| E[UI: Not connected — no routing]
    E --> F[Partner clicks Integrate with AdSpot]
    F --> G[POST /integration/activate]
    G --> H[apiKey + embed script issued]
    H --> I[Publisher embeds script on site]
    I --> J[Reviewers complete campaigns via AdSpot]
    J --> K[Webhook: completion verified]
    K --> L[Rev-share settlement monthly]
```

### Revenue split (pilot terms)

```text
Brand campaign spend (100%)
├── 60% Publisher (network partner)
├── 30% Reviewer pool (points / redemptions)
└── 10% AdSpot platform (ops, fraud, infrastructure)
```

### Integrate button states

| State | UI | API |
|-------|-----|-----|
| **Inactive** | Grey "Not connected"; no embed tag | `adspotLinked: false` |
| **Active** | Green "AdSpot Connected"; copyable script | `adspotLinked: true`, `apiKey`, `embedScript` |

---

## 10. References & quick start

### Related documentation

- `docs/ADSPOTX-INTEGRATION.md` — Routes, admin workflow
- `docs/PARTNER_PORTAL_INTEGRATION.md` — Integrate button contract
- `docs/ADSPOT_NETWORK_PARTNER_PROGRAM.md` — Commercial program
- `docs/AWS_RESTAGE.md` — AWS staging companion
- `docs/ADSPOTX-RELEASE-NOTES-AUG2026.md` — v1.2.0 release notes
- `STAGING_GUIDANCE.md` — Demo accounts and flows

### Verify release

```bash
npx pnpm@9 run build
node scripts/hostile-audit.mjs --mock-only --skip-install
PORT=3001 STATIC_DIR=./app/dist AUDIT_PARTNER_MOCK=1 node server/dist/index.mjs
```

### Generate this PDF

```bash
node scripts/render-adspotx-pdf.mjs
# Output: docs/AdSpotX.pdf and ~/Downloads/AdSpotX.pdf
```

---

*End of document — AdSpotX Complete Platform Overview, August 2026.*
