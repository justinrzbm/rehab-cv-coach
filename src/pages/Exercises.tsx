
import React, { useState, useEffect } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell, Images } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import { useTTS } from "@/components/tts/useTTS";
import { SelectableCard } from "@/components/common/SelectableCard";

const exercises = [
  { key: "wrist-flexion", title: "Wrist Flexion", img: "/placeholder.svg" },
  { key: "wrist-extension", title: "Wrist Extension", img: "/placeholder.svg" },
  { key: "finger-tap", title: "Finger Tap", img: "/placeholder.svg" },
];

const HELP_SEQUENCE = [
  { key: "wrist-flexion", label: "Wrist Flexion", desc: "Wrist Flexion: Move your wrist up and down." },
  { key: "wrist-extension", label: "Wrist Extension", desc: "Wrist Extension: Move your wrist backward." },
  { key: "finger-tap", label: "Finger Tap", desc: "Finger Tap: Tap your fingers one at a time." },
];

const ExercisesPage: React.FC = () => {
  useSEO("Rehab Coach – Training Games", "Pick a single exercise to practice with tracking and voice.");
  const nav = useNavigate();
  const { speak, stop } = useTTS(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [helpStep, setHelpStep] = useState<number | null>(null);

  // Help sequence logic
  const runHelp = async () => {
    for (let i = 0; i < HELP_SEQUENCE.length; ++i) {
      setHelpStep(i);
      stop();
      speak(HELP_SEQUENCE[i].desc);
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
            {HELP_SEQUENCE[helpStep].desc}
          </div>
        )}
        {helpStep === null && <div style={{ minHeight: 48, marginBottom: 32 }} />}
        <div className="flex items-center justify-center gap-6 md:gap-10">
          {exercises.map((e, i) => (
            <SelectableCard
              key={e.key}
              Icon={Dumbbell}
              label={e.title}
              colorVar="--accent-exercises"
              primed={helpStep === i}
              onClick={() => setSelected(e.key)}
            />
          ))}
        </div>
        {selected && (
          <div className="flex justify-end mt-6">
            <Button onClick={() => nav(`/exercises/${selected}/info`)}>Details</Button>
          </div>
        )}
        {selected && (
          <div className="w-full flex justify-center mt-10">
            <div className="rounded-xl overflow-hidden bg-card aspect-video flex items-center justify-center max-w-2xl w-full">
              <img src={exercises.find((e) => e.key === selected)!.img} alt={`${selected} guide`} className="w-full h-full object-contain" loading="lazy" />
            </div>
          </div>
        )}
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
