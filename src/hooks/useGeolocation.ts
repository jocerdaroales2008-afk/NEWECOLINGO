import { useState, useCallback, useEffect, useRef } from 'react';

export interface GeoLocation {
  lat: number;
  lng: number;
}

export type GeoStatus = 'idle' | 'loading' | 'success' | 'error';

export function useGeolocation() {
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [error, setError] = useState<string>('');
  const watchIdRef = useRef<number | null>(null);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error');
      setError('La geolocalización no está disponible en este dispositivo.');
      return;
    }

    setStatus('loading');
    setError('');

    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus('success');
      },
      (err) => {
        setStatus('error');
        const messages: Record<number, string> = {
          1: 'Permiso denegado. Activa el acceso a tu ubicación para continuar.',
          2: 'No se pudo determinar tu ubicación.',
          3: 'Se agotó el tiempo de espera.',
        };
        setError(messages[err.code] || 'Error al obtener la ubicación.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, []);

  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
  }, []);

  return { location, status, error, requestLocation };
}

export function haversineDistance(a: GeoLocation, b: GeoLocation): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
