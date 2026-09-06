import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair } from 'lucide-react';
import { formatDistance, type GeoLocation } from '@/hooks/useGeolocation';
import { MATERIAL_LABELS, type CleanPoint } from '@/types';

interface MapViewProps {
  points: (CleanPoint & { realDistance: number })[];
  userLocation: GeoLocation | null;
}

type PointLayer = L.Marker | L.CircleMarker;
const CANVAS_MARKER_THRESHOLD = 350;

function pointIcon(index: number) {
  return L.divIcon({
    className: '',
    html: `<div class="clean-point-marker">${index + 1}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function createPopup(point: CleanPoint & { realDistance: number }) {
  const popup = document.createElement('div');
  popup.className = 'recycling-popup';

  const name = document.createElement('strong');
  name.textContent = point.name;
  const address = document.createElement('small');
  address.textContent = point.address;
  const materials = document.createElement('small');
  materials.textContent = point.materials.length
    ? `Acepta: ${point.materials.map((material) => MATERIAL_LABELS[material]).join(', ')}`
    : 'Materiales aceptados: no informados por la fuente';
  const distance = document.createElement('strong');
  distance.textContent = formatDistance(point.realDistance);
  const status = document.createElement('small');
  status.textContent = point.status ? `Estado informado: ${point.status}` : point.hours;
  const link = document.createElement('a');
  link.href = `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.textContent = 'Cómo llegar';

  popup.append(name, address, materials, distance, status, link);
  return popup;
}

function addPointLayer(
  map: L.Map,
  point: CleanPoint & { realDistance: number },
  index: number,
  useCanvasMarkers: boolean,
): PointLayer {
  if (useCanvasMarkers) {
    return L.circleMarker([point.lat, point.lng], {
      radius: 6,
      weight: 2,
      fillOpacity: 0.85,
      color: '#ffffff',
      fillColor: '#166534',
    })
      .addTo(map)
      .bindPopup(createPopup(point), { maxWidth: 270 });
  }

  return L.marker([point.lat, point.lng], { icon: pointIcon(index) })
    .addTo(map)
    .bindPopup(createPopup(point), { maxWidth: 270 });
}

export function MapView({ points, userLocation }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const pointLayersRef = useRef<Map<number, PointLayer>>(new Map());
  const canvasModeRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      dragging: true,
      preferCanvas: true,
    }).setView([-33.445, -70.667], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    const element = containerRef.current;
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.invalidateSize({ animate: false }))
      : null;
    observer?.observe(element);

    const invalidate = () => map.invalidateSize({ animate: false });
    window.addEventListener('resize', invalidate);
    window.addEventListener('orientationchange', invalidate);
    document.addEventListener('visibilitychange', invalidate);
    map.invalidateSize({ animate: false });

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('orientationchange', invalidate);
      document.removeEventListener('visibilitychange', invalidate);
      pointLayersRef.current.clear();
      userMarkerRef.current = null;
      map.off();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      return;
    }

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        zIndexOffset: 1000,
        icon: L.divIcon({
          className: '',
          html: '<div class="user-location-marker" aria-hidden="true"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map).bindPopup('<strong>Tu ubicación</strong>');
    } else {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const useCanvasMarkers = points.length > CANVAS_MARKER_THRESHOLD;
    if (canvasModeRef.current !== useCanvasMarkers) {
      for (const layer of pointLayersRef.current.values()) map.removeLayer(layer);
      pointLayersRef.current.clear();
      canvasModeRef.current = useCanvasMarkers;
    }

    const nextIds = new Set(points.map((point) => point.id));
    for (const [id, layer] of pointLayersRef.current) {
      if (!nextIds.has(id)) {
        map.removeLayer(layer);
        pointLayersRef.current.delete(id);
      }
    }

    points.forEach((point, index) => {
      const existing = pointLayersRef.current.get(point.id);
      if (!existing) {
        pointLayersRef.current.set(point.id, addPointLayer(map, point, index, useCanvasMarkers));
        return;
      }

      existing.setLatLng([point.lat, point.lng]);
      existing.setPopupContent(createPopup(point));
      if (existing instanceof L.Marker) existing.setIcon(pointIcon(index));
    });

    if (!initialFitDoneRef.current && points.length > 0) {
      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng] as [number, number]));
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.08), { animate: false, maxZoom: 13 });
      initialFitDoneRef.current = true;
    }
  }, [points, mapReady]);

  const centerOnUser = useCallback(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    map.setView([userLocation.lat, userLocation.lng], Math.max(map.getZoom(), 14), { animate: true });
    userMarkerRef.current?.openPopup();
  }, [userLocation]);

  return (
    <div className="map-shell relative w-full min-w-0 overflow-hidden rounded-2xl">
      <div
        ref={containerRef}
        className="ecolingo-map w-full"
        aria-label="Mapa interactivo de puntos de reciclaje"
      />
      {userLocation && (
        <button
          type="button"
          onClick={centerOnUser}
          className="absolute bottom-4 right-4 z-[500] inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--eco-border)] bg-[var(--eco-card)] px-3 py-2 text-sm font-bold text-[var(--eco-text)] shadow-lg"
          aria-label="Centrar mapa en mi ubicación"
        >
          <Crosshair size={17} />
          <span className="hidden sm:inline">Centrar en mí</span>
        </button>
      )}
    </div>
  );
}
