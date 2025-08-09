import React, { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import { RotateCcw, Pause } from "lucide-react"; // replay + pause icons

// Module metadata
const META: Record<string, { title: string; blurb: string; video: string }> = {
  feeding: {
    title: "Feeding",
    blurb:
      "Practice a realistic feeding sequence: holding a cup steady, lifting safely, and controlled tipping. This module focuses on steadiness and smooth motion to reduce spills.",
    video: "/videos/feeding_demo.mp4",
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

  // Mute all audio from previous pages
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
    }
  }, []);


  // Reveal Next after 2s of playback time
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (vid.currentTime >= 2 && !showNext) setShowNext(true);
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

      <section className="flex-grow container mx-auto p-4 flex flex-col justify-center items-center space-y-6">
        <p className="text-lg leading-relaxed max-w-3xl text-center">{m.blurb}</p>

        <div className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            key={m.video}
            src={m.video}
            className="w-full h-full object-contain"
            autoPlay
            muted
            playsInline
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          {/* Overlay play/replay control */}
          <button
            onClick={togglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition"
          >
            {isPlaying ? (
              <Pause size={64} className="text-white drop-shadow-lg" />
            ) : (
              <RotateCcw size={64} className="text-white drop-shadow-lg" />
            )}
          </button>
        </div>

        {/* Next button at bottom */}
        {showNext && (
          <div className="flex justify-center w-full pt-4">
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
