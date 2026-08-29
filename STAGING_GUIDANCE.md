# AdSpot — Staging Deployment Guide

## Prerequisites
- Node.js 20+
- pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`)
- PostgreSQL 14+ (RDS, Supabase, or local)

## 1. Configure environment
```bash
cp server/.env.example server/.env
```

Edit `server/.env`:
| Variable | Required | Notes |
|----------|----------|-------|
| `PORT` | yes | Default `3001` |
| `DATABASE_URL` | yes | Real Postgres URL — **not** `HOST`/`USER` placeholders |
| `JWT_SECRET` | yes | `openssl rand -hex 64` |
| `STATIC_DIR` | yes (unified) | `./app/dist` |
| `AI_INTEGRATIONS_OPENAI_*` | optional | Only for brand AI features (lazy-loaded; server boots without valid keys) |
| `CORS_ORIGINS` | split deploy only | Comma-separated frontend origins |

## 2. Build and verify locally
```bash
npx pnpm@9 install
npx pnpm@9 run typecheck
npx pnpm@9 run test
npx pnpm@9 run build
node scripts/hostile-audit.mjs   # must exit 0 (PASS or WARN) before staging
```

Expected audit verdict without a live DB: **WARN** (code passes; configure Postgres for **PASS** with auth smoke).

## 3. Database setup
```bash
npx pnpm@9 --filter @workspace/db run push
npx pnpm@9 --filter @workspace/db run seed
npx pnpm@9 --filter @workspace/db run seed:accounts   # demo logins (reviewer, brand, admin)
npx pnpm@9 --filter @workspace/db run seed:settings
```

`/api/healthz` must return HTTP **200** with `"status":"ok"` and `"db":"connected"`.

## 4. Login credentials & portals

All demo accounts use password **`password123`** (change super-admin on first real deploy).

### Reviewer (earn points by watching ads)
| Field | Value |
|-------|-------|
| Portal URL | `http://localhost:3001/earn/login` |
| Register | `http://localhost:3001/earn/register` |
| Email | `alice@reviewer.demo` (or `bob@reviewer.demo` … `jack@reviewer.demo`) |
| Password | `password123` |

**Flow:** Register → profile step (optional skip) → `/earn/dashboard` → pick an ad → watch + answer questions → earn points.

Use the **Earn** portal (`/earn/login`), not the Brand portal. Brand/admin accounts are rejected on reviewer login with a “Wrong portal” message.

### Brand (create campaigns, set questions, view analytics)
| Field | Value |
|-------|-------|
| Portal URL | `http://localhost:3001/brands/login` |
| Register | `http://localhost:3001/brands/register` |
| Email | `mtn@adspot.demo` (or any `*@adspot.demo` brand from seed) |
| Password | `password123` |

**Flow:** Login → `/brands/dashboard` (overview metrics) → **Ads** → create campaign with questions → publish → view per-ad stats and survey positivity scores.

### Admin (manage users, campaigns, payouts)
| Field | Value |
|-------|-------|
| Portal URL | `http://localhost:3001/brands/login` (same login as brand) |
| Email | `admin@adspot.demo` |
| Password | `password123` |

**Flow:** Login → auto-redirect to `/brands/admin/dashboard` → users, ads, events, financials.

### Super admin
| Email | `oadeagbo@gmail.com` |
| Password | `password123` |
| Portal | `/brands/login` → admin console |

## 5. Unified deploy (recommended)
One Node process serves SPA + API on the same origin:
```bash
pnpm start
# → http://localhost:3001
```

**AWS options:** App Runner, Elastic Beanstalk, or ECS/Fargate running `node server/dist/index.mjs` with env vars above.

## 6. Split deploy (SPA on S3/CloudFront + API elsewhere)
```bash
VITE_API_BASE_URL=https://api.yourdomain.com npx pnpm@9 run build
# Deploy app/dist to S3+CloudFront (403/404 → /index.html)
# Deploy server to App Runner/ECS
# Set CORS_ORIGINS=https://your-frontend-domain.com on API
```

## 7. Post-deploy checks
```bash
ADSPOT_LIVE_URL=https://your-domain.com ADSPOT_LIVE_API_URL=https://api.your-domain.com node scripts/hostile-audit.mjs
```

With DB connected locally, hostile audit also runs **auth smoke**: reviewer/brand/admin login, `/api/auth/me`, admin stats, brand analytics, and reviewer registration.

## Common failures
| Symptom | Cause | Fix |
|---------|-------|-----|
| `/api/healthz` 503, `db: misconfigured` | Placeholder `DATABASE_URL` | Set real Postgres URL |
| `/api/public/*` 503 | DB unreachable | Check RDS security group, credentials |
| Login 503 | `DATABASE_URL` placeholder or Postgres down | Set real `DATABASE_URL`, run `seed:accounts`, restart server |
| Login shows “Invalid email or password” but API is 503 | DB not configured | Fix `DATABASE_URL` first (not a credentials issue) |
| Reviewer login “Wrong portal” | Brand/admin email used on `/earn/login` | Use `/brands/login` for brand/admin accounts |
| Reviewer login 401 | Seed not run or wrong password | Run `seed:accounts`; use `alice@reviewer.demo` / `password123` |
| Reviewer signup skips profile | Fixed — register saves token via `establishSession` | Rebuild app if on old bundle |
| `adspot.ng` 403/000 | Not deployed | Point DNS to your host, deploy app |
| Build passes, app blank | `STATIC_DIR` unset | Set `STATIC_DIR=./app/dist` |

## Package contents
This zip includes source, `docs/HOSTILE_AUDIT_REPORT.md`, and this guide. Re-run `npx pnpm@9 install` on the target host.
