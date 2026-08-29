import { useState, useEffect, useRef } from "react";
import { Play, AlertCircle, RefreshCw } from "lucide-react";
import { extractYoutubeId, resolvePlayableAdMedia, type PlayableAssetType } from "@earn/lib/adMedia";

type VideoType = PlayableAssetType | string;

interface VideoPlayerProps {
  videoId: string;
  assetType: VideoType;
  autoplay?: boolean;
  muted?: boolean;
  background?: boolean;
  className?: string;
  onReady?: () => void;
  onError?: () => void;
}

function buildEmbedSrc(
  videoId: string,
  assetType: VideoType,
  autoplay: boolean,
  muted: boolean,
  background: boolean,
): string | null {
  if (!videoId) return null;

  if (assetType === "youtube") {
    const id = extractYoutubeId(videoId);
    if (!id) return null;
    const params = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      mute: muted ? "1" : "0",
      rel: "0",
      modestbranding: "1",
      playsinline: "1",
      enablejsapi: "1",
      ...(background ? { controls: "0", disablekb: "1", fs: "0", loop: "1", playlist: id } : {}),
    });
    return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
  }

  if (assetType === "vimeo") {
    const params = new URLSearchParams({
      autoplay: autoplay ? "1" : "0",
      muted: muted ? "1" : "0",
      background: background ? "1" : "0",
      title: "0",
      byline: "0",
      portrait: "0",
      badge: "0",
      dnt: "1",
    });
    return `https://player.vimeo.com/video/${videoId}?${params}`;
  }

  return null;
}

const BLANK_CHECK_DELAY = 6000;
const MAX_RETRIES = 2;

