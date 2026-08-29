# AdSpotX — Login Fix Handoff

Status: typecheck clean · 39 unit tests pass · server + frontend build clean.

This covers the **login/auth gaps**. Two parts: (1) code changes already made in
this package, and (2) operational steps only you/Cursor can do (they touch your
live database, servers, and hosting — not the code).

---

## Part 1 — Code changes already applied (done, verified)

1. **`server/src/middlewares/auth.ts` — JWT secret hardened.**
   The app had a public fallback signing secret baked into the repo. Before, it
   was only rejected when `NODE_ENV=production`; with `NODE_ENV` unset or
   "staging", the server silently signed tokens anyone could forge.
   Now the built-in secret is allowed **only** in `development` / `test`. Every
   other environment must supply `JWT_SECRET` or the server refuses to start.
   → **Action required:** set `JWT_SECRET` (long random string) in the API
   server's environment, or it won't boot in production. See Part 2.B.

2. **`server/src/lib/partner-memory-store.ts` — demo bypass disabled in prod.**
   Mock/"audit" mode (`AUDIT_PARTNER_MOCK=1`) let seeded accounts log in with a
   fixed password. It is now force-disabled whenever `NODE_ENV=production`, even
   if that env var leaks in.

3. **`server/src/lib/admin-memory-store.ts` — mock login can't mint admins.**
   Even in mock mode (non-prod), the fixed-password path now refuses `admin` and
   `super_admin` roles, so it can never produce a privileged/owner token.

4. **`lib/db/src/seed-accounts.ts` and `lib/db/src/seed.ts` — owner password.**
   The owner account (`oadeagbo@gmail.com`, super_admin) was seeded with
   `password123`. New seeds take the owner password from `OWNER_INITIAL_PASSWORD`,
   or generate a strong random one and print it once. Demo brand/reviewer
   accounts still use `password123` on purpose (local demo only).

---

## Part 2 — You/Cursor must do these (I can't reach your DB or hosts)

**A. Change the live owner password NOW — most urgent.**
`oadeagbo@gmail.com` almost certainly still has `password123` in the production
database, and that email+password pair is printed across your README and deploy
docs. Anyone who has seen the repo can log into the owner account. Reset it
directly in the live DB (via your admin UI's change-password, or a one-off SQL
update of `password_hash` with a fresh bcrypt hash). The seed change above does
NOT fix the existing row — it only affects fresh seeds.

**B. Set `JWT_SECRET`** in the API server environment (any long random string,
e.g. `openssl rand -base64 48`). The server now requires it outside dev/test.

**C. Stand up / confirm the backend — this is why login "doesn't work" on
Netlify.** Netlify only hosts the static frontend. Login needs the Express +
Postgres API running and reachable. Pick one shape:
  - **Unified host (simplest):** run `pnpm start` on a Node host (Railway,
    Render, AWS App Runner). It serves the SPA and the API from one origin, so no
    `VITE_API_BASE_URL` or CORS juggling is needed. Point your domain at it.
  - **Split deploy (keep Netlify for the frontend):** host the API separately,
    then set `VITE_API_BASE_URL` in the Netlify build env to the API origin, and
    set `CORS_ORIGINS` on the API to `https://adspotx.netlify.app`.

**D. Make sure the DB schema exists** on the API's database:
`pnpm --filter @workspace/db push`. If the schema is missing, login (and signup)
will return 500/503 — the same issue seen before.

**E. Scrub credentials from committed docs** (README, deploy guides, release
notes still print the owner email + `password123`). Lower urgency than A.

---

## 30-second diagnosis if login still fails

DevTools → Network → attempt login → click the `login` request, read the status:
- **404 / HTML** → no backend reachable → do Part 2.C.
- **CORS error** → API origin set but CORS wrong → fix `CORS_ORIGINS` (2.C split).
- **401** → backend fine; wrong credentials.
- **500 / 503** → backend up, DB down or schema missing → do 2.D.

---

## Note for whoever deploys

Run the workspace build before deploying (`pnpm install` then the frontend build,
or the server build for the unified host). The unit tests (`pnpm -r test`) and
typecheck should stay green — I left them passing.
