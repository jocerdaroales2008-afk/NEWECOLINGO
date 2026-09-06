import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ColorBlindnessMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';

interface AccessibilityContextValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  highContrast: boolean;
  setHighContrast: (v: boolean) => void;
  colorBlindness: ColorBlindnessMode;
  setColorBlindness: (m: ColorBlindnessMode) => void;
  fontScale: number;
  setFontScale: (n: number) => void;
  speechRate: number;
  setSpeechRate: (n: number) => void;
  autoSpeak: boolean;
  setAutoSpeak: (v: boolean) => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

const STORAGE_KEY = 'ecolingo-accessibility';

interface StoredSettings {
  theme: ThemeMode;
  highContrast: boolean;
  colorBlindness: ColorBlindnessMode;
  fontScale: number;
  speechRate: number;
  autoSpeak: boolean;
}

const DEFAULT_SETTINGS: StoredSettings = {
  theme: 'light',
  highContrast: false,
  colorBlindness: 'normal',
  fontScale: 1,
  speechRate: 1,
  autoSpeak: false,
};

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoredSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  const [isDark, setIsDark] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const rateRef = useRef(settings.speechRate);

  useEffect(() => { rateRef.current = settings.speechRate; }, [settings.speechRate]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setIsDark(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.theme === 'dark' || (settings.theme === 'auto' && isDark));
    root.classList.toggle('high-contrast', settings.highContrast);
    root.style.setProperty('--font-scale', String(settings.fontScale));

    document.body.classList.remove('cb-protanopia', 'cb-deuteranopia', 'cb-tritanopia');
    if (settings.colorBlindness !== 'normal') {
      document.body.classList.add(`cb-${settings.colorBlindness}`);
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings, isDark]);

  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = rateRef.current;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  useEffect(() => {
    if (!settings.autoSpeak || typeof document === 'undefined') return;
    const readTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return;
      const element = target.closest('button, a, input, textarea, select, [role="button"], [role="switch"]') ?? target;
      const text = element.getAttribute('aria-label') || element.textContent || '';
      const value = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.value : '';
      const spokenText = `${text} ${value}`.replace(/\s+/g, ' ').trim().slice(0, 300);
      if (spokenText) speak(spokenText);
    };
    const onClick = (event: MouseEvent) => readTarget(event.target);
    const onSelection = () => {
      const selection = window.getSelection()?.toString().replace(/\s+/g, ' ').trim();
      if (selection) speak(selection.slice(0, 300));
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('selectionchange', onSelection);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('selectionchange', onSelection);
    };
  }, [settings.autoSpeak, speak]);

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  const update = <K extends keyof StoredSettings>(key: K, value: StoredSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <AccessibilityContext.Provider
      value={{
        theme: settings.theme,
        setTheme: (t) => update('theme', t),
        highContrast: settings.highContrast,
        setHighContrast: (v) => update('highContrast', v),
        colorBlindness: settings.colorBlindness,
        setColorBlindness: (m) => update('colorBlindness', m),
        fontScale: settings.fontScale,
        setFontScale: (n) => update('fontScale', n),
        speechRate: settings.speechRate,
        setSpeechRate: (n) => update('speechRate', n),
        autoSpeak: settings.autoSpeak,
        setAutoSpeak: (v) => update('autoSpeak', v),
        speak,
        stopSpeaking,
        isSpeaking,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const ctx = useContext(AccessibilityContext);
  if (!ctx) throw new Error('useAccessibility must be used within AccessibilityProvider');
  return ctx;
}
