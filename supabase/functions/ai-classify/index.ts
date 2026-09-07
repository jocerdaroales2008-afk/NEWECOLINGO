/**
 * Edge Function: proxy hacia NVIDIA Build para la clasificación visual.
 *
 * El navegador nunca ve la clave `nvapi-...`: se añade aquí, en el servidor.
 * Despliegue:
 *
 *   supabase secrets set NVIDIA_API_KEY=nvapi-...
 *   supabase functions deploy ai-classify
 *
 * Modelos permitidos y límites de tamaño están acotados a propósito para que
 * la función no pueda usarse como proxy abierto contra la cuenta de NVIDIA.
 */

const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const ALLOWED_MODELS = new Set([
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.2-11b-vision-instruct',
  'microsoft/phi-3.5-vision-instruct',
  'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
  'google/gemma-3-27b-it',
  'mistralai/mistral-small-3.1-24b-instruct-2503',
]);

const DEFAULT_MODEL = 'meta/llama-3.2-90b-vision-instruct';
const MAX_BODY_BYTES = 1_500_000;
const MAX_OUTPUT_TOKENS = 400;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== 'POST') {
    return json({ error: 'Usa POST.' }, 405);
  }

  const apiKey = Deno.env.get('NVIDIA_API_KEY')?.trim();
  if (!apiKey) {
    return json({ error: 'Falta el secreto NVIDIA_API_KEY en la función.' }, 503);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'La imagen enviada es demasiado grande.' }, 413);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ error: 'Cuerpo JSON inválido.' }, 400);
  }

  if (!Array.isArray(payload.messages) || payload.messages.length === 0) {
    return json({ error: 'Faltan los mensajes de la conversación.' }, 400);
  }

  const requestedModel = typeof payload.model === 'string' ? payload.model : DEFAULT_MODEL;
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : DEFAULT_MODEL;

  const requestedTokens = Number(payload.max_tokens);
  const maxTokens = Number.isFinite(requestedTokens)
    ? Math.min(MAX_OUTPUT_TOKENS, Math.max(16, Math.trunc(requestedTokens)))
    : MAX_OUTPUT_TOKENS;

  let upstream: Response;
  try {
    upstream = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: payload.messages,
        temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.1,
        top_p: typeof payload.top_p === 'number' ? payload.top_p : 0.7,
        max_tokens: maxTokens,
        // El cliente espera una respuesta completa, no un stream de eventos.
        stream: false,
      }),
    });
  } catch (error) {
    return json({ error: `No se pudo contactar a NVIDIA: ${String(error)}` }, 502);
  }

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
