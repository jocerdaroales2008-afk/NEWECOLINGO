import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MaterialCategory } from '@/types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const client: SupabaseClient | null = url && key ? createClient(url, key) : null;

export interface CommunitySuggestion {
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  materials: MaterialCategory[];
}

interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

/**
 * Traduce los errores de PostgREST a algo que la persona pueda entender.
 *
 * Sin esto, la interfaz mostraba en español un error crudo en inglés del tipo
 * "Could not find the table 'public.community_suggestions' in the schema cache",
 * que no le dice nada a quien está sugiriendo un punto limpio.
 */
function describeError(error: PostgrestErrorLike): string {
  const code = error.code ?? '';
  const message = error.message ?? '';

  // La tabla no existe todavía en el proyecto de Supabase.
  if (code === 'PGRST205' || code === '42P01') {
    return 'El registro de sugerencias todavía no está habilitado en el servidor. Avisa al equipo de EcoLingo: falta aplicar la migración de la tabla community_suggestions.';
  }

  // Falta el GRANT o la policy de RLS para el rol anónimo.
  if (code === '42501' || /row-level security/i.test(message)) {
    return 'El servidor no está aceptando sugerencias en este momento por una restricción de permisos. Avisa al equipo de EcoLingo.';
  }

  if (code === '23514' || code === '23502') {
    return 'Alguno de los datos no cumple lo que espera el servidor. Revisa el nombre, la dirección y los materiales.';
  }

  if (/fetch|network|failed to fetch/i.test(message)) {
    return 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
  }

  return 'No se pudo enviar la sugerencia. Inténtalo nuevamente en unos minutos.';
}

export async function saveCommunitySuggestion(suggestion: CommunitySuggestion) {
  if (!client) {
    throw new Error('La aplicación no está conectada a Supabase. Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }

  let error: PostgrestErrorLike | null = null;
  try {
    ({ error } = await client.from('community_suggestions').insert({
      name: suggestion.name,
      address: suggestion.address,
      latitude: suggestion.lat,
      longitude: suggestion.lng,
      materials: suggestion.materials,
      status: 'pending',
    }));
  } catch (requestError) {
    // El cliente lanza en vez de devolver `error` cuando ni siquiera hay red.
    throw new Error(describeError({ message: String(requestError) }));
  }

  if (error) {
    console.error('community_suggestions insert falló:', error);
    throw new Error(describeError(error));
  }
}
