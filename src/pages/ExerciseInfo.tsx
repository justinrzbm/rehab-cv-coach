import React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const ExerciseInfo: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Exercise: ${slug}`, `Information about the ${slug} exercise.`);
  const nav = useNavigate();

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-exercises) / 0.06)" }}>
      <AppHeader mode="page" title="Exercises" centerIcon={<Dumbbell />} onBack={() => nav("/exercises")} onHelp={() => {}} accentVar="--accent-exercises" />
      <section className="container mx-auto p-4">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-3xl md:text-4xl font-bold text-center capitalize">{slug} exercise</h1>
          <p className="text-lg text-center">Practice this movement with clear guidance, voice support, and simple visuals.</p>
          <div className="rounded-xl overflow-hidden bg-card">
            <video src="" autoPlay muted loop controls className="w-full aspect-video bg-muted" />
          </div>
          <div className="flex justify-end">
            <Button onClick={() => nav(`/exercises/${slug}/run`)}>
              Begin
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default ExerciseInfo;
