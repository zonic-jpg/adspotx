import { useRef, useState } from "react";
import { Play } from "lucide-react";

/** Placeholder demo clip — swap for a brand asset in public/ when available. */
const HERO_VIDEO_SRC =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

export function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

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
        src={HERO_VIDEO_SRC}
        className="h-full w-full object-cover"
        playsInline
        controls={playing}
        preload="metadata"
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Play sample advert"
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