export function VideoPlayer({
  videoId,
  assetType,
  autoplay = false,
  muted = false,
  background = false,
  className = "",
  onReady,
  onError,
}: VideoPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "blank">("loading");
  const [retries, setRetries] = useState(0);
  const [key, setKey] = useState(0);

  const resolved = resolvePlayableAdMedia(videoId, assetType);
  const mediaUrl = resolved?.assetUrl ?? videoId;
  const mediaType = resolved?.assetType ?? assetType;

  const embedSrc = buildEmbedSrc(mediaUrl, mediaType, autoplay, muted, background);
  const isNativeVideo = mediaType === "video" && !!mediaUrl;
  const isImageAd = mediaType === "image" && !!mediaUrl;

  // Native HTML5 video
  useEffect(() => {
    if (!isNativeVideo) return;
    setStatus("loading");
    const el = videoRef.current;
    if (!el) return;

    const onCanPlay = () => {
      setStatus("ready");
      onReady?.();
      if (autoplay) void el.play().catch(() => {});
    };
    const onFail = () => {
      setStatus("error");
      onError?.();
    };

    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("error", onFail);
    return () => {
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("error", onFail);
    };
  }, [isNativeVideo, mediaUrl, autoplay, key]);

  // Static image ad
  useEffect(() => {
    if (!isImageAd) return;
    setStatus("loading");
  }, [isImageAd, mediaUrl, key]);

  // iframe embed (YouTube / Vimeo)
  useEffect(() => {
    if (!embedSrc) {
      if (!isNativeVideo && !isImageAd) setStatus("error");
      return;
    }
    setStatus("loading");

    let resolved = false;

    const resolve = (s: "ready" | "error" | "blank") => {
      if (resolved) return;
      resolved = true;
      clearTimeout(blankTimer);
      setStatus(s);
      if (s === "ready") onReady?.();
      else onError?.();
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        if (typeof e.data === "string") {
          const d = JSON.parse(e.data);
          if (d.event === "onReady" || d.event === "onStateChange" || d.event === "initialDelivery") {
            resolve("ready");
          }
          if (d.event === "onError") resolve("error");
        }
        if (typeof e.data === "object" && e.data?.event === "ready") {
          resolve("ready");
        }
      } catch {
        /* ignore non-JSON postMessage */
      }
    };

    window.addEventListener("message", handleMessage);

    const blankTimer = setTimeout(() => {
      if (!resolved) resolve("blank");
    }, BLANK_CHECK_DELAY);

    return () => {
      window.removeEventListener("message", handleMessage);
      clearTimeout(blankTimer);
    };
  }, [embedSrc, key, isNativeVideo, isImageAd]);

  const retry = () => {
    if (retries >= MAX_RETRIES) return;
    setRetries(r => r + 1);
    setKey(k => k + 1);
    setStatus("loading");
  };

  if (!videoId?.trim()) {
    return (
      <div
        className={`flex items-center justify-center bg-[#f5f5f7] ${className}`}
        data-testid="review-video-player-empty"
      >
        <div className="text-center p-6">
          <AlertCircle size={32} className="text-[#86868b] mx-auto mb-2" />
          <p className="text-[13px] text-[#86868b]">No media attached to this campaign</p>
          <p className="text-[12px] text-[#aeaeb2] mt-1">The brand may still be uploading their ad.</p>
        </div>
      </div>
    );
  }

  if (!resolved) {
    return (
      <div
        className={`flex items-center justify-center bg-[#f5f5f7] ${className}`}
        data-testid="review-video-player-unsupported"
      >
        <div className="text-center p-6 max-w-sm">
          <AlertCircle size={32} className="text-[#86868b] mx-auto mb-2" />
          <p className="text-[13px] text-[#86868b] font-medium">This ad media cannot be played</p>
          <p className="text-[12px] text-[#aeaeb2] mt-1">
            Saved as <span className="font-mono">{assetType || "unknown"}</span> — use a YouTube/Vimeo link,
            direct video URL, or uploaded file.
          </p>
        </div>
      </div>
    );
  }

  if (!embedSrc && !isNativeVideo && !isImageAd) {
    return (
      <div
        className={`flex items-center justify-center bg-[#f5f5f7] ${className}`}
        data-testid="review-video-player-unsupported"
      >
        <div className="text-center p-6 max-w-sm">
          <AlertCircle size={32} className="text-[#86868b] mx-auto mb-2" />
          <p className="text-[13px] text-[#86868b] font-medium">Unsupported media type: {mediaType}</p>
          <p className="text-[12px] text-[#aeaeb2] mt-1 break-all">{mediaUrl}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative bg-black ${className}`} data-testid="review-video-player">
      {isImageAd && (
        <img
          key={key}
          src={mediaUrl}
          alt="Ad creative"
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
            status === "ready" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => {
            setStatus("ready");
            onReady?.();
          }}
          onError={() => {
            setStatus("error");
            onError?.();
          }}
        />
      )}

      {isNativeVideo && (
        <video
          key={key}
          ref={videoRef}
          src={mediaUrl}
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${
            status === "ready" ? "opacity-100" : "opacity-0"
          }`}
          controls={!background}
          playsInline
          muted={muted}
          autoPlay={autoplay}
        />
      )}

      {embedSrc && (
        <iframe
          key={key}
          ref={iframeRef}
          src={embedSrc}
          title="Ad video"
          className={`absolute inset-0 w-full h-full transition-opacity duration-500 ${
            status === "ready" ? "opacity-100" : "opacity-0"
          }`}
          style={{ border: "none" }}
          allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}

      {status === "loading" && (
        <div className="absolute inset-0 bg-[#1d1d1f] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
            <p className="text-[12px] text-white/40">Loading ad...</p>
          </div>
        </div>
      )}

      {(status === "error" || status === "blank") && (
        <div className="absolute inset-0 bg-[#1d1d1f] flex items-center justify-center">
          <div className="text-center p-6">
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={24} className="text-white/60" />
            </div>
            <p className="text-white font-medium text-[15px] mb-1">
              {status === "blank" ? "Video unavailable" : "Couldn't load ad media"}
            </p>
            <p className="text-white/40 text-[13px] mb-4">
              {status === "blank"
                ? "This video may be restricted in your region."
                : "Check your connection and try again."}
            </p>
            {retries < MAX_RETRIES && (
              <button
                type="button"
                onClick={retry}
                className="inline-flex items-center gap-2 text-white/80 hover:text-white text-[13px] font-medium border border-white/20 hover:border-white/40 px-4 py-2 rounded-full transition-all"
              >
                <RefreshCw size={13} /> Retry
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Simplified thumbnail-style tile for ad feed grids */
export function VideoTile({
  videoId,
  assetType,
  brandName,
  title,
  pointReward,
  multiplier,
  onClick,
}: {
  videoId: string;
  assetType: VideoType;
  brandName: string;
  title: string;
  pointReward: number;
  multiplier: number;
  onClick?: () => void;
}) {
  const [thumbError, setThumbError] = useState(false);
  const resolved = resolvePlayableAdMedia(videoId, assetType);
  const thumbUrl = !thumbError && resolved
    ? resolved.assetType === "youtube"
      ? `https://img.youtube.com/vi/${resolved.assetUrl}/mqdefault.jpg`
      : resolved.assetType === "vimeo"
        ? `https://vumbnail.com/${resolved.assetUrl}.jpg`
        : resolved.assetType === "image"
          ? resolved.assetUrl
          : null
    : null;

  return (
    <div
      onClick={onClick}
      className="group rounded-2xl border border-black/[0.08] bg-white overflow-hidden hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)] hover:border-black/[0.14] transition-all cursor-pointer"
    >
      <div className="relative aspect-video bg-[#1d1d1f] overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#1d1d1f] to-[#2d2d2f] flex items-center justify-center">
            <Play size={32} className="text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play size={18} className="text-[#1d1d1f] ml-0.5" fill="currentColor" />
          </div>
        </div>

        {multiplier > 1.0 && (
          <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-amber-500 text-white text-[11px] font-bold px-2 py-1 rounded-full">
            {multiplier.toFixed(1)}×
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider mb-1">{brandName}</p>
        <p className="text-[14px] font-semibold text-[#1d1d1f] line-clamp-2 leading-snug mb-2 group-hover:text-[#0071e3] transition-colors">
          {title}
        </p>
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-bold text-[#1d1d1f]">+{pointReward} pts</span>
          {multiplier > 1.0 && (
            <span className="text-[12px] text-amber-600 font-medium">
              ({Math.round(pointReward * multiplier)} with boost)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
