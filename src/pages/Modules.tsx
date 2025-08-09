import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SelectableCard } from "@/components/common/SelectableCard";
import { useNavigate } from "react-router-dom";
import { BookOpen, UtensilsCrossed, Pencil, Brush } from "lucide-react";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";


const MODULES = [
  { key: "feeding", label: "Feeding", Icon: UtensilsCrossed, desc: "Feeding: Practice bringing food or drink to your mouth." },
  { key: "writing", label: "Writing", Icon: Pencil, desc: "Writing: Practice holding and using a pen or pencil." },
  { key: "brushing", label: "Teeth", Icon: Brush, desc: "Teeth: Practice brushing your teeth." },
];

const ModulesPage: React.FC = () => {
  useSEO("Rehab Coach – Modules", "Select a daily activity module like Feeding or Writing.");
  const nav = useNavigate();
  const { speak, stop } = useTTS(true);
  const [helpStep, setHelpStep] = useState<number | null>(null);

  const runHelp = async () => {
    for (let i = 0; i < MODULES.length; ++i) {
      setHelpStep(i);
      stop();
      speak(MODULES[i].desc);
      await new Promise((res) => setTimeout(res, 2200));
    }
    setHelpStep(null);
  };

  useEffect(() => {
    runHelp();
    // eslint-disable-next-line
  }, []);
  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader
        mode="page"
        title="Modules"
        centerIcon={<BookOpen />}
        onBack={() => nav("/")}
        onHelp={runHelp}
        accentVar="--accent-modules"
      />

      <section className="container mx-auto pt-6">
        {/* Help description text */}
        {helpStep !== null && (
          <div style={{ minHeight: 48, marginBottom: 32, textAlign: "center", fontSize: 24, fontWeight: 600, color: "#222", zIndex: 10 }}>
            {MODULES[helpStep].desc}
          </div>
        )}
        {/* Add spacing even when not showing help */}
        {helpStep === null && <div style={{ minHeight: 48, marginBottom: 32 }} />}
        <div className="flex items-center justify-center gap-6 md:gap-10">
          {MODULES.map((mod, i) => (
            <SelectableCard
              key={mod.key}
              Icon={mod.Icon}
              label={mod.label}
              colorVar="--accent-modules"
              primed={helpStep === i}
              onClick={() => nav(`/modules/${mod.key}/info`)}
            />
          ))}
        </div>
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

export default ModulesPage;
