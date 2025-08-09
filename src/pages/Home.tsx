import React, { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SelectableCard } from "@/components/common/SelectableCard";
import { HelpOverlay } from "@/components/help/HelpOverlay";
import { BookOpen, Dumbbell, LineChart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";

const Hello = () => {
  return (
    <h1 className="text-4xl md:text-6xl font-extrabold text-center animate-fade-in">
      Hello, <span className="text-primary">Friend</span> 🙂
    </h1>
  );
};

const Home: React.FC = () => {
  useSEO("Rehab Coach – Home", "Senior-friendly rehabilitation with modules, exercises, and progress.");
  const nav = useNavigate();
  const { speak } = useTTS(true);

  const [primed, setPrimed] = useState<"modules" | "exercises" | "progress" | null>(null);
  const [help, setHelp] = useState(false);
  const [helpStep, setHelpStep] = useState(0);

  useEffect(() => {
    if (help) {
      const msgs = [
        "Modules: Step-by-step daily activities like feeding and brushing.",
        "Exercises: Focused single movements to practice and improve.",
        "Progress: See your improvements and celebrate wins!",
      ];
      speak(msgs[helpStep]);
    }
  }, [help, helpStep, speak]);

  const onCardClick = (key: "modules" | "exercises" | "progress") => {
    if (help) return; // ignore interactions during help
    if (primed === key) {
      if (key === "modules") nav("/modules");
      if (key === "exercises") nav("/exercises");
      if (key === "progress") nav("/progress");
    } else {
      setPrimed(key);
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      speak(label);
    }
  };

  const clearPrimed = () => setPrimed(null);

  return (
    <main className="min-h-screen relative">
      <AppHeader mode="home" onExit={() => nav("/" /* could route to landing */)} onHelp={() => { setHelp(true); setHelpStep(0); }} />

      <section className="container mx-auto pt-6 md:pt-10">
        <Hello />

        <div className="mt-10 flex items-center justify-center gap-4 md:gap-10">
          <SelectableCard Icon={BookOpen} label="Modules" colorVar="--accent-modules" primed={primed === "modules"} onClick={() => onCardClick("modules")} large />
          <SelectableCard Icon={Dumbbell} label="Exercises" colorVar="--accent-exercises" primed={primed === "exercises"} onClick={() => onCardClick("exercises")} large />
          <SelectableCard Icon={LineChart} label="Progress" colorVar="--accent-progress" primed={primed === "progress"} onClick={() => onCardClick("progress")} large />
        </div>

        {primed && !help && (
          <div className="fixed inset-0 z-30" onClick={clearPrimed}>
            <div className="absolute inset-0 bg-black/85" style={{ backgroundColor: "rgba(0,0,0,0.85)" }} />
          </div>
        )}

        <HelpOverlay
          active={help}
          step={helpStep}
          titles={["Modules", "Exercises", "Progress"]}
          descriptions={[
            "Learn everyday tasks in simple steps.",
            "Practice single movements with guidance.",
            "See your progress and achievements.",
          ]}
          onAdvance={() => {
            if (helpStep >= 2) setHelp(false);
            else setHelpStep((s) => s + 1);
          }}
          colorVars={["--accent-modules", "--accent-exercises", "--accent-progress"]}
        />
      </section>
    </main>
  );
};

export default Home;
