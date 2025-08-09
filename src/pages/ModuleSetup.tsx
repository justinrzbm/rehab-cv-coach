import React, { useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const ModuleSetup: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Module Setup: ${slug}`, `Quick setup tutorial for the ${slug} module.`);
  const nav = useNavigate();

  useEffect(() => {
    const key = `setup_seen_${slug}`;
    const count = Number(localStorage.getItem(key) || "0");
    localStorage.setItem(key, String(count + 1));
  }, [slug]);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader mode="page" title="Modules" centerIcon={<BookOpen />} onBack={() => nav(`/modules/${slug}/info`)} onHelp={() => {}} accentVar="--accent-modules" />
      <section className="container mx-auto p-0">
        <div className="w-full h-[calc(100vh-8rem)] bg-black/80 text-white flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-4">Setup Tutorial</div>
            <div className="text-white/70">[Autoplay video placeholder]</div>
          </div>
        </div>
        <div className="container mx-auto p-4 flex justify-end">
          <Button onClick={() => nav(`/modules/${slug}/run`)}>Begin</Button>
        </div>
      </section>
    </main>
  );
};

export default ModuleSetup;
