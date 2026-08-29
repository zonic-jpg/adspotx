/**
 * Normalize brand-uploaded asset URLs to the assetType the reviewer player expects.
 */

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/|m\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i;

function extractYoutubeId(assetUrl: string): string {
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
    /* not a URL */
  }

  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return "";
}

function extractVimeoId(assetUrl: string): string {
  if (!assetUrl) return "";
  const trimmed = assetUrl.trim();
  const match = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (match?.[1]) return match[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return "";
}

export function normalizeAdAsset(
  assetUrl: string,
  assetType?: string | null,
): { assetUrl: string; assetType: string } {
  const url = assetUrl.trim();
  const lower = url.toLowerCase();
  const declared = assetType?.toLowerCase() ?? "video";

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

  return { assetUrl: url, assetType: declared || "video" };
}

/** Apply normalization when serving ads to reviewers (fixes legacy mis-typed rows). */
export function normalizeAdForPlayback<T extends { assetUrl: string; assetType: string }>(
  ad: T,
): T {
  const normalized = normalizeAdAsset(ad.assetUrl, ad.assetType);
  if (normalized.assetUrl === ad.assetUrl && normalized.assetType === ad.assetType) {
    return ad;
  }
  return { ...ad, ...normalized };
}
