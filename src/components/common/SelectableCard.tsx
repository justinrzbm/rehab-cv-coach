import React from "react";
import { cn } from "@/lib/utils";

interface SelectableCardProps {
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  colorVar: string; // e.g. --accent-modules
  primed?: boolean; // first click selected
  selected?: boolean; // finalized
  onClick?: () => void;
  large?: boolean;
}

export const SelectableCard: React.FC<SelectableCardProps> = ({ Icon, label, colorVar, primed, selected, onClick, large }) => {
  const color = `hsl(var(${colorVar}))`;
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-2xl p-6 md:p-8 min-w-[160px] md:min-w-[220px] aspect-square flex flex-col items-center justify-center gap-4 transition-all duration-200",
        "hover:shadow-xl hover-scale",
        primed ? "scale-105" : "",
        selected ? "scale-110" : ""
      )}
      style={{
        backgroundColor: primed || selected ? "rgba(0,0,0,0.15)" : "hsl(var(--card))",
        border: `4px solid ${color}`,
        boxShadow: primed || selected ? `0 0 0 12px hsl(var(--glow-yellow) / 0.35)` : undefined,
      }}
    >
      <Icon size={large ? 80 : 64} className="" />
      <div className="text-xl md:text-2xl font-semibold" style={{ color }}>{label}</div>
    </button>
  );
};
