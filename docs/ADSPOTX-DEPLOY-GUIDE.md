# AdSpotX Deploy Guide

Railway and AWS deployment for **AdSpotX v1.0** (1.0.0). Companion to `STAGING_GUIDANCE.md` and `docs/AWS_RESTAGE.md`.

---

## Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- PostgreSQL 14+ (production)
- Built artifacts or run `pnpm run build` on target

---

## Environment variables

| Variable | Required | Production | Demo / audit |
|----------|----------|------------|--------------|
| `PORT` | yes | `8080` (Railway/App Runner) or `3001` local | same |
| `DATABASE_URL` | **yes (prod)** | Real Postgres connection string | Optional if `AUDIT_PARTNER_MOCK=1` |
| `JWT_SECRET` | yes | `openssl rand -hex 64` | any strong secret for staging |
| `STATIC_DIR` | yes (unified) | `./app/dist` | `./app/dist` |
| `ADSPOT_PUBLIC_URL` | recommended | `https://your-domain.com` | `http://localhost:3001` |
| `CORS_ORIGINS` | split deploy only | Comma-separated frontend origins | empty for same-origin |
| `AUDIT_PARTNER_MOCK` | **no in prod** | **Unset** | `1` for hostile audit / demo without DB |
| `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_*` | optional | Brand AI analytics summary | lazy-loaded; server boots without |

### AUDIT_PARTNER_MOCK vs DATABASE_URL

| Mode | `AUDIT_PARTNER_MOCK` | `DATABASE_URL` | Use case |
|------|----------------------|------------------|----------|
| **Production** | unset | Real RDS/Postgres | Live traffic |
| **Staging + DB** | unset | Staging Postgres | Full QA with seed |
| **Demo / audit** | `1` | unset or optional | Hostile audit Tier 2, screenshots, zip smoke test |

When `AUDIT_PARTNER_MOCK=1`:

- Auth uses in-memory demo accounts (`admin@adspot.demo`, `alice@reviewer.demo`, etc.)
- Admin lists, partner API, reviewer pipeline use memory stores
- **Do not** enable in production

---

## Railway deployment

### 1. Create service

1. Connect GitHub repo or deploy from `adspotxv1.0.zip`.
2. **Build command:**
   ```bash
   npx pnpm@9 install && npx pnpm@9 run build
   ```
3. **Start command:**
   ```bash
   node server/dist/index.mjs
   ```

### 2. Add Postgres addon

1. Railway → **New** → **Database** → **PostgreSQL**.
2. Copy `DATABASE_URL` into service variables (Railway often injects `DATABASE_URL` automatically).
3. **Do not** set `AUDIT_PARTNER_MOCK=1` for production/staging with real data.

### 3. Required env vars (Railway dashboard)

```env
PORT=8080
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<openssl rand -hex 64>
STATIC_DIR=./app/dist
ADSPOT_PUBLIC_URL=https://your-app.up.railway.app
```

### 4. Database migrate + seed (one-off or deploy hook)

```bash
npx pnpm@9 --filter @workspace/db run push
npx pnpm@9 --filter @workspace/db run seed:accounts
npx pnpm@9 --filter @workspace/db run seed
npx pnpm@9 --filter @workspace/db run seed:settings
```

### 5. Railway demo mode (no Postgres addon)

For quick smoke only:

```env
AUDIT_PARTNER_MOCK=1
JWT_SECRET=<random>
STATIC_DIR=./app/dist
PORT=8080
```

Login with demo accounts from `ADSPOTX-VERSION-FIX-LOG.md` Fix 9 table.

---

## AWS deployment

### Option A — Unified (recommended)

Single Node process serves SPA + partner portal + API.

#### App Runner

1. Container or source deploy; start command:
   ```bash
   node server/dist/index.mjs
   ```
2. Environment:

| Variable | Value |
|----------|-------|
| `PORT` | `8080` |
| `DATABASE_URL` | RDS Postgres URL |
| `JWT_SECRET` | strong random |
| `STATIC_DIR` | `./app/dist` |
| `ADSPOT_PUBLIC_URL` | `https://your-domain.com` |

3. Run migrations from CI or one-off task (see Database section).

#### ECS Fargate / Elastic Beanstalk

Same env vars and start command. Ship pre-built `app/dist`, `server/dist`, `partner-portal/dist` from zip or build in Dockerfile:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN corepack enable && npx pnpm@9 install && npx pnpm@9 run build
ENV PORT=8080 STATIC_DIR=./app/dist
CMD ["node", "server/dist/index.mjs"]
```

### Option B — Split (SPA + API)

| Component | Host | Artifact |
|-----------|------|----------|
| Main SPA | S3 + CloudFront | `app/dist/` |
| Partner portal | Embedded at `/partners` or separate S3 | `partner-portal/dist/` |
| API | App Runner / ECS / ALB | `server/dist/index.mjs` |

Build with API URL:

```bash
VITE_API_BASE_URL=https://api.yourdomain.com npx pnpm@9 run build
```

Set on API: `CORS_ORIGINS=https://your-frontend-domain.com`

