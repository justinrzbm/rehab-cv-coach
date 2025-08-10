import React, { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, RotateCcw, Pause } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

// Module metadata
const META: Record<string, { title: string; blurb: string; video: string }> = {
  feeding: {
    title: "Feeding",
    blurb:
      "Practice a realistic feeding sequence: holding a cup steady, lifting safely, and controlled tipping. This module focuses on steadiness and smooth motion to reduce spills.",
    video: "/videos/F8785563-0D18-481F-A8A0-BBB7397EDCC9.mp4",
  },
};

const ModuleInfo: React.FC = () => {
  const { slug = "feeding" } = useParams();
  useSEO(`Module Info: ${slug}`, `Overview and goals for ${slug}.`);
  const nav = useNavigate();

  const m = META[slug] ?? META.feeding;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);

  
  // Overlay presentation for pause feedback
  const [overlayAlpha, setOverlayAlpha] = useState(0);
  const [showPauseGlyph, setShowPauseGlyph] = useState(false);
  const overlayTimerRef = useRef<number | null>(null);
// Reveal Next after 2s of actual playback
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
      // Unmute on user intent, then play
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
        title={m.title}
        centerIcon={<BookOpen />}
        onBack={() => nav("/modules")}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <section className="flex-grow container mx-auto p-4 flex flex-col items-center gap-6">
        <p className="text-lg leading-relaxed max-w-3xl text-center">{m.blurb}</p>

        {/* Video wrapper: responsive height so Next button stays in view */}
        <div
          className="
            relative w-full max-w-5xl rounded-2xl overflow-hidden bg-black
            flex items-center justify-center
            h-[62dvh] md:h-[58dvh] sm:h-[52dvh]
          "
        >
          <video
            ref={videoRef}
            key={m.video}
            src={m.video}
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

        {/* Next button — visible without scrolling thanks to the reserved height above */}
        {showNext && (
          <div className="flex justify-center w-full pt-1">
            <Button size="lg" onClick={() => nav(`/modules/${slug}/setup`)}>
              Next
            </Button>
          </div>
        )}
      </section>
    </main>
  );
};

export default ModuleInfo;
