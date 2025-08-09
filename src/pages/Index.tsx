// src/pages/Index.tsx

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTTS } from "@/components/tts/useTTS";
import { SelectableCard } from "@/components/common/SelectableCard";
import { BookOpen, Dumbbell, LineChart } from "lucide-react";
import "./index-landing.css";

const HELP_SEQUENCE = [
  { kind: "mod", label: "Modules", desc: "Modules: Daily activities like feeding, writing, and brushing your teeth." },
  { kind: "ex", label: "Exercises", desc: "Exercises: Practice individual hand and wrist movements." },
  { kind: "prog", label: "Progress", desc: "Progress: See your achievements and improvements over time." },
];

export default function Index() {
  const [showGreeting, setShowGreeting] = useState(false);
  const [helpStep, setHelpStep] = useState<number | null>(null);
  const userName = "Justin"; // TODO: wire to real user state
  const nav = useNavigate();
  const { speak, stop } = useTTS(true);

  // On mount, play help sequence
  useEffect(() => {
    setShowGreeting(false);
    let mounted = true;
    const runHelp = async () => {
      for (let i = 0; i < HELP_SEQUENCE.length; ++i) {
        if (!mounted) return;
        setHelpStep(i);
        stop();
        speak(HELP_SEQUENCE[i].desc);
        await new Promise((res) => setTimeout(res, 2200));
      }
      setHelpStep(null);
      setShowGreeting(true);
    };
    runHelp();
    return () => { mounted = false; stop(); };
    // eslint-disable-next-line
  }, []);

  return (
    <main id="landing-root">
      {/* Header */}
      <header className="header">
        <button
          className="header-btn"
          aria-label="Exit"
          onClick={() => console.log("Exit")}
        >
          <span className="material-icons" style={{ fontSize: 40 }}>
            logout
          </span>
        </button>
        <button
          className="header-btn"
          aria-label="Help"
          onClick={() => {
            setHelpStep(0);
            setShowGreeting(false);
          }}
        >
          <span className="material-icons" style={{ fontSize: 40 }}>
            help_outline
          </span>
        </button>
      </header>

      {/* Greeting */}
      <h1 className={`main-greeting ${showGreeting ? "show" : ""}`}>
        Hello, <span className="user-name">{userName}</span>{" "}
        <span role="img" aria-label="smile">
          😊
        </span>
      </h1>

      {/* Cards */}
      <section className="main-row">
        <SelectableCard
          Icon={BookOpen}
          label="Modules"
          colorVar="--accent-modules"
          primed={helpStep === 0}
          onClick={() => nav("/modules")}
        />
        <SelectableCard
          Icon={Dumbbell}
          label="Exercises"
          colorVar="--accent-exercises"
          primed={helpStep === 1}
          onClick={() => nav("/exercises")}
        />
        <SelectableCard
          Icon={LineChart}
          label="Progress"
          colorVar="--accent-progress"
          primed={helpStep === 2}
          onClick={() => nav("/progress")}
        />
      </section>
      {/* Help description text */}
      {helpStep !== null && (
        <div style={{ position: "absolute", top: 80, left: 0, right: 0, textAlign: "center", fontSize: 24, fontWeight: 600, color: "#222", zIndex: 10 }}>
          {HELP_SEQUENCE[helpStep].desc}
        </div>
      )}
      <style>{`
        .main-card.highlight {
          box-shadow: 0 0 32px 8px #fffbe6, 0 0 0 8px #ffe066;
          transform: scale(1.08);
          z-index: 40;
        }
      `}</style>
    </main>
  );
}
