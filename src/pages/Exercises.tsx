
import React, { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell, Images } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import { useTTS } from "@/components/tts/useTTS";
import { SelectableCard } from "@/components/common/SelectableCard";


const EXERCISES = [
  { key: "fruitninja", label: "Fruit Ninja", Icon: Dumbbell, desc: "Fruit Ninja: Slice the fruit by moving your hand quickly." },
  { key: "starshooter", label: "Star Shooter", Icon: Dumbbell, desc: "Star Shooter: Point and shoot at the stars to score points." },
  { key: "flappyball", label: "Flappy Ball", Icon: Dumbbell, desc: "Flappy Ball: Move your hand up and down to keep the ball in the air." },
];



const ExercisesPage: React.FC = () => {
  useSEO("Rehab Coach – Training Games", "Pick a single exercise to practice with tracking and voice.");
  const nav = useNavigate();
  const { speak, stop } = useTTS(true);

  const [selected, setSelected] = useState<string | null>(null);
  const [helpStep, setHelpStep] = useState<number | null>(null);

  // Help sequence logic

  const runHelp = async () => {
    for (let i = 0; i < EXERCISES.length; ++i) {
      setHelpStep(i);
      stop();
      speak(EXERCISES[i].desc);
      await new Promise((res) => setTimeout(res, 2200));
    }
    setHelpStep(null);
  };

  useEffect(() => {
    runHelp();
    // eslint-disable-next-line
  }, []);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-exercises) / 0.06)" }}>
      <AppHeader mode="page" title="Training Games" centerIcon={<Dumbbell />} onBack={() => nav("/")} onHelp={runHelp} accentVar="--accent-exercises" />

      <section className="container mx-auto pt-6">
        {/* Help description text */}
        {helpStep !== null && (
          <div style={{ minHeight: 48, marginBottom: 32, textAlign: "center", fontSize: 24, fontWeight: 600, color: "#222", zIndex: 10 }}>
            {EXERCISES[helpStep].desc}
          </div>
        )}
        {helpStep === null && <div style={{ minHeight: 48, marginBottom: 32 }} />}
        <div className="flex items-center justify-center gap-6 md:gap-10">
          {EXERCISES.map((ex, i) => (
            <SelectableCard
              key={ex.key}
              Icon={ex.Icon}
              label={ex.label}
              colorVar="--accent-exercises"
              primed={helpStep === i}
              onClick={() => nav(`/exercises/${ex.key}`)}
            />
          ))}
        </div>
  {/* No details or preview for new exercise navigation */}
        <style>{`
          .SelectableCard-primed {
            box-shadow: 0 0 32px 8px #fffbe6, 0 0 0 8px #ffe066;
            transform: scale(1.08);
            z-index: 40;
          }
        `}</style>
      </section>
    </main>
  );
};

export default ExercisesPage;
