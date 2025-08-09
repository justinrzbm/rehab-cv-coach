import React, { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen, RotateCcw, Pause } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const TUTORIAL_SRC: Record<string, string> = {
  feeding: "/videos/feeding_demo.mp4",
};

const ModuleSetup: React.FC = () => {
  const { slug = "feeding" } = useParams();
  useSEO(`Tutorial: ${slug}`, `Step-by-step tutorial for ${slug}.`);
  const nav = useNavigate();

  const video = TUTORIAL_SRC[slug] ?? TUTORIAL_SRC.feeding;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showNext, setShowNext] = useState(false);

  // Count how many times this page is visited for a module
  useEffect(() => {
    const key = `setup_seen_${slug}`;
    const count = Number(localStorage.getItem(key) || "0");
    localStorage.setItem(key, String(count + 1));
  }, [slug]);

  // Ensure muted on load
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = true;
  }, []);

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
    if (isPlaying) vid.pause();
    else vid.play();
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
            muted
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {/* Overlay control */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause size={64} className="text-white drop-shadow-lg" />
            ) : (
              <RotateCcw size={64} className="text-white drop-shadow-lg" />
            )}
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
