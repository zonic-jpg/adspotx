# AdSpot Video Playback Fix — 5 Aug 2026

Brand-created ads appeared in the reviewer feed but did not play when opened on `/earn/review/:id`.

## Root cause

YouTube share URLs with **extra query parameters before `v=`** (e.g. `watch?feature=shared&v=ID`) were not matched by the old regex, which only accepted `watch?v=`.

Those URLs were stored as:

| Field | Bad value |
|-------|-----------|
| `assetType` | `"video"` |
| `assetUrl` | full YouTube URL |

Seed ads worked because they use bare IDs with `assetType: "youtube"`. The reviewer `VideoPlayer` then tried native HTML5 `<video src="https://youtube.com/...">`, which cannot play YouTube pages.

## Trace (broken path)

1. **Brand create** — `CreateAd.tsx` → `normalizeAssetPayload()` missed `watch?feature=…&v=` → sent `assetType: "video"` + full URL
2. **Server POST /api/brands/ads** — `normalizeAdAsset()` had the same regex gap → persisted mis-typed row
3. **GET /api/ads** — returned raw DB values (`video` + full URL)
4. **ReviewSession** — passed values straight to `VideoPlayer`
5. **VideoPlayer** — `buildEmbedSrc()` returned `null` (not `youtube`); fell through to `<video>` → blank / unplayable

## Fix

| Layer | Change |
|-------|--------|
| **YouTube parsing** | Parse `v=` via `URL.searchParams`, support `youtu.be`, shorts, live, mobile hosts |
| **Server normalize** | `server/src/lib/asset-normalize.ts` — robust detection on create + `normalizeAdForPlayback()` on read |
| **Client normalize** | `app/src/lib/adAssetNormalize.ts` — same rules at brand create time |
| **Reviewer player** | `resolvePlayableAdMedia()` re-detects YouTube/Vimeo even when DB type is wrong; clear error UI when unplayable |
| **API read path** | `GET /api/ads` and `GET /api/ads/:id` normalize media before responding |

## Files changed

- `app/src/earn/lib/adMedia.ts` — `extractYoutubeId`, `extractVimeoId`, `resolvePlayableAdMedia`
- `app/src/lib/adAssetNormalize.ts` — brand create normalization
- `app/src/earn/components/VideoPlayer.tsx` — resolver + error states
- `server/src/lib/asset-normalize.ts` — server normalization + read-time fix
- `server/src/routes/ads.ts` — normalize on feed/detail responses
- `server/src/lib/asset-normalize.test.ts` — unit tests
- `scripts/test-reviewer-flow.mjs` — normalization + brand YouTube create checks
- `scripts/hostile-audit.mjs` — asset-normalize tests + bundle resolver check

## Verification

```bash
pnpm run build
npx vitest run server/src/lib/asset-normalize.test.ts
node scripts/hostile-audit.mjs --mock-only --skip-install --force-mock
node scripts/test-reviewer-flow.mjs http://127.0.0.1:3199   # with server running
pnpm run package:staging   # → ~/Downloads/adspotx-latest.zip
```

### Manual checklist

1. Brand: paste `https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ` → create campaign
2. Reviewer: open campaign → YouTube embed plays (not blank)
3. Brand: upload `.mp4` → reviewer plays native video from `/api/storage/objects/...`
4. Invalid URL → reviewer sees “This ad media cannot be played” (not silent blank)
