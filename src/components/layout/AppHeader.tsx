import React, { useEffect, useState } from "react";
import { ArrowLeft, HelpCircle, LogOut } from "lucide-react";
import { Slider } from "@/components/ui/slider";
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

  // Global volume slider state synced via localStorage + custom event
  const [volume, setVolume] = useState<number>(() => {
    const v = Number(localStorage.getItem("globalVolume"));
    return isNaN(v) ? 0.5 : v;
  });
  // TTS toggle synced via localStorage + custom event
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("ttsEnabled");
    return v === null ? true : v !== "false";
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "globalVolume" && e.newValue != null) {
        const n = Number(e.newValue);
        if (!isNaN(n)) setVolume(n);
      }
      if (e.key === "ttsEnabled" && e.newValue != null) {
        setTtsEnabled(e.newValue !== "false");
      }
    };
    const onCustom = (e: any) => {
      const n = Number(e.detail?.volume);
      if (!isNaN(n)) setVolume(n);
      if (typeof e.detail?.ttsEnabled === "boolean") setTtsEnabled(e.detail.ttsEnabled);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("global-volume-changed", onCustom as any);
    window.addEventListener("tts-enabled-changed", onCustom as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("global-volume-changed", onCustom as any);
      window.removeEventListener("tts-enabled-changed", onCustom as any);
    };
  }, []);
  const updateVolume = (val: number) => {
    setVolume(val);
    localStorage.setItem("globalVolume", String(val));
    window.dispatchEvent(new CustomEvent("global-volume-changed", { detail: { volume: val } }));
  };
  const updateTtsEnabled = (val: boolean) => {
    setTtsEnabled(val);
    localStorage.setItem("ttsEnabled", String(val));
    window.dispatchEvent(new CustomEvent("tts-enabled-changed", { detail: { ttsEnabled: val } }));
  };

  return (
    <header className="h-16 flex items-center justify-between px-4" style={accent ? { borderColor: accent } : undefined}>
      <div className="w-64 flex items-center justify-start">
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
      <div className="flex-1 flex items-center justify-center gap-2 text-2xl font-bold">
        {centerIcon}
        {title && <span>{title}</span>}
      </div>
      <div className="w-64 flex items-center justify-end gap-3">
        <div className="hidden sm:flex items-center gap-2 w-40">
          <span className="text-xs text-muted-foreground">Vol</span>
          <Slider
            value={[volume]}
            onValueChange={(v) => updateVolume(v[0] ?? 0)}
            min={0}
            max={1}
            step={0.01}
            aria-label="Global volume"
          />
        </div>
        <button aria-label="Help" onClick={onHelp} className="p-2 rounded-full hover-scale flex items-center gap-1" title="Help" style={accent ? { color: accent } : undefined}>
          <HelpCircle size={22} />
          <span className="text-sm font-medium">Help</span>
        </button>
      </div>
    </header>
  );
};
