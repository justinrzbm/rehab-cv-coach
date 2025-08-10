// src/pages/Index.tsx

// Ensure TTS and volume are ON by default before any React code runs
if (typeof window !== 'undefined') {
  if (localStorage.getItem('ttsEnabled') === null) {
    localStorage.setItem('ttsEnabled', 'true');
  }
  if (localStorage.getItem('globalVolume') === null) {
    localStorage.setItem('globalVolume', '0.5');
  }
}

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTTS } from "@/components/tts/useTTS";
import { SelectableCard } from "@/components/common/SelectableCard";
import { AppHeader } from "@/components/layout/AppHeader";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { BookOpen, Dumbbell, LineChart } from "lucide-react";
import "./index-landing.css";


const HELP_SEQUENCE = [
  { kind: "mod", label: "Modules", desc: "Modules: Daily activities like feeding, writing, and brushing your teeth." },
    { kind: "ex", label: "Training Games", desc: "Training Games: Practice individual hand and wrist movements." },
  { kind: "prog", label: "Progress", desc: "Progress: See your achievements and improvements over time." },
];

export default function Index() {
  const [showGreeting, setShowGreeting] = useState(false);
  const [helpStep, setHelpStep] = useState<number | null>(null);
  const userName = "Justin"; // TODO: wire to real user state
  const nav = useNavigate();
  const { speak, stop } = useTTS(true);

// On mount, and helper to replay, play help sequence
  const runHelp = async () => {
    setShowGreeting(false);
    let mounted = true;
    for (let i = 0; i < HELP_SEQUENCE.length; ++i) {
      if (!mounted) return;
      setHelpStep(i);
      stop();
      speak(HELP_SEQUENCE[i].desc);
      await new Promise((res) => setTimeout(res, 5000));
    }
    setHelpStep(null);
    setShowGreeting(true);
    return () => { mounted = false; stop(); };
  };

  useEffect(() => {
    runHelp();
    // eslint-disable-next-line
  }, []);

  // Suggested activity toast after 15s
  useEffect(() => {
    if (window.location.pathname !== "/" && window.location.pathname !== "/index" && window.location.pathname !== "/index.html") return;
    const t = setTimeout(() => {
      const message = "Suggested: would you like to try the Feeding activity? Tap here, or say \"Yes\" to begin this activity";
      toast({
        title: "Suggested: try the Feeding activity",
        description: "Tap here, or say \"Yes\" to begin this activity",
        onClick: () => nav("/modules/feeding/info"),
        action: <ToastAction altText="Begin" onClick={() => nav("/modules/feeding/info")}>Start</ToastAction>,
        duration: 15000, // Show toast for 15 seconds
        className: "big-toast",
      });
      // speak(message);
    }, 15000);
    return () => clearTimeout(t);
  }, [nav, speak]);


  return (
    <main id="landing-root" className="min-h-screen" style={{ background: "hsl(var(--muted) / 0.08)" }}>
      {/* Header */}
      <div className="util-bar">

      <AppHeader
        mode="home"
        title="Handelit Home"
        onExit={() => console.log("Exit")}
        onHelp={() => { runHelp(); }}
      />

      </div>


      {/* Greeting */}
      <h1 className={`main-greeting ${showGreeting ? "show" : ""}`}>
        Hello, <span className="user-name">{userName}</span>{" "}
        <span role="img" aria-label="smile">
          😊
        </span>
      </h1>

      {/* Cards */}
      <section className="main-row takeover">
        <div className="takeover-item">
          <SelectableCard
          Icon={BookOpen}
          label="Rehab Activities"
          colorVar="--accent-modules"
          primed={helpStep === 0}
          onClick={() => nav("/modules")}
          large/>
        </div>
        <div className="takeover-item">
          <SelectableCard
          Icon={Dumbbell}
          label="Training Games"
          colorVar="--accent-exercises"
          primed={helpStep === 1}
          onClick={() => nav("/exercises")}
          large/>
        </div>
        <div className="takeover-item">
          <SelectableCard
          Icon={LineChart}
          label="Progress"
          colorVar="--accent-progress"
          primed={helpStep === 2}
          onClick={() => nav("/progress")}
          large/>
        </div>
      </section>
      {/* Help description text */}
      {helpStep !== null && (
        <div style={{ position: "absolute", top: 88, left: 0, right: 0, textAlign: "center", fontSize: 24, fontWeight: 600, color: "#222", zIndex: 10 }}>
          {HELP_SEQUENCE[helpStep].desc}
        </div>
      )}
      <style>{`
        .main-card.highlight {
          box-shadow: 0 0 32px 8px #fffbe6, 0 0 0 8px #ffe066;
          transform: scale(1.08);
          z-index: 40;
        }
        .big-toast {
          min-width: 420px;
          max-width: 600px;
          padding: 2.5em 2em;
          font-size: 1.25rem;
          border-radius: 1.25em;
          box-shadow: 0 8px 32px 0 rgba(0,0,0,0.18);
        }
        .big-toast .toast-title {
          font-size: 2rem;
          font-weight: 700;
        }
        .big-toast .toast-description {
          font-size: 1.25rem;
          font-weight: 500;
        }
        .big-toast button {
          font-size: 1.1rem;
          padding: 0.5em 1.5em;
        }
      `}</style>
    </main>
  );
}
