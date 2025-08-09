import { useEffect, useRef, useState } from "react";

export type TTSOptions = {
  rate?: number; // 0.1 - 10
  pitch?: number; // 0 - 2
  volume?: number; // 0 - 1
  lang?: string; // e.g., 'en-US'
};

export function useTTS(enabledDefault = true, defaultOptions: TTSOptions = { rate: 0.95, pitch: 1, volume: 1, lang: 'en-US' }) {
  const [enabled, setEnabled] = useState(enabledDefault);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const optionsRef = useRef<TTSOptions>(defaultOptions);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (!voice && v.length > 0) {
        // Prefer a female US English voice if available
        const preferred = v.find((x) => /en-US/i.test(x.lang) && /female|samantha|aria|jenny/i.test(x.name)) || v.find((x) => /en/i.test(x.lang));
        setVoice(preferred || v[0]);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voice]);

  const speak = (text: string, opts?: TTSOptions) => {
    if (!enabled || !('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const o = { ...optionsRef.current, ...(opts || {}) };
    utter.rate = o.rate ?? 1;
    utter.pitch = o.pitch ?? 1;
    utter.volume = o.volume ?? 1;
    utter.lang = o.lang ?? 'en-US';
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  };

  const stop = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  };

  const setOptions = (opts: Partial<TTSOptions>) => {
    optionsRef.current = { ...optionsRef.current, ...opts };
  };

  return { enabled, setEnabled, speak, stop, voices, voice, setVoice, setOptions };
}
