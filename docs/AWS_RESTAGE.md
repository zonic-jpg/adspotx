# AdSpot — AWS Restage & Staging Deployment

**Updated: 29 July 2026**  
Companion to `STAGING_GUIDANCE.md` for partner-portal staging packages.

---

## Package contents

The staging zip (`AdSpot-partner-portal-staging.zip`) includes:

- Full source: `app/`, `server/`, `partner-portal/`, `lib/db/`, shared `lib/*`
- Pre-built `dist/` folders (app, server, partner-portal) when built before packaging
- All `docs/*.md` (partner program, hostile audit spec/report, integration docs)
- `scripts/` (hostile-audit, package scripts, PDF render)
- `STAGING_GUIDANCE.md` and this file

**Excluded:** `node_modules/`, `.git/`, `.DS_Store`, local `.env` secrets.

On the target host, run `npx pnpm@9 install` before build/start.

---

## Prerequisites

- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- PostgreSQL 14+ (RDS recommended for AWS)
- AWS account with IAM permissions for chosen service

---

## Option A — Unified deploy (recommended)

Single Node process serves SPA + Partner Portal mount + API on one origin.

### AWS App Runner

1. Push image or connect repo; set start command:
   ```bash
   node server/dist/index.mjs
   ```
2. Environment variables:

| Variable | Value |
|----------|-------|
| `PORT` | `8080` (App Runner default) |
| `DATABASE_URL` | RDS Postgres connection string |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `STATIC_DIR` | `./app/dist` |
| `ADSPOT_PUBLIC_URL` | `https://your-domain.com` |
| `CORS_ORIGINS` | Leave empty for same-origin |

3. Run DB migrations from a one-off task or CI:
   ```bash
   npx pnpm@9 --filter @workspace/db run push
   npx pnpm@9 --filter @workspace/db run seed:accounts
   ```

### AWS Elastic Beanstalk / ECS Fargate

Same env vars and start command. Mount nothing — static assets ship inside the container from `app/dist`.

---

## Option B — Split deploy (SPA + API)

| Component | Host | Notes |
|-----------|------|-------|
| Frontend SPA | S3 + CloudFront | Deploy `app/dist/`; 403/404 → `/index.html` |
| Partner portal (standalone) | S3 + CloudFront or `/partners` route | `partner-portal/dist/` or embedded in main SPA |
| API | App Runner / ECS / ALB | `server/dist/index.mjs` |

Build with API base URL:

```bash
VITE_API_BASE_URL=https://api.yourdomain.com npx pnpm@9 run build
```

Set on API: `CORS_ORIGINS=https://your-frontend-domain.com`

---

## Database (RDS)

1. Create PostgreSQL 14+ instance (private subnet + security group).
2. Allow inbound 5432 from App Runner / ECS security group only.
3. Set `DATABASE_URL=postgresql://user:pass@host:5432/adspot`
4. Migrate and seed:
   ```bash
   npx pnpm@9 --filter @workspace/db run push
   npx pnpm@9 --filter @workspace/db run seed
   npx pnpm@9 --filter @workspace/db run seed:accounts
   npx pnpm@9 --filter @workspace/db run seed:settings
   ```

`/api/healthz` must return HTTP **200** with `"status":"ok"` and `"db":"connected"`.

---

## Partner portal on staging

| Route | Purpose |
|-------|---------|
| `/partners` | Embedded partner portal in main SPA |
| `/partners/integration` | Integration status + Integrate button |
| `pnpm dev:partners` | Standalone dev on `:5174` |

Verify with hostile audit:

```bash
node scripts/hostile-audit.mjs
# Tier 2: partner inactive → activate → active with apiKey
```

Live check after deploy:

```bash
ADSPOT_LIVE_URL=https://staging.yourdomain.com \
ADSPOT_LIVE_API_URL=https://staging.yourdomain.com \
node scripts/hostile-audit.mjs
```

---

## Post-deploy checklist

- [ ] `pnpm build` passes on target (or use pre-built dist from zip)
- [ ] `/api/healthz` → 200, db connected
- [ ] `/earn/login`, `/brands/login`, `/partners` → 200
- [ ] Demo logins work (see `STAGING_GUIDANCE.md`)
- [ ] Partner integration: inactive by default; activate returns `apiKey`
- [ ] Hostile audit verdict PASS or PARTIAL (Tier 3 if DB seeded)
- [ ] TLS certificate valid on public URL
- [ ] Rotate `JWT_SECRET` and demo passwords before production traffic

---

## Common failures

| Symptom | Fix |
|---------|-----|
| Blank SPA | Set `STATIC_DIR=./app/dist` |
| `/api/healthz` 503 | Real `DATABASE_URL`; check RDS security group |
| Partner shows active without API | Rebuild — audit hard rule; check `adspot_linked` in DB |
| CORS errors (split deploy) | Set `CORS_ORIGINS` on API |
| 429 on login | Rate limit — wait 15 min or use fresh IP |

---

## Demo credentials

All demo accounts use password **`password123`** (change before production).

| Portal | URL | Email |
|--------|-----|-------|
| Reviewer | `/earn/login` | `alice@reviewer.demo` |
| Brand | `/brands/login` | `mtn@adspot.demo` |
| Admin | `/brands/login` | `admin@adspot.demo` |
| Super admin | `/brands/login` | `oadeagbo@gmail.com` |

See `STAGING_GUIDANCE.md` for full account list and flows.
