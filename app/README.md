# AdSpot — Unified Application

One application that merges the three separate web apps into a single, router-driven
experience with the **landing page as the entry point**. No more running each app
independently.

## What was merged
| Section  | Source app        | Route        | Purpose                                   |
|----------|-------------------|--------------|-------------------------------------------|
| Landing  | `adspot-landing`  | `/`          | Marketing entry. The two CTAs route in-app|
| Earn     | `adspot-web`      | `/earn/*`    | "Start Earning" — reviewers watch & earn  |
| Brands   | `adspot-brand`    | `/brands/*`  | "For Brands" — place ads, track metrics   |

- **Start Earning** → `/earn`  (reviewer login, dashboard, leaderboard, review sessions)
- **For Brands** → `/brands`  (brand login, ads, settings, and the admin console)

`adspot-reviewer` is the separate **Expo mobile** app (React Native) and is intentionally
not merged — a mobile app can't live inside a web SPA. `adspot-web` already is the web
reviewer platform, so both landing buttons are covered.

## How it works
- A single wouter router (in `src/App.tsx`) mounts each section under its own base path
  using nested routes, so the three apps' overlapping routes (`/`, `/login`, `/dashboard`,
  `/admin`) no longer collide.
- One `QueryClientProvider` at the top; each section keeps its own `AuthProvider`.
- **Auth token conflict resolved:** the two apps each stored a different token
  (`adspot_token` vs `adspot_brand_token`) and both set the API client's token getter at
  module load — the last one won. `src/main.tsx` now sets a single **path-aware** getter
  before render: `/brands` uses the brand token, everything else uses the reviewer token.
- Each section's code lives in its own folder (`src/landing`, `src/earn`, `src/brands`)
  with its own import alias (`@landing`, `@earn`, `@brands`) so nothing clashes.

## Run
From the monorepo root:
```bash
pnpm install
pnpm --filter @workspace/adspot-unified dev      # dev server
pnpm --filter @workspace/adspot-unified build     # production build -> dist/
pnpm --filter @workspace/adspot-unified preview    # serve the build
```
It uses the shared workspace libraries `@workspace/api-client-react` and
`@workspace/object-storage-web`, so it builds from within the monorepo. Point it at your
running `api-server` (same backend the original apps used).

## Verified
- `vite build` → exit 0 (2923 modules).
- `tsc --noEmit` → exit 0, 0 type errors.
- Boots (HTTP 200); landing, earn, and brand code all present in the bundle.
