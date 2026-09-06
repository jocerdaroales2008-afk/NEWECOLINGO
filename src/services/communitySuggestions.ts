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

export async function saveCommunitySuggestion(suggestion: CommunitySuggestion) {
  if (!client) {
    throw new Error('Supabase no está configurado.');
  }

  const { error } = await client.from('community_suggestions').insert({
    name: suggestion.name,
    address: suggestion.address,
    latitude: suggestion.lat,
    longitude: suggestion.lng,
    materials: suggestion.materials,
    status: 'pending',
  });

  if (error) throw error;
}
