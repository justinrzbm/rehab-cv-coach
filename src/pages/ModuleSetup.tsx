import React, { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, RotateCcw, Pause } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const TUTORIAL_SRC: Record<string, string> = {
  feeding: "/videos/31645F4F-66F2-4347-9E3C-D73241EE24A8.mp4",
};

const ModuleSetup: React.FC = () => {
  const { slug = "feeding" } = useParams();
  useSEO(`Tutorial: ${slug}`, `Step-by-step tutorial for ${slug}.`);
  const nav = useNavigate();

  const video = TUTORIAL_SRC[slug] ?? TUTORIAL_SRC.feeding;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);

  
  // Overlay presentation for pause feedback
  const [overlayAlpha, setOverlayAlpha] = useState(0);
  const [showPauseGlyph, setShowPauseGlyph] = useState(false);
  const overlayTimerRef = useRef<number | null>(null);
// Count how many times this page is visited for a module
  useEffect(() => {
    const key = `setup_seen_${slug}`;
    const count = Number(localStorage.getItem(key) || "0");
    localStorage.setItem(key, String(count + 1));
  }, [slug]);
// Reveal Next after 2 seconds playback
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (!showNext && vid.currentTime >= 2) setShowNext(true);
    };
    vid.addEventListener("timeupdate", onTime);
    return () => vid.removeEventListener("timeupdate", onTime);
  }, [showNext]);

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      vid.pause();
    } else {
      vid.muted = false;
      vid.play();
    }
  };

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: "hsl(var(--accent-modules) / 0.06)" }}
    >
      <AppHeader
        mode="page"
        title="Tutorial"
        centerIcon={<BookOpen />}
        onBack={() => nav(`/modules/${slug}/info`)}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <section className="flex-grow container mx-auto p-4 flex flex-col items-center gap-6">
        {/* Video wrapper */}
        <div
          className="
            relative w-full max-w-5xl rounded-2xl overflow-hidden bg-black
            flex items-center justify-center
            h-[62dvh] md:h-[58dvh] sm:h-[52dvh]
          "
        >
          <video
            ref={videoRef}
            key={video}
            src={video}
            className="w-full h-full object-contain"
            autoPlay
           
            playsInline
            onPlay={() => { setIsPlaying(true); setOverlayAlpha(0); setShowPauseGlyph(false); }}
            onPause={() => { setIsPlaying(false); setShowPauseGlyph(true); setOverlayAlpha(0.25); if (overlayTimerRef.current) window.clearTimeout(overlayTimerRef.current); overlayTimerRef.current = window.setTimeout(() => { setOverlayAlpha(0); setShowPauseGlyph(false); }, 900); }}
          />

          {/* Overlay control */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center transition" style={{ background: `rgba(0,0,0, ${overlayAlpha})`, transition: "background 300ms ease" }}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {showPauseGlyph ? (
            <Pause size={64} className="text-white drop-shadow-lg transition-opacity" style={{ opacity: showPauseGlyph ? 1 : 0 }} />
          ) : (!isPlaying ? (
            <RotateCcw size={64} className="text-white drop-shadow-lg" />
          ) : null)}
          </button>
          {/* Mute/Unmute button */}
          <button
            onClick={() => {
              const vid = videoRef.current;
              if (!vid) return;
              vid.muted = !vid.muted;
            }}
            className="absolute top-3 right-3 bg-white/85 hover:bg-white text-black text-sm font-medium rounded-lg px-3 py-1.5 shadow"
            aria-label="Toggle mute"
          >
            {videoRef.current?.muted ? "Unmute" : "Mute"}
          </button>
        </div>

        {/* Next button */}
        {showNext && (
          <div className="flex justify-center w-full pt-1">
            <Button size="lg" onClick={() => nav(`/modules/${slug}/run`)}>
              Next
            </Button>
          </div>
        )}
      </section>
    </main>
  );
};

export default ModuleSetup;
