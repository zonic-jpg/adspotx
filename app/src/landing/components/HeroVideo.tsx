import { useRef, useState } from "react";
import { Play } from "lucide-react";

/** Static explainer in app/public (Watch → Answer → Earn). Pexels fallback if asset fails. */
const HERO_VIDEO_SRC = "/hero-demo.mp4";
const HERO_POSTER = "/hero-demo-poster.jpg";
const HERO_VIDEO_FALLBACK =
  "https://videos.pexels.com/video-files/3195394/3195394-sd_640_360_25fps.mp4";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [src, setSrc] = useState(HERO_VIDEO_SRC);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    void video.play();
    setPlaying(true);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-border bg-zinc-950 shadow-xl aspect-video">
      <video
        ref={videoRef}
        key={src}
        src={src}
        poster={src === HERO_VIDEO_SRC ? HERO_POSTER : undefined}
        className="h-full w-full object-cover"
        playsInline
        controls={playing}
        preload="metadata"
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (src !== HERO_VIDEO_FALLBACK) setSrc(HERO_VIDEO_FALLBACK);
        }}
      />

      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Play AdSpot explainer"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105">
            <Play size={28} className="ml-1" fill="currentColor" />
          </span>
          <span className="text-sm font-medium text-white/90">See how it works</span>
        </button>
      )}
    </div>
  );
}
