import React, { useEffect, useState } from "react";
import { ArrowLeft, HelpCircle, LogOut, Volume2, VolumeX } from "lucide-react";
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

  // TTS toggle synced via localStorage + custom event
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    const v = localStorage.getItem("ttsEnabled");
    return v === null ? true : v !== "false";
  });
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "ttsEnabled" && e.newValue != null) setTtsEnabled(e.newValue !== "false");
    };
    const onCustom = (e: any) => setTtsEnabled(Boolean(e.detail?.enabled));
    window.addEventListener("storage", onStorage);
    window.addEventListener("tts-enabled-changed", onCustom as any);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tts-enabled-changed", onCustom as any);
    };
  }, []);
  const toggleTTS = () => {
    const next = !ttsEnabled;
    setTtsEnabled(next);
    localStorage.setItem("ttsEnabled", String(next));
    window.dispatchEvent(new CustomEvent("tts-enabled-changed", { detail: { enabled: next } }));
  };

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
      <div className="w-28 flex items-center justify-end gap-2">
        <button aria-label={ttsEnabled ? "Mute voice" : "Unmute voice"} onClick={toggleTTS} className="p-2 rounded-full hover-scale" title={ttsEnabled ? "Mute voice" : "Unmute voice"} style={accent ? { color: accent } : undefined}>
          {ttsEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </button>
        <button aria-label="Help" onClick={onHelp} className="p-2 rounded-full hover-scale" title="Help" style={accent ? { color: accent } : undefined}>
          <HelpCircle size={28} />
        </button>
      </div>
    </header>
  );
};