CloudFront: map 403/404 → `/index.html` for SPA routing.

### RDS (PostgreSQL)

1. PostgreSQL 14+ in private subnet.
2. Security group: inbound 5432 from App Runner / ECS only.
3. `DATABASE_URL=postgresql://user:pass@host:5432/adspot`
4. Migrate and seed (see below).

### S3 / CloudFront (static only)

- Upload `app/dist/*` to S3 bucket.
- CloudFront origin → S3; custom error responses 403/404 → 200 `/index.html`.
- API remains on App Runner/ECS with `CORS_ORIGINS` set.

---

## Database setup (Railway + AWS)

```bash
npx pnpm@9 --filter @workspace/db run push
npx pnpm@9 --filter @workspace/db run seed
npx pnpm@9 --filter @workspace/db run seed:accounts
npx pnpm@9 --filter @workspace/db run seed:settings
```

Health check: `GET /api/healthz` → HTTP **200**, `"status":"ok"`, `"db":"connected"`.

---

## Post-deploy verification checklist

- [ ] `pnpm run build` passes (or pre-built dist from zip)
- [ ] `/api/healthz` → 200, db connected (production)
- [ ] `/` → Landing with **Start earning** CTA visible
- [ ] `/earn/login`, `/brands/login`, `/partners` → 200
- [ ] Admin login → `/brands/admin/dashboard` (not bounce to login)
- [ ] Admin Users / Events / Financials show data or explicit error banner
- [ ] Reviewer: campaign video plays (YouTube + upload)
- [ ] AdSpotX admin at `/brands/admin/adspotx`; partner integrate flow works
- [ ] Hostile audit PASS (see below)
- [ ] TLS valid on public URL
- [ ] Rotate `JWT_SECRET` and demo passwords before production traffic
- [ ] **`AUDIT_PARTNER_MOCK` unset in production**

---

## Running hostile audit

### Local / CI (mock tier — no Postgres)

```bash
cd AdSpot-Unified-3
npx pnpm@9 install
npx pnpm@9 run build
node scripts/hostile-audit.mjs --mock-only --skip-install --force-mock
```

Expected: **VERDICT: PASS** (Tier 1 BUILD + Tier 2 MOCK).

### Full audit (includes LIVE tier if DATABASE_URL set)

```bash
node scripts/hostile-audit.mjs
```

### Against deployed staging/production

```bash
ADSPOT_LIVE_URL=https://staging.yourdomain.com \
ADSPOT_LIVE_API_URL=https://staging.yourdomain.com \
node scripts/hostile-audit.mjs
```

Report written to `docs/HOSTILE_AUDIT_REPORT.md`.

---

## Running reviewer flow E2E

Requires server running (mock or DB mode):

```bash
# Terminal 1 — mock mode
PORT=3001 STATIC_DIR=./app/dist AUDIT_PARTNER_MOCK=1 node server/dist/index.mjs

# Terminal 2
node scripts/test-reviewer-flow.mjs http://127.0.0.1:3001
```

Covers: reviewer login → ad feed → review session → points → leaderboard → brand YouTube create → delete.

---

## Common failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank SPA | `STATIC_DIR` unset | Set `STATIC_DIR=./app/dist` |
| Auth pages 404 | API-only mode | Same — enable static dir |
| `/brands/brands/login` | Old bundle / bad redirects | Deploy v1.0.0+; nested-relative paths |
| Login 503 | No DB, no mock flag | Set `DATABASE_URL` or `AUDIT_PARTNER_MOCK=1` |
| Admin empty tables, no error | Old bundle | Deploy admin console fix (v1.0.0) |
| Video won't play | YouTube URL not normalized | v1.0.0 `asset-normalize`; redeploy |
| CORS (split deploy) | Missing origin | `CORS_ORIGINS` on API |
| Partner active without API key | Stale integration state | Rebuild; run hostile audit integrate checks |

---

## Demo credentials

Password for all demo accounts: **`password123`** (change before production).

| Portal | URL | Email |
|--------|-----|-------|
| Reviewer | `/earn/login` | `alice@reviewer.demo` |
| Brand | `/brands/login` | `brand@adspot.demo` or `mtn@adspot.demo` |
| Admin | `/brands/login` | `admin@adspot.demo` |
| Super admin | `/brands/login` | `oadeagbo@gmail.com` |

See `STAGING_GUIDANCE.md` for full account list and user flows.

---

## Package contents (adspotxv1.0.zip)

- Source: `app/`, `server/`, `partner-portal/`, `lib/`
- Pre-built `dist/` folders
- `docs/` including this guide and `ADSPOTX-VERSION-FIX-LOG.md`
- `ADSPOTX-VERSION-FIX-LOG.md` at zip root
- `scripts/hostile-audit.mjs`, `scripts/test-reviewer-flow.mjs`
- Excludes: `node_modules/`, `.git/`, `server/.env`

On target: `npx pnpm@9 install && npx pnpm@9 run build && pnpm start`
