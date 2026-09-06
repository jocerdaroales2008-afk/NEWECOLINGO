export interface BarcodeProductEvidence {
  barcode: string;
  productName: string;
  materialText: string;
  source: 'Open Food Facts';
}

interface BarcodeDetectionResultLike {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLCanvasElement | HTMLImageElement): Promise<BarcodeDetectionResultLike[]>;
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

interface OpenFoodFactsProduct {
  product_name?: string;
  product_name_es?: string;
  packaging_text?: string;
  packaging_text_es?: string;
  packaging_tags?: unknown;
  packagings?: unknown;
}

interface OpenFoodFactsResponse {
  status?: number | string;
  product?: OpenFoodFactsProduct;
}

const PACKAGING_TERMS: Array<[RegExp, string]> = [
  [/\b(plastic|plastics|pet|polyethylene|polypropylene|hdpe|ldpe)\b/gi, ' plastico pet '],
  [/\b(glass|verre)\b/gi, ' vidrio '],
  [/\b(paper|cardboard|carton|paperboard)\b/gi, ' papel '],
  [/\b(aluminium|aluminum|steel|metal|tinplate)\b/gi, ' metal '],
  [/\b(textile|fabric|cotton)\b/gi, ' textil tela '],
  [/\b(tetra[ -]?pak|tetra[ -]?brik)\b/gi, ' tetrapak '],
];

function flattenPackaging(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)];
  if (Array.isArray(value)) return value.flatMap(flattenPackaging);
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(flattenPackaging);
}

function packagingEvidence(product: OpenFoodFactsProduct): string {
  const raw = [
    product.packaging_text_es,
    product.packaging_text,
    ...flattenPackaging(product.packaging_tags),
    ...flattenPackaging(product.packagings),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\b(?:en|es|fr|de):/gi, ' ')
    .replace(/[-_]/g, ' ');

  return PACKAGING_TERMS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), raw)
    .replace(/\s+/g, ' ')
    .trim();
}

async function detectBarcode(source: HTMLCanvasElement | HTMLImageElement): Promise<string | null> {
  const browserWindow = window as Window & { BarcodeDetector?: BarcodeDetectorConstructor };
  if (!browserWindow.BarcodeDetector) return null;

  try {
    const detector = new browserWindow.BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code'],
    });
    const results = await detector.detect(source);
    return results.map((result) => result.rawValue?.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

async function lookupOpenFoodFacts(barcode: string): Promise<BarcodeProductEvidence | null> {
  if (!/^\d{8,14}$/.test(barcode)) return null;

  const endpoint = new URL(`https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}`);
  endpoint.searchParams.set('lc', 'es');
  endpoint.searchParams.set('cc', 'cl');
  endpoint.searchParams.set('fields', 'code,product_name,product_name_es,packaging_text,packaging_text_es,packaging_tags,packagings');

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6000);
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) return null;
  const payload = await response.json() as OpenFoodFactsResponse;
  if (!payload.product || String(payload.status ?? '1') === '0') return null;

  const materialText = packagingEvidence(payload.product);
  if (!materialText) return null;

  return {
    barcode,
    productName: payload.product.product_name_es?.trim() || payload.product.product_name?.trim() || 'Producto con código de barras',
    materialText,
    source: 'Open Food Facts',
  };
}

export async function getBarcodeProductEvidence(
  source: HTMLCanvasElement | HTMLImageElement,
): Promise<BarcodeProductEvidence | null> {
  const barcode = await detectBarcode(source);
  if (!barcode) return null;
  try {
    return await lookupOpenFoodFacts(barcode);
  } catch {
    return null;
  }
}
