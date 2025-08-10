import React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useTTS } from "@/components/tts/useTTS";
import { HandExercise, type AttemptMetrics } from "@/components/exercise/HandExercise";
import { useSEO } from "@/hooks/useSEO";
import { saveExerciseAttempt } from "@/services/metrics";
import { useToast } from "@/components/ui/use-toast";

const ExerciseRun: React.FC = () => {
  const { slug } = useParams();
  useSEO(`Run Exercise: ${slug}`, `Run ${slug} with live hand tracking and voice guidance.`);
  const nav = useNavigate();
  const { speak } = useTTS(true);
  const { toast } = useToast();

  const onAttemptComplete = async (m: AttemptMetrics) => {
    const successful_reps = Math.round((m.reps || 0) * (m.successRate || 0) / 100);
    const total_reps = m.reps || 0;
    const res = await saveExerciseAttempt({
      exercise_name: slug!,
      successful_reps,
      total_reps,
      metrics: { avgSpeed: m.avgSpeed, romPercent: m.romPercent, percentInRange: m.percentInRange, successRate: m.successRate },
    });
    if (!res.saved) {
      toast({ title: "Metrics saved locally", description: "Connect Supabase auth to save to cloud." });
    } else {
      toast({ title: "Saved", description: "Your attempt was saved." });
    }
  };

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-exercises) / 0.08)" }}>
      <AppHeader mode="page" title="Exercises" centerIcon={<Dumbbell />} onBack={() => nav(`/exercises/${slug}/info`)} onHelp={() => {}} accentVar="--accent-exercises" />
      <section className="container mx-auto p-4">
        <HandExercise onAttemptComplete={onAttemptComplete} />
      </section>
    </main>
  );
};

export default ExerciseRun;
