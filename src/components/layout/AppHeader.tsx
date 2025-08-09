import React from "react";
import { ArrowLeft, HelpCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  mode?: "home" | "page";
  title?: string;
  centerIcon?: React.ReactNode;
  onBack?: () => void;
  onExit?: () => void;
  onHelp?: () => void;
  accentVar?: string; // e.g., --accent-modules
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  mode = "page",
  title,
  centerIcon,
  onBack,
  onExit,
  onHelp,
  accentVar,
}) => {
  const accent = accentVar ? `hsl(var(${accentVar}))` : undefined;
  return (
    <header className="h-16 flex items-center justify-between px-4" style={accent ? { borderColor: accent } : undefined}>
      <div className="w-16 flex items-center justify-start">
        {mode === "home" ? (
          <button aria-label="Exit" onClick={onExit} className="p-2 rounded-full hover-scale" title="Exit">
            <LogOut size={28} />
          </button>
        ) : (
          <button aria-label="Back" onClick={onBack} className="p-2 rounded-full hover-scale" title="Back">
            <ArrowLeft size={28} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 text-2xl font-bold">
        {centerIcon}
        {title && <span>{title}</span>}
      </div>
      <div className="w-16 flex items-center justify-end">
        <button aria-label="Help" onClick={onHelp} className="p-2 rounded-full hover-scale" title="Help" style={accent ? { color: accent } : undefined}>
          <HelpCircle size={28} />
        </button>
      </div>
    </header>
  );
};
