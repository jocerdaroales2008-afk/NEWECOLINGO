import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { CleanPoint, MaterialCategory } from '@/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const client = url && key ? createClient(url, key) : null;

interface OfficialPointRow {
  id: number;
  source: string | null;
  source_id: string | null;
  name: string;
  address: string;
  commune: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
  accepted_materials: string[] | null;
  hours: string | null;
  status: string | null;
  updated_at: string | null;
  last_verified_at: string | null;
}

export interface OfficialPointsResult {
  points: CleanPoint[];
  refreshedAt: string;
  stale: boolean;
}

interface CachedOfficialPoints {
  points: CleanPoint[];
  refreshedAt: string;
}

const PAGE_SIZE = 1000;
const CACHE_KEY = 'ecolingo-official-points-v2';

const materialKeywords: Record<MaterialCategory, string[]> = {
  organico: ['orgánico', 'organico', 'compost', 'residuo vegetal'],
  papel: ['papel', 'cartón', 'carton', 'tetra pak', 'tetrapak'],
  plastico: ['plástico', 'plastico', 'pet', 'hdpe', 'polietileno', 'polipropileno'],
  vidrio: ['vidrio', 'cristal de envase'],
  metal: ['metal', 'aluminio', 'lata', 'hojalata', 'acero'],
  raee: ['electrónico', 'electronico', 'raee', 'computador', 'celular', 'eléctrico', 'electrico'],
  pilas: ['pila', 'batería', 'bateria'],
  textil: ['textil', 'ropa', 'calzado'],
  peligroso: ['peligroso', 'químico', 'quimico', 'solvente', 'pintura', 'aceite lubricante'],
};

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMaterials(values: string[] | null): MaterialCategory[] {
  if (!values?.length) return [];
  const source = normalizeText(values.join(' '));
  return (Object.entries(materialKeywords) as [MaterialCategory, string[]][])
    .filter(([, keywords]) => keywords.some((keyword) => source.includes(normalizeText(keyword))))
    .map(([category]) => category);
}

function toCleanPoint(point: OfficialPointRow): CleanPoint | null {
  const lat = Number(point.latitude);
  const lng = Number(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const materials = normalizeMaterials(point.accepted_materials);
  return {
    id: point.id,
    name: point.name || 'Punto limpio',
    address: [point.address, point.commune, point.region].filter(Boolean).join(', '),
    lat,
    lng,
    materials,
    materialsKnown: Boolean(point.accepted_materials?.length),
    distance: 0,
    hours: point.hours || 'Horario no disponible',
    commune: point.commune ?? undefined,
    region: point.region ?? undefined,
    source: point.source === 'mma' ? 'Ministerio del Medio Ambiente' : (point.source ?? 'Fuente no informada'),
    updatedAt: point.updated_at ?? undefined,
    lastVerifiedAt: point.last_verified_at ?? undefined,
    status: point.status ?? undefined,
  };
}

function dedupePoints(rows: OfficialPointRow[]): CleanPoint[] {
  const bySource = new Map<string, CleanPoint>();
  const byPlace = new Map<string, string>();

  for (const row of rows) {
    const point = toCleanPoint(row);
    if (!point) continue;

    const sourceKey = row.source_id
      ? `${row.source ?? 'unknown'}:${row.source_id}`
      : `row:${row.id}`;
    const placeKey = [
      point.lat.toFixed(5),
      point.lng.toFixed(5),
      normalizeText(point.name),
      normalizeText(point.address),
    ].join('|');

    const existingSourceKey = byPlace.get(placeKey);
    if (existingSourceKey) {
      const existing = bySource.get(existingSourceKey);
      if (existing) {
        existing.materials = [...new Set([...existing.materials, ...point.materials])];
        existing.materialsKnown = existing.materialsKnown || point.materialsKnown;
        if (!existing.lastVerifiedAt || (point.lastVerifiedAt && point.lastVerifiedAt > existing.lastVerifiedAt)) {
          existing.lastVerifiedAt = point.lastVerifiedAt;
          existing.updatedAt = point.updatedAt;
          existing.status = point.status ?? existing.status;
        }
      }
      continue;
    }

    bySource.set(sourceKey, point);
    byPlace.set(placeKey, sourceKey);
  }

  return [...bySource.values()];
}

function readCache(): CachedOfficialPoints | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedOfficialPoints;
    if (!Array.isArray(parsed.points) || !parsed.refreshedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(value: CachedOfficialPoints) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // localStorage tiene cuota limitada. La app sigue funcionando online aunque no pueda guardar la copia.
  }
}

function newestVerification(points: CleanPoint[]): string | null {
  return points.reduce<string | null>((latest, point) => {
    const candidate = point.lastVerifiedAt ?? point.updatedAt;
    if (!candidate) return latest;
    return !latest || candidate > latest ? candidate : latest;
  }, null);
}

async function fetchRows(selectColumns: string): Promise<OfficialPointRow[]> {
  if (!client) return [];
  const rows: OfficialPointRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from('recycling_points')
      .select(selectColumns)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data ?? []) as unknown as OfficialPointRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function getOfficialRecyclingPoints(): Promise<OfficialPointsResult> {
  if (!client) {
    const cached = readCache();
    if (cached) return { ...cached, stale: true };
    throw new Error('Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY para cargar los puntos oficiales.');
  }

  try {
    let rows: OfficialPointRow[];
    try {
      rows = await fetchRows('id, source, source_id, name, address, commune, region, latitude, longitude, accepted_materials, hours, status, updated_at, last_verified_at');
    } catch (extendedError) {
      // Compatibilidad de transición: una instalación existente puede seguir con el esquema
      // anterior hasta que se aplique la migración incluida en /supabase/migrations.
      const message = extendedError && typeof extendedError === 'object' && 'message' in extendedError
        ? String((extendedError as { message?: unknown }).message ?? '')
        : String(extendedError);
      if (!/(source_id|last_verified_at|updated_at|status|source)/i.test(message)) throw extendedError;
      rows = await fetchRows('id, name, address, commune, region, latitude, longitude, accepted_materials, hours');
    }

    const points = dedupePoints(rows);
    const result: CachedOfficialPoints = {
      points,
      refreshedAt: newestVerification(points) ?? new Date().toISOString(),
    };
    writeCache(result);
    return { ...result, stale: false };
  } catch (error) {
    const cached = readCache();
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

export function subscribeToOfficialRecyclingPoints(onChange: () => void): () => void {
  if (!client) return () => undefined;

  let refreshTimer: number | null = null;
  let channel: RealtimeChannel | null = client
    .channel('ecolingo-recycling-points')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'recycling_points' },
      () => {
        // Una sincronización masiva puede emitir cientos de eventos. Los agrupamos en una sola recarga.
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => {
          refreshTimer = null;
          onChange();
        }, 750);
      },
    )
    .subscribe();

  return () => {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    if (channel) void client.removeChannel(channel);
    channel = null;
  };
}
