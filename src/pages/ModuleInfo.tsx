import React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const ModuleInfo: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Module: ${slug}`, `Information about the ${slug} module.`);
  const nav = useNavigate();

  const begin = () => {
    const key = `setup_seen_${slug}`;
    const count = Number(localStorage.getItem(key) || "0");
    if (count >= 3) nav(`/modules/${slug}/run`);
    else nav(`/modules/${slug}/setup`);
  };

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader mode="page" title="Modules" centerIcon={<BookOpen />} onBack={() => nav("/modules")} onHelp={() => {}} accentVar="--accent-modules" />
      <section className="container mx-auto p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold text-center capitalize">{slug} module</h1>
          <p className="text-lg text-center">Practice this activity with clear guidance, voice support, and simple visuals.</p>
          <div className="rounded-xl overflow-hidden bg-card">
            <video src="" autoPlay muted loop controls className="w-full aspect-video bg-muted" />
          </div>
          <div className="flex justify-end">
            <Button onClick={begin}>
              Begin
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ModuleInfo;
