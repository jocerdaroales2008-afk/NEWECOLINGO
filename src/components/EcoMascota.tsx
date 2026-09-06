import { useState, useEffect, useRef, useCallback } from 'react';
import { BookOpen, Camera, Map, Mic, Recycle, Search, Trophy, Volume2, X, Zap } from 'lucide-react';

import { classifyMaterial, createCategoryItem } from '@/data/recyclingData';
import { useAccessibility } from '@/context/AccessibilityContext';
import { useRecyclingLog } from '@/hooks/useRecyclingLog';
import { useSpeech } from '@/hooks/useSpeech';
import { MATERIAL_CONTAINERS, MATERIAL_LABELS, type MaterialCategory, type RecyclingItem } from '@/types';

type MascotMode = 'idle' | 'chat' | 'search' | 'result';
type MascotTab = 'home' | 'map' | 'guide' | 'achievements' | 'scanner' | 'accessibility';

interface EcoMascotaProps {
  onNavigate: (tab: MascotTab) => void;
  detectedItem?: RecyclingItem | null;
  detectionId?: number;
}

export function EcoMascota({ onNavigate, detectedItem, detectionId = 0 }: EcoMascotaProps) {
  const { speak, stopSpeaking } = useAccessibility();
  const { startListening, stopListening, isListening, transcript, recognitionStatus, recognitionError, recognitionSupported } = useSpeech();
  const { stats } = useRecyclingLog();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<MascotMode>('idle');
  const [query, setQuery] = useState('');
  const [foundItem, setFoundItem] = useState<RecyclingItem | null>(null);
  const [bubbleText, setBubbleText] = useState('');
  const [pendingCategories, setPendingCategories] = useState<MaterialCategory[]>([]);
  const [showHint, setShowHint] = useState(false);
  const greetedRef = useRef(false);

  useEffect(() => {
    if (open || greetedRef.current) return;
    const showTimer = window.setTimeout(() => setShowHint(true), 5000);
    const hideTimer = window.setTimeout(() => setShowHint(false), 10000);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [open]);


  useEffect(() => {
    if (!detectedItem) return;

    setFoundItem(detectedItem);
    setPendingCategories([]);
    setOpen(true);
    setMode('result');
    setBubbleText(`Detecté ${detectedItem.name}. Te explico cómo prepararlo.`);

    const message = `Detecté ${detectedItem.name}. Categoría: ${MATERIAL_LABELS[detectedItem.category]}. ${MATERIAL_CONTAINERS[detectedItem.category]}. ${detectedItem.steps.join(' ')} ${detectedItem.upcycling ?? detectedItem.tip}`;
    speak(message);
  }, [detectedItem, detectionId, speak]);

  const searchItem = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;

      const classification = classifyMaterial(trimmed);
      if (!classification.item || classification.status !== 'confident') {
        const categories = [...new Set([
          ...(classification.item ? [classification.item.category] : []),
          ...classification.alternatives.map((entry) => entry.category),
        ])].slice(0, 3);
        setFoundItem(null);
        setPendingCategories(categories);
        setMode('chat');
        const message = classification.reason || 'No pude identificar el material con suficiente seguridad. Confirma la categoría.';
        setBubbleText(message);
        speak(message);
        return;
      }

      const found = classification.item;
      setPendingCategories([]);
      setFoundItem(found);
      setMode('result');
      setBubbleText(`Identifiqué ${found.name}. Te explico cómo reciclarlo.`);

      const message = `Identifiqué ${found.name}. Categoría: ${MATERIAL_LABELS[found.category]}. ${MATERIAL_CONTAINERS[found.category]}. ${found.steps.join(' ')} ${found.upcycling ?? found.tip}`;
      speak(message);
    },
    [speak]
  );

  useEffect(() => {
    if (transcript && transcript.trim()) {
      setQuery(transcript);
      searchItem(transcript);
    }
  }, [searchItem, transcript]);

  useEffect(() => {
    if (mode !== 'search' || isListening) return;
    if (recognitionStatus === 'no-match' || recognitionStatus === 'error') {
      setMode('chat');
      setBubbleText(recognitionError || 'No pude escuchar un residuo. Inténtalo otra vez o escríbelo.');
    }
  }, [isListening, mode, recognitionError, recognitionStatus]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setMode('idle');
    setFoundItem(null);
    setPendingCategories([]);
    setQuery('');
    stopSpeaking();
    stopListening();
  }, [stopListening, stopSpeaking]);

  const handleOpen = useCallback(() => {
    if (!open) {
      setOpen(true);
      greetedRef.current = true;
      setShowHint(false);
      setMode('chat');
      setPendingCategories([]);
      setBubbleText('¡Hola! Soy EcoVerde, tu asistente de reciclaje. ¿Qué necesitas?');
      speak('¡Hola! Soy EcoVerde, tu asistente de reciclaje. ¿Qué quieres reciclar hoy?');
      return;
    }

    handleClose();
  }, [handleClose, open, speak]);

  const handleDictate = useCallback(() => {
    stopSpeaking();
    if (!recognitionSupported) {
      setBubbleText('El reconocimiento de voz no está disponible en este navegador. Puedes escribir el residuo.');
      setMode('chat');
      return;
    }
    setMode('search');
    startListening();
  }, [recognitionSupported, startListening, stopSpeaking]);

  const handleSearch = useCallback(() => {
    if (query.trim()) {
      searchItem(query);
    }
  }, [query, searchItem]);

  const confirmCategory = useCallback((category: MaterialCategory) => {
    const item = createCategoryItem(category, query.trim() || MATERIAL_LABELS[category]);
    setPendingCategories([]);
    setFoundItem(item);
    setMode('result');
    setBubbleText(`Perfecto. Lo trataré como ${MATERIAL_LABELS[category]}.`);
    speak(`Categoría confirmada: ${MATERIAL_LABELS[category]}. ${MATERIAL_CONTAINERS[category]}. ${item.steps.join(' ')}`);
  }, [query, speak]);

  const handleNavigate = useCallback(
    (tab: MascotTab) => {
      handleClose();
      onNavigate(tab);
    },
    [handleClose, onNavigate]
  );

  const speakSteps = useCallback(() => {
    if (!foundItem) return;
    speak(`Paso 1: ${foundItem.steps[0]} Paso 2: ${foundItem.steps[1]} Paso 3: ${foundItem.steps[2]}`);
  }, [foundItem, speak]);

  const quickActions = [
    { icon: Map, label: 'Mapa', tab: 'map' as const, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    { icon: BookOpen, label: 'Guía', tab: 'guide' as const, color: 'bg-forest-100 text-forest-700 dark:bg-forest-900 dark:text-forest-300' },
    { icon: Camera, label: 'Escáner', tab: 'scanner' as const, color: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
    { icon: Trophy, label: 'Logros', tab: 'achievements' as const, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
    { icon: Zap, label: 'Ajustes', tab: 'accessibility' as const, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300' },
  ];

  return (
    <>
      {showHint && !open && (
        <div className="fixed bottom-28 right-24 z-50 animate-slide-up rounded-2xl bg-forest-700 px-4 py-3 text-sm font-semibold text-white shadow-xl lg:bottom-12">
          <div className="absolute -right-1 bottom-4 h-3 w-3 rotate-45 bg-forest-700" />
          ¡Toca aquí y te ayudo a reciclar!
        </div>
      )}

      <button
        onClick={handleOpen}
        className="fixed bottom-24 right-5 z-50 flex items-center justify-center rounded-full bg-gradient-to-br from-forest-500 via-forest-600 to-mint-600 text-white shadow-2xl transition hover:scale-110 active:scale-95 lg:bottom-8"
        style={{ height: '72px', width: '72px' }}
        aria-label="EcoVerde - Asistente virtual de reciclaje"
      >
        {!open && (
          <>
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-forest-400/40" />
            <span className="absolute inset-0 animate-pulse rounded-full bg-forest-400/20" style={{ animationDelay: '0.5s' }} />
          </>
        )}
        <span className="relative text-3xl">{open ? '😊' : '🌱'}</span>
      </button>

      {open && (
        <div className="fixed bottom-44 right-5 z-50 w-80 max-w-[calc(100vw-2.5rem)] animate-slide-up overflow-hidden rounded-3xl border border-[var(--eco-border)] bg-[var(--eco-card)] shadow-2xl lg:bottom-28">
          <div className="relative bg-gradient-to-br from-forest-700 to-mint-700 p-5 text-white">
            <button
              onClick={handleClose}
              className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 transition hover:bg-white/30"
              aria-label="Cerrar asistente"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/20 text-3xl">
                <span className="absolute inset-0 animate-ping rounded-full bg-white/20" style={{ animationDuration: '2s' }} />
                <span className="relative">🌱</span>
              </div>
              <div>
                <p className="text-lg font-extrabold">EcoVerde</p>
                <p className="text-xs text-forest-100">Tu asistente de reciclaje</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs">
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
                    <Zap size={11} /> {stats.points} pts
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
                    <Recycle size={11} /> {stats.total} reciclados
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-5">
            {mode === 'chat' && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-lg dark:bg-forest-900">🌱</span>
                  <div className="rounded-2xl rounded-tl-sm bg-[var(--eco-surface)] p-3 text-sm leading-relaxed text-[var(--eco-text)]">
                    {bubbleText}
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-3.5 text-[var(--eco-text-muted)]" size={18} />
                  <input
                    className="eco-input pl-10"
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setPendingCategories([]); }}
                    onKeyDown={(event) => event.key === 'Enter' && handleSearch()}
                    placeholder="Escribe tu residuo..."
                    aria-label="Buscar residuo"
                  />
                </div>

                {pendingCategories.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                    <p className="mb-2 text-xs font-bold text-amber-900 dark:text-amber-100">¿A qué material te refieres?</p>
                    <div className="flex flex-wrap gap-2">
                      {pendingCategories.map((category) => (
                        <button key={category} type="button" onClick={() => confirmCategory(category)} className="min-h-11 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                          {MATERIAL_LABELS[category]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button onClick={handleDictate} disabled={isListening} className={`eco-btn w-full ${isListening ? 'bg-red-600' : ''}`}>
                  <Mic size={16} /> {isListening ? 'Escuchando...' : 'Hablar'}
                </button>

                <div className="flex gap-1.5">
                  {quickActions.map(({ icon: Icon, label, tab, color }) => (
                    <button
                      key={tab}
                      onClick={() => handleNavigate(tab)}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${color}`}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mode === 'search' && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
                  <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />
                  <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white">
                    <Mic size={28} />
                  </span>
                </div>
                <p className="font-bold text-[var(--eco-text)]">Escuchando...</p>
                <p className="text-sm text-[var(--eco-text-muted)]">Di el nombre de tu residuo</p>
                <button
                  onClick={() => {
                    stopListening();
                    setMode('chat');
                  }}
                  className="eco-btn-outline mt-4"
                >
                  Cancelar
                </button>
              </div>
            )}

            {mode === 'result' && foundItem && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest-100 text-lg dark:bg-forest-900">✨</span>
                  <div className="rounded-2xl rounded-tl-sm bg-[var(--eco-surface)] p-3 text-sm leading-relaxed text-[var(--eco-text)]">
                    {bubbleText}
                  </div>
                </div>

                <div className="rounded-xl bg-[var(--eco-surface)] p-4">
                  <p className="mb-2 text-xs font-bold text-forest-600 dark:text-forest-400">{MATERIAL_LABELS[foundItem.category]}</p>
                  <h3 className="mb-3 text-lg font-extrabold">{foundItem.name}</h3>

                  <div className="mb-4 space-y-2">
                    <p className="text-xs font-bold text-forest-600 dark:text-forest-400">Pasos:</p>
                    {foundItem.steps.map((step, index) => (
                      <p key={step} className="flex gap-2 text-xs leading-relaxed text-[var(--eco-text-muted)]">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-forest-700 text-[10px] font-bold text-white">
                          {index + 1}
                        </span>
                        {step}
                      </p>
                    ))}
                  </div>

                  <div className="rounded-lg bg-amber-50 p-2 text-[10px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    💡 {foundItem.tip}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={speakSteps} className="eco-btn-outline flex-1">
                    <Volume2 size={14} /> Escuchar
                  </button>
                  <button onClick={() => setMode('chat')} className="eco-btn-outline flex-1">
                    <Search size={14} /> Otro
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
