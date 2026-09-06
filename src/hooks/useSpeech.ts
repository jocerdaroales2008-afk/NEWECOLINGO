import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccessibility } from '@/context/AccessibilityContext';

type RecognitionStatus = 'idle' | 'listening' | 'result' | 'no-match' | 'error';

interface SpeechState {
  isListening: boolean;
  transcript: string;
  supported: boolean;
  recognitionSupported: boolean;
  recognitionStatus: RecognitionStatus;
  recognitionError: string;
}

interface SpeechRecognitionResultEvent extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

interface SpeechRecognitionErrorEvent extends Event {
  error?: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function useSpeech() {
  const { speechRate, autoSpeak, speak, stopSpeaking, isSpeaking } = useAccessibility();
  const [state, setState] = useState<SpeechState>({
    isListening: false,
    transcript: '',
    supported: false,
    recognitionSupported: false,
    recognitionStatus: 'idle',
    recognitionError: '',
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const receivedResultRef = useRef(false);
  const stoppedIntentionallyRef = useRef(false);

  useEffect(() => {
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SR = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (SR) {
      const rec = new SR();
      rec.lang = 'es-CL';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim() ?? '';
        receivedResultRef.current = Boolean(transcript);
        setState((current) => ({
          ...current,
          transcript,
          isListening: false,
          recognitionStatus: transcript ? 'result' : 'no-match',
          recognitionError: '',
        }));
      };
      rec.onerror = (event) => {
        receivedResultRef.current = false;
        const error = event.error === 'not-allowed'
          ? 'Permiso de micrófono denegado.'
          : event.error === 'no-speech'
            ? 'No se detectó voz. Inténtalo de nuevo.'
            : 'No se pudo reconocer la voz.';
        setState((current) => ({ ...current, isListening: false, recognitionStatus: 'error', recognitionError: error }));
      };
      rec.onend = () => {
        setState((current) => {
          if (current.recognitionStatus === 'error' || current.recognitionStatus === 'result') {
            return { ...current, isListening: false };
          }
          if (stoppedIntentionallyRef.current) {
            stoppedIntentionallyRef.current = false;
            return { ...current, isListening: false, recognitionStatus: 'idle' };
          }
          return {
            ...current,
            isListening: false,
            recognitionStatus: receivedResultRef.current ? current.recognitionStatus : 'no-match',
            recognitionError: receivedResultRef.current ? current.recognitionError : 'No se detectó una consulta. Inténtalo de nuevo.',
          };
        });
      };
      recognitionRef.current = rec;
    }

    setState((current) => ({
      ...current,
      supported: 'speechSynthesis' in window,
      recognitionSupported: Boolean(SR),
    }));

    return () => {
      window.speechSynthesis?.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setState((current) => ({
        ...current,
        recognitionStatus: 'error',
        recognitionError: 'El reconocimiento de voz no está disponible en este navegador.',
      }));
      return;
    }

    receivedResultRef.current = false;
    stoppedIntentionallyRef.current = false;
    setState((current) => ({
      ...current,
      isListening: true,
      transcript: '',
      recognitionStatus: 'listening',
      recognitionError: '',
    }));
    try {
      recognitionRef.current.start();
    } catch {
      setState((current) => ({
        ...current,
        isListening: false,
        recognitionStatus: 'error',
        recognitionError: 'El micrófono ya estaba ocupado. Inténtalo nuevamente.',
      }));
    }
  }, []);

  const stopListening = useCallback(() => {
    stoppedIntentionallyRef.current = true;
    recognitionRef.current?.stop();
    setState((current) => ({ ...current, isListening: false, recognitionStatus: 'idle' }));
  }, []);

  const stop = useCallback(() => {
    stopSpeaking();
  }, [stopSpeaking]);

  return {
    ...state,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    stop,
    speechRate,
    autoSpeak,
  };
}
