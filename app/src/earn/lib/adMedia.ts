/** Shared helpers for reviewer ad thumbnails, embed IDs, and playback resolution. */

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i;

export const PLAYABLE_ASSET_TYPES = ["youtube", "vimeo", "video", "image"] as const;
export type PlayableAssetType = (typeof PLAYABLE_ASSET_TYPES)[number];

export function isPlayableAssetType(assetType: string): assetType is PlayableAssetType {
  return (PLAYABLE_ASSET_TYPES as readonly string[]).includes(assetType);
}

/** Normalize a YouTube asset URL or bare ID to an 11-char video id, or "" if not YouTube. */
export function extractYoutubeId(assetUrl: string): string {
  if (!assetUrl) return "";
  const trimmed = assetUrl.trim();

  const match = trimmed.match(YOUTUBE_ID_RE);
  if (match?.[1]) return match[1];

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0] ?? "";
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host.endsWith(".youtube.com")) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && /^[A-Za-z0-9_-]{11}$/.test(fromQuery)) return fromQuery;

      const embedMatch = url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (embedMatch?.[1]) return embedMatch[1];

      const shortsMatch = url.pathname.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
      if (shortsMatch?.[1]) return shortsMatch[1];

      const liveMatch = url.pathname.match(/\/live\/([A-Za-z0-9_-]{11})/);
      if (liveMatch?.[1]) return liveMatch[1];
    }
  } catch {
    /* not a URL — fall through to bare-id check */
  }

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return "";
}

export function extractVimeoId(assetUrl: string): string {
  if (!assetUrl) return "";
  const trimmed = assetUrl.trim();
  const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (match?.[1]) return match[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return "";
}

/**
 * Resolve stored ad media to the assetType + assetUrl the reviewer player expects.
 * Re-detects YouTube/Vimeo even when brands saved the wrong assetType (common with pasted URLs).
 */
export function resolvePlayableAdMedia(
  assetUrl: string,
  assetType: string,
): { assetUrl: string; assetType: PlayableAssetType } | null {
  const url = assetUrl?.trim() ?? "";
  if (!url) return null;

  const lower = url.toLowerCase();
  const declared = assetType?.toLowerCase() ?? "";

  const youtubeId = extractYoutubeId(url);
  if (youtubeId) {
    return { assetUrl: youtubeId, assetType: "youtube" };
  }

  const vimeoId = extractVimeoId(url);
  if (vimeoId) {
    return { assetUrl: vimeoId, assetType: "vimeo" };
  }

  if (declared === "image" || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(lower)) {
    return { assetUrl: url, assetType: "image" };
  }

  if (
    declared === "video" ||
    /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(lower) ||
    lower.includes("/api/storage/")
  ) {
    return { assetUrl: url, assetType: "video" };
  }

  if (isPlayableAssetType(declared)) {
    return { assetUrl: url, assetType: declared };
  }

  return null;
}

export function getAdThumbUrl(assetType: string, assetUrl: string): string | null {
  const resolved = resolvePlayableAdMedia(assetUrl, assetType);
  if (!resolved) return null;

  if (resolved.assetType === "youtube") {
    return `https://img.youtube.com/vi/${resolved.assetUrl}/mqdefault.jpg`;
  }
  if (resolved.assetType === "vimeo") {
    return `https://vumbnail.com/${resolved.assetUrl}.jpg`;
  }
  if (resolved.assetType === "image") {
    return resolved.assetUrl;
  }
  return null;
}
