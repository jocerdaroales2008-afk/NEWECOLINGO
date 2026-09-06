import { MATERIAL_LABELS, type MaterialCategory } from '@/types';

/**
 * Clasificación visual asistida por un modelo multimodal servido por
 * NVIDIA Build (https://build.nvidia.com), que expone una API compatible con
 * el formato de OpenAI en `https://integrate.api.nvidia.com/v1`.
 *
 * La clave `nvapi-...` NUNCA viaja al navegador: el cliente siempre habla con
 * un proxy que la añade del lado del servidor.
 *
 *   - `npm run dev`  -> proxy de Vite en `/api/nvidia` (ver vite.config.ts),
 *                       que lee `NVIDIA_API_KEY` del archivo .env local.
 *   - producción     -> `VITE_AI_PROXY_URL`, o la Edge Function incluida en
 *                       `supabase/functions/ai-classify`.
 *
 * Si no hay proxy configurado la función queda deshabilitada y el escáner
 * sigue funcionando con MobileNet y el código de barras.
 */

export interface AiVisionEvidence {
  category: MaterialCategory;
  confidence: number;
  objectName: string;
  reason: string;
  model: string;
}

const CATEGORIES: readonly MaterialCategory[] = [
  'organico',
  'papel',
  'plastico',
  'vidrio',
  'metal',
  'raee',
  'pilas',
  'textil',
  'peligroso',
];

const DEFAULT_MODEL = 'meta/llama-3.2-90b-vision-instruct';
const DEV_PROXY_PATH = '/api/nvidia/v1/chat/completions';

/**
 * NVIDIA rechaza las imágenes embebidas en base64 que superan ~180 KB.
 * Dejamos margen para el resto del cuerpo de la petición.
 */
const MAX_IMAGE_BYTES = 160 * 1024;
const MAX_IMAGE_DIMENSION = 896;
const REQUEST_TIMEOUT_MS = 25_000;

const env = import.meta.env;

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resuelve el endpoint del proxy. Devuelve `null` cuando la función no está
 * configurada, para que quien llame pueda degradar con elegancia.
 */
function resolveEndpoint(): { url: string; supabaseFunction: boolean } | null {
  const explicit = trimmed(env.VITE_AI_PROXY_URL);
  if (explicit) return { url: explicit, supabaseFunction: false };

  if (env.DEV) return { url: DEV_PROXY_PATH, supabaseFunction: false };

  const supabaseUrl = trimmed(env.VITE_SUPABASE_URL);
  if (supabaseUrl) {
    return { url: `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/ai-classify`, supabaseFunction: true };
  }

  return null;
}

export function isAiVisionConfigured(): boolean {
  return resolveEndpoint() !== null;
}

export function aiVisionModel(): string {
  return trimmed(env.VITE_NVIDIA_MODEL) || DEFAULT_MODEL;
}

/**
 * Reescala y comprime la captura hasta entrar en el límite del proveedor.
 * Devuelve un data URL JPEG o `null` si el navegador no puede generarlo.
 */
function toCompressedDataUrl(image: HTMLCanvasElement | HTMLImageElement): string | null {
  const sourceWidth = image instanceof HTMLCanvasElement ? image.width : image.naturalWidth;
  const sourceHeight = image instanceof HTMLCanvasElement ? image.height : image.naturalHeight;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.78, 0.62, 0.48, 0.35, 0.25]) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
    // 4 caracteres base64 codifican 3 bytes.
    if ((base64Length * 3) / 4 <= MAX_IMAGE_BYTES) return dataUrl;
  }

  return null;
}

const SYSTEM_PROMPT = [
  'Eres un asistente de reciclaje para Chile. Observas la fotografía de un residuo',
  'y decides en qué categoría debe depositarse.',
  '',
  `Categorías válidas: ${CATEGORIES.map((category) => `${category} (${MATERIAL_LABELS[category]})`).join(', ')}.`,
  '',
  'Responde ÚNICAMENTE con un objeto JSON, sin explicaciones ni bloques de código:',
  '{"category":"<una de las categorías>","confidence":<0 a 1>,"object":"<nombre corto en español>","reason":"<una frase breve en español>"}',
  '',
  'Reglas:',
  '- La confianza debe reflejar la evidencia real de la imagen, no ser optimista.',
  '- Si no distingues el material con claridad usa "confidence" menor que 0.5.',
  '- Si la imagen no muestra un residuo identificable usa {"category":null,...}.',
  '- Nunca inventes una categoría por defecto.',
].join('\n');

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
}

interface RawAiAnswer {
  category?: unknown;
  confidence?: unknown;
  object?: unknown;
  reason?: unknown;
}

/**
 * Los modelos suelen envolver el JSON en texto o en un bloque de código.
 * Extraemos el primer objeto balanceado que aparezca.
 */
function extractJsonObject(text: string): RawAiAnswer | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, index + 1)) as RawAiAnswer;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function normalizeAnswer(answer: RawAiAnswer, model: string): AiVisionEvidence | null {
  const category = trimmed(answer.category).toLowerCase() as MaterialCategory;
  if (!CATEGORIES.includes(category)) return null;

  const rawConfidence = typeof answer.confidence === 'number' ? answer.confidence : Number(answer.confidence);
  const confidence = Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0;

  return {
    category,
    confidence,
    objectName: trimmed(answer.object).slice(0, 80),
    reason: trimmed(answer.reason).slice(0, 240),
    model,
  };
}

/**
 * Clasifica una imagen con el modelo remoto.
 *
 * Devuelve `null` —sin lanzar— cuando la IA no está configurada o no aporta
 * evidencia utilizable. Los errores de red o del proveedor sí se propagan para
 * que quien llame pueda registrarlos.
 */
export async function classifyImageWithAI(
  image: HTMLCanvasElement | HTMLImageElement,
  signal?: AbortSignal,
): Promise<AiVisionEvidence | null> {
  const endpoint = resolveEndpoint();
  if (!endpoint) return null;

  const dataUrl = toCompressedDataUrl(image);
  if (!dataUrl) return null;

  const model = aiVisionModel();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (endpoint.supabaseFunction) {
    // Las Edge Functions exigen un token del proyecto para aceptar la petición.
    const anonKey = trimmed(env.VITE_SUPABASE_ANON_KEY);
    if (anonKey) {
      headers.Authorization = `Bearer ${anonKey}`;
      headers.apikey = anonKey;
    }
  }

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0.1,
        top_p: 0.7,
        max_tokens: 220,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: '¿A qué categoría de reciclaje corresponde este residuo?' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`NVIDIA respondió ${response.status}: ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part) => (part && typeof part === 'object' && 'text' in part ? String((part as { text?: unknown }).text ?? '') : ''))
            .join(' ')
        : '';

    if (!text.trim()) return null;

    const parsed = extractJsonObject(text);
    return parsed ? normalizeAnswer(parsed, model) : null;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
