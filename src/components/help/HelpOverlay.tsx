import React from "react";

interface HelpOverlayProps {
  active: boolean;
  step: number; // 0,1,2
  titles: string[];
  descriptions: string[];
  onAdvance: () => void;
  colorVars: string[]; // css var names for each card
}

export const HelpOverlay: React.FC<HelpOverlayProps> = ({ active, step, titles, descriptions, onAdvance, colorVars }) => {
  if (!active) return null;
  const color = `hsl(var(${colorVars[step]}))`;
  return (
    <div className="fixed inset-0 z-40" onClick={onAdvance}>
      <div className="absolute inset-0 bg-black/80" />
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 text-center max-w-xl px-4">
        <div className="text-2xl md:text-3xl font-bold mb-2" style={{ color }}>{titles[step]}</div>
        <div className="text-lg md:text-xl text-white/90">{descriptions[step]}</div>
        <div className="mt-4 text-white/70">Tap anywhere to continue</div>
      </div>
    </div>
  );
};
