import React, { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Dumbbell, Images } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";

const exercises = [
  { key: "wrist-flexion", title: "Wrist Flexion", img: "/placeholder.svg" },
  { key: "wrist-extension", title: "Wrist Extension", img: "/placeholder.svg" },
  { key: "finger-tap", title: "Finger Tap", img: "/placeholder.svg" },
];

const ExercisesPage: React.FC = () => {
  useSEO("Rehab Coach – Training Games", "Pick a single exercise to practice with tracking and voice.");
  const nav = useNavigate();
  const [selected, setSelected] = useState(exercises[0].key);

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-exercises) / 0.06)" }}>
      <AppHeader mode="page" title="Training Games" centerIcon={<Dumbbell />} onBack={() => nav("/")} onHelp={() => {}} accentVar="--accent-exercises" />

      <section className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <div className="space-y-3">
          {exercises.map((e) => (
            <button key={e.key} onClick={() => setSelected(e.key)} className={`w-full rounded-xl p-4 text-left border ${selected === e.key ? 'bg-white' : 'bg-card'} hover-scale`}>
              {e.title}
            </button>
          ))}
        </div>
        <div className="md:col-span-2 rounded-xl overflow-hidden bg-card aspect-video flex items-center justify-center">
          <img src={exercises.find((e) => e.key === selected)!.img} alt={`${selected} guide`} className="w-full h-full object-contain" loading="lazy" />
        </div>

        <div className="md:col-span-3 flex justify-end">
          <Button onClick={() => nav("/exercises/fruit-ninja")} style={{ marginLeft: 12 }}>
            Play Fruit Ninja
          </Button>
          <Button onClick={() => nav("/exercises/star-shooter")} style={{ marginLeft: 12 }}>
            Play Star Shooter
          </Button>
          <Button onClick={() => nav("/exercises/flappy-ball")} style={{ marginLeft: 12 }}>
            Play Flappy Ball
          </Button>
        </div>

        <div className="md:col-span-3 flex justify-end">
          <Button onClick={() => nav(`/exercises/${selected}/info`)}>Details</Button>
        </div>
      </section>
    </main>
  );
};

export default ExercisesPage;
