# AdSpot Reviewer Flow Fix — Video/Ad Display

**Date:** 4 August 2026  
**Issue:** Reviewer opens a campaign at `/earn/review/:id` but no video/ad is displayed.

## Root Cause

Two compounding problems:

1. **Seed data mismatch** — Demo campaigns in `lib/db/src/seed.ts` used `assetType: "image"` with Unsplash static URLs. The reviewer `VideoPlayer` only embedded YouTube/Vimeo iframes, so `buildSrc()` returned `null` and the UI showed "No video available".

2. **Incomplete media handling in UI** — `VideoPlayer` did not support `video` (direct MP4 URL) or `image` (static creative) asset types, even though the brand portal preview (`AdDetail.tsx`) already handled all four types.

The API (`GET /api/ads/:adId`) was correct — it returned `assetUrl` and `assetType` from the database. The bug was upstream (seed) and downstream (player render logic).

## Files Changed

| File | Change |
|------|--------|
| `lib/db/src/seed.ts` | Demo ads use `assetType: "youtube"` with embeddable IDs; `fixLegacyImageAds()` upgrades existing image campaigns on re-seed |
| `app/src/earn/lib/adMedia.ts` | **New** — shared YouTube ID extraction, thumbnail URLs, playable type helpers |
| `app/src/earn/components/VideoPlayer.tsx` | Support `youtube`, `vimeo`, `video`, `image`; clear empty/unsupported states; `data-testid` hooks |
| `app/src/earn/pages/Dashboard.tsx` | Thumbnails for all playable asset types via `getAdThumbUrl()` |
| `scripts/hostile-audit.mjs` | Tier 2/3 checks: reviewer login → ad feed → ad detail has playable media |

## Verification Steps

### 1. Upgrade existing database (if already seeded)

```bash
cd lib/db && pnpm seed
```

This runs `fixLegacyImageAds()` when ads already exist.

### 2. Fresh seed

```bash
cd lib/db && pnpm push && pnpm seed
```

### 3. Build and run

```bash
pnpm run build
PORT=3001 STATIC_DIR=./app/dist node server/dist/index.mjs
```

### 4. Manual reviewer flow

1. Open `http://localhost:3001/earn/login`
2. Sign in: `alice@reviewer.demo` / `password123`
3. Dashboard shows campaigns with thumbnails
4. Click any ad → `/earn/review/:id`
5. YouTube embed loads in the player; watch timer starts after ready

### 5. Automated audit

```bash
pnpm run audit:hostile:mock-only   # tier 1 + 2
pnpm run audit                    # includes tier 3 if DATABASE_URL set
```

Look for: `reviewer ad feed has playable media` and `reviewer ad detail includes media`.

## Asset Type Matrix

| `assetType` | Reviewer player | Dashboard thumb |
|-------------|-----------------|-----------------|
| `youtube`   | nocookie embed  | YouTube thumb   |
| `vimeo`     | Vimeo iframe    | vumbnail.com    |
| `video`     | HTML5 `<video>` | play icon       |
| `image`     | `<img>` static  | image URL       |
| (empty)     | empty state     | —               |

## Routes (wouter nested `/earn`)

Inside `EarnSection` use relative paths only:

- `/dashboard` → resolves to `/earn/dashboard`
- `/review/:id` → resolves to `/earn/review/:id`

Full paths like `/earn/review/:id` in nested links would double-prefix to `/earn/earn/review/:id` (see `docs/AUTH-404-FIX-REPORT.md`).
