import { useEffect, useRef, useState } from "react";

export type TTSOptions = {
  rate?: number; // 0.1 - 10
  pitch?: number; // 0 - 2
  volume?: number; // 0 - 1
  lang?: string; // e.g., 'en-US'
};

export function useTTS(enabledDefault = true, defaultOptions: TTSOptions = { rate: 0.95, pitch: 1, volume: 1, lang: 'en-US' }) {
  const [enabledState, setEnabledState] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('ttsEnabled');
      return v === null ? enabledDefault : v !== 'false';
    } catch {
      return enabledDefault;
    }
  });
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

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'ttsEnabled' && e.newValue != null) setEnabledState(e.newValue !== 'false');
    };
    const onCustom = (e: any) => setEnabledState(Boolean(e.detail?.enabled));
    window.addEventListener('storage', onStorage);
    window.addEventListener('tts-enabled-changed', onCustom as any);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('tts-enabled-changed', onCustom as any);
    };
  }, []);

  const setEnabled = (val: boolean) => {
    setEnabledState(val);
    try {
      localStorage.setItem('ttsEnabled', String(val));
      window.dispatchEvent(new CustomEvent('tts-enabled-changed', { detail: { enabled: val } }));
    } catch {}
  };

  const speak = (text: string, opts?: TTSOptions) => {
    if (!enabledState || !('speechSynthesis' in window) || !text) return;
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

  return { enabled: enabledState, setEnabled, speak, stop, voices, voice, setVoice, setOptions };
}
