import React, { useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const TUTORIAL_SRC: Record<string, string> = {
  feeding: "public/videos/feeding_demo.mp4",
};

const ModuleSetup: React.FC = () => {
  const { slug = "feeding" } = useParams();
  useSEO(`Tutorial: ${slug}`, `Step-by-step tutorial for ${slug}.`);
  const nav = useNavigate();

  useEffect(() => {
    const key = `setup_seen_${slug}`;
    const count = Number(localStorage.getItem(key) || "0");
    localStorage.setItem(key, String(count + 1));
  }, [slug]);

  const video = TUTORIAL_SRC[slug] ?? TUTORIAL_SRC.feeding;

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader
        mode="page"
        title="Tutorial"
        centerIcon={<BookOpen />}
        onBack={() => nav(`/modules/${slug}/info`)}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <section className="container mx-auto p-0">
        <div className="w-full h-[calc(100vh-8rem)] bg-black/80 text-white flex items-center justify-center">
          <video
            key={video}
            src={video}
            autoPlay
            muted
            playsInline
            controls
            className="w-full h-full object-contain"
          />
        </div>
        <div className="container mx-auto p-4 flex justify-end">
          <Button onClick={() => nav(`/modules/${slug}/ready`)}>Next</Button>
        </div>
      </section>
    </main>
  );
};

export default ModuleSetup;
