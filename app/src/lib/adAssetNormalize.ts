/** Client-side mirror of server asset normalization for brand create forms. */

import { extractYoutubeId, extractVimeoId } from "../earn/lib/adMedia";

export function detectAssetTypeFromUrl(
  assetUrl: string,
  fallback: "image" | "video" = "video",
): "youtube" | "vimeo" | "video" | "image" {
  const url = assetUrl.trim();
  const lower = url.toLowerCase();

  if (extractYoutubeId(url)) return "youtube";
  if (extractVimeoId(url)) return "vimeo";
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(lower)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(lower) || lower.includes("/api/storage/")) {
    return "video";
  }
  return fallback;
}

export function normalizeAssetPayload(assetUrl: string, assetType: "image" | "video") {
  const detected = detectAssetTypeFromUrl(assetUrl, assetType);

  if (detected === "youtube") {
    const id = extractYoutubeId(assetUrl);
    return { assetUrl: id || assetUrl.trim(), assetType: "youtube" as const };
  }

  if (detected === "vimeo") {
    const id = extractVimeoId(assetUrl);
    return { assetUrl: id || assetUrl.trim(), assetType: "vimeo" as const };
  }

  return { assetUrl: assetUrl.trim(), assetType: detected };
}
