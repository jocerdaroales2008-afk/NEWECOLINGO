import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MMA_API_URL = 'https://puntoslimpios.mma.gob.cl/api/points/geo';
const SEARCH_RADIUS_KM = 100;
const CONCURRENCY = 8;

// El endpoint oficial es geográfico. Esta malla solapada busca cubrir Chile continental
// sin depender de un único centro por región, que puede omitir puntos alejados.
const MAINLAND_SEARCHES = [];
for (let lat = -18.25; lat >= -55.75; lat -= 1.5) {
  for (const lng of [-68.25, -69.75, -71.25, -72.75, -74.25, -75.75]) {
    MAINLAND_SEARCHES.push([Number(lat.toFixed(2)), lng]);
  }
}
const SEARCH_CENTERS = [
  ...MAINLAND_SEARCHES,
  [-27.1127, -109.3497], // Rapa Nui
  [-33.64, -78.83], // Archipiélago Juan Fernández
];

const hasValidSecretKey = SUPABASE_SERVICE_ROLE_KEY?.startsWith('sb_secret_') || SUPABASE_SERVICE_ROLE_KEY?.startsWith('eyJ');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY.includes('your_') || !hasValidSecretKey) {
  throw new Error('Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de ejecutar la sincronización.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { fetch } });

function materialName(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (!value || typeof value !== 'object') return '';
  return String(
    value.name
      ?? value.nombre
      ?? value.title
      ?? value.material
      ?? value.description
      ?? value.descripcion
      ?? '',
  ).trim();
}

function toMaterials(value) {
  if (Array.isArray(value)) return [...new Set(value.map(materialName).filter(Boolean))];
  if (typeof value === 'string') return [...new Set(value.split(/[,;|]/).map((material) => material.trim()).filter(Boolean))];
  if (value && typeof value === 'object') return [...new Set(Object.values(value).map(materialName).filter(Boolean))];
  return [];
}

function toNumber(...values) {
  for (const value of values) {
    const number = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (Number.isFinite(number)) return number;
  }
  return Number.NaN;
}

function sourceId(item, latitude, longitude) {
  const explicit = item.id ?? item.uuid ?? item._id ?? item.code ?? item.codigo;
  if (explicit !== undefined && explicit !== null && String(explicit).trim()) return String(explicit).trim();
  const name = String(item.manager ?? item.owner ?? item.name ?? '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);
  return `geo:${latitude.toFixed(6)},${longitude.toFixed(6)}:${name || 'punto'}`;
}

function pointStatus(item) {
  const value = item.status?.name ?? item.status?.label ?? item.status ?? item.estado;
  return value === undefined || value === null ? null : String(value).trim() || null;
}

async function fetchPointsNear(lat, lng, attempt = 1) {
  const url = new URL(MMA_API_URL);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lng', String(lng));
  url.searchParams.set('distance', String(SEARCH_RADIUS_KM));

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'EcoLingo/1.2 (sincronizacion puntos limpios MMA Chile)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      return fetchPointsNear(lat, lng, attempt + 1);
    }
    throw new Error(`MMA (${lat}, ${lng}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function cargarPuntosOficialesMMA() {
  const syncStartedAt = new Date().toISOString();
  console.log(`Consultando ${SEARCH_CENTERS.length} zonas de la fuente oficial del MMA...`);

  try {
    const responses = await mapWithConcurrency(
      SEARCH_CENTERS,
      CONCURRENCY,
      async ([lat, lng]) => fetchPointsNear(lat, lng),
    );

    const rawPoints = responses.flat().filter((item) => {
      const type = String(item?.type ?? item?.tipo ?? '').toLowerCase();
      return type === 'pl' || type.includes('punto limpio');
    });

    const deduped = new Map();
    for (const item of rawPoints) {
      const latitude = toNumber(item.lat, item.latitude);
      const longitude = toNumber(item.lng, item.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
      const id = sourceId(item, latitude, longitude);
      deduped.set(id, { item, latitude, longitude, sourceId: id });
    }

    const puntosFormateados = [...deduped.values()].map(({ item, latitude, longitude, sourceId: id }) => {
      const materiales = toMaterials(item.materiales ?? item.materials ?? item.residuos);
      const status = pointStatus(item);
      return {
        source: 'mma',
        source_id: id,
        name: String(item.manager ?? item.owner ?? item.name ?? 'Punto Limpio MMA').trim(),
        address: [item.address_type, item.address_name, item.address_number].filter(Boolean).join(' ').trim()
          || String(item.address ?? item.direccion ?? 'Sin dirección registrada').trim(),
        commune: item.commune?.name ?? item.commune ?? item.comuna?.name ?? item.comuna ?? null,
        region: item.region?.name ?? item.region ?? item.region_name ?? null,
        latitude,
        longitude,
        accepted_materials: materiales,
        hours: String(item.hours ?? item.horario ?? '').trim() || 'Horario no disponible',
        status,
        updated_at: syncStartedAt,
        last_verified_at: syncStartedAt,
      };
    });

    if (puntosFormateados.length === 0) {
      throw new Error('La fuente oficial no devolvió puntos limpios válidos. Se conserva la última versión almacenada.');
    }

    console.log(`Se deduplicaron ${puntosFormateados.length} puntos limpios oficiales. Guardando...`);
    const chunkSize = 100;
    for (let i = 0; i < puntosFormateados.length; i += chunkSize) {
      const chunk = puntosFormateados.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('recycling_points')
        .upsert(chunk, { onConflict: 'source,source_id' });
      if (error) throw new Error(`Error en el lote ${i / chunkSize + 1}: ${error.message} (${error.code ?? 'sin código'})`);
    }

    // Solo después de completar TODOS los upserts retiramos registros MMA que no aparecieron
    // en esta sincronización. Si la API falla, la última copia válida permanece intacta.
    const { error: staleError } = await supabase
      .from('recycling_points')
      .delete()
      .eq('source', 'mma')
      .lt('last_verified_at', syncStartedAt);
    if (staleError) {
      console.warn(`Sincronización completa, pero no se pudieron retirar registros obsoletos: ${staleError.message}`);
    }

    console.log(`Sincronización oficial completada: ${puntosFormateados.length} puntos.`);
  } catch (error) {
    console.error('Sincronización abortada sin borrar la última copia válida:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

void cargarPuntosOficialesMMA();
