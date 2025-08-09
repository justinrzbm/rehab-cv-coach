import React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BookOpen } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const ModuleReady: React.FC = () => {
  const { slug = "feeding" } = useParams();
  useSEO(`Ready: ${slug}`, `Ready check for ${slug}.`);
  const nav = useNavigate();

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader
        mode="page"
        title="Ready?"
        centerIcon={<BookOpen />}
        onBack={() => nav(`/modules/${slug}/setup`)}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <section className="container mx-auto p-8">
        <div className="rounded-2xl border bg-card p-8 min-h-[40vh] flex items-center justify-center text-muted-foreground">
          (Placeholder page) — add checks or calibration here.
        </div>
        <div className="flex justify-end pt-4">
          <Button onClick={() => nav(`/modules/${slug}/run`)}>Next</Button>
        </div>
      </section>
    </main>
  );
};

export default ModuleReady;
