import { Volume2, Square } from 'lucide-react';
import { useAccessibility } from '@/context/AccessibilityContext';
import { useState, useCallback } from 'react';

interface SpeakButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function SpeakButton({ text, label, className = '' }: SpeakButtonProps) {
  const { speak, stopSpeaking, isSpeaking } = useAccessibility();
  const [localSpeaking, setLocalSpeaking] = useState(false);

  const handleClick = useCallback(() => {
    if (isSpeaking && localSpeaking) {
      stopSpeaking();
      setLocalSpeaking(false);
    } else {
      speak(text);
      setLocalSpeaking(true);
    }
  }, [isSpeaking, localSpeaking, speak, stopSpeaking, text]);

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--eco-border)] px-3 py-2 text-sm font-semibold transition hover:bg-[var(--eco-surface)] ${className}`}
      aria-label={label || 'Reproducir en voz alta'}
    >
      {isSpeaking && localSpeaking ? <Square size={16} /> : <Volume2 size={16} />}
      {label || ''}
    </button>
  );
}
