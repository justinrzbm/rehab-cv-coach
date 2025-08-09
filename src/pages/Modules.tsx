import React, { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { SelectableCard } from "@/components/common/SelectableCard";
import { useNavigate } from "react-router-dom";
import { BookOpen, UtensilsCrossed, Pencil, Brush } from "lucide-react";
import { useTTS } from "@/components/tts/useTTS";
import { useSEO } from "@/hooks/useSEO";

const ModulesPage: React.FC = () => {
  useSEO("Rehab Coach – Modules", "Select a daily activity module like Feeding or Writing.");
  const nav = useNavigate();
  const { speak } = useTTS(true);
  const [primed, setPrimed] = useState<"feeding" | "writing" | "brushing" | null>(null);

  const onCardClick = (key: "feeding" | "writing" | "brushing") => {
    if (primed === key) {
      nav(`/modules/${key}/info`);
    } else {
      setPrimed(key);
      speak(key.charAt(0).toUpperCase() + key.slice(1));
    }
  };

  return (
    <main className="min-h-screen" style={{ background: "hsl(var(--accent-modules) / 0.06)" }}>
      <AppHeader
        mode="page"
        title="Modules"
        centerIcon={<BookOpen />}
        onBack={() => nav("/")}
        onHelp={() => {}}
        accentVar="--accent-modules"
      />

      <section className="container mx-auto pt-6">
        <div className="flex items-center justify-center gap-6 md:gap-10">
          <SelectableCard Icon={UtensilsCrossed} label="Feeding" colorVar="--accent-modules" primed={primed === "feeding"} onClick={() => onCardClick("feeding")} />
          <SelectableCard Icon={Pencil} label="Writing" colorVar="--accent-modules" primed={primed === "writing"} onClick={() => onCardClick("writing")} />
          <SelectableCard Icon={Brush} label="Teeth" colorVar="--accent-modules" primed={primed === "brushing"} onClick={() => onCardClick("brushing")} />
        </div>
        {primed && (
          <div className="fixed inset-0 z-30" onClick={() => setPrimed(null)}>
            <div className="absolute inset-0 bg-black/85" />
          </div>
        )}
      </section>
    </main>
  );
};

export default ModulesPage;
