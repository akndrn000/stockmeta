// Inspeksi detail 100% oleh AI (crop resolusi asli) — prompt ketat, parser,
// cache per hash gambar, estimasi biaya. Provider tanpa vision dilewati dengan
// pesan "inspeksi detail tidak tersedia" (JANGAN menebak).
import { stableHashString } from './metrics';

export type CropSeverity = 'none' | 'mild' | 'clear';

export interface CropFinding {
  region: string;
  visible_noise: CropSeverity;
  blur_or_soft: CropSeverity;
  artifacts_or_halos: CropSeverity;
  dust_or_sensor_spots: boolean;
  ai_glitches: string[];
  notes: string;
}

export interface CropInspection {
  crops: CropFinding[];
  confidence: number;
}

export const CROP_INSPECTION_UNAVAILABLE = 'inspeksi detail tidak tersedia';

const SEV: readonly string[] = ['none', 'mild', 'clear'];

/** Seed tetap turunan hash gambar (temperature 0 di sisi pemanggil). */
export function cropSeedFor(pixelHash: string, region: string): number {
  const h = stableHashString(pixelHash + '|' + region);
  return parseInt(h.slice(0, 8), 16) % 1000000;
}

export function buildCropPrompt(region: string): string {
  return [
    'Inspeksi crop 100% (resolusi asli, wilayah: ' + region + '). Laporkan HANYA yang benar-benar terlihat.',
    'Ragu = "none" dan turunkan confidence. Jangan menebak di luar crop.',
    'Format JSON: {"crops": [{"region": string, "visible_noise": "none"|"mild"|"clear",',
    ' "blur_or_soft": "none"|"mild"|"clear", "artifacts_or_halos": "none"|"mild"|"clear",',
    ' "dust_or_sensor_spots": boolean, "ai_glitches": string[], "notes": string}], "confidence": 0..1}',
    'Keluarkan HANYA JSON valid.'
  ].join('\n');
}

function jsonError(message: string): Error {
  return Object.assign(new Error(message), { kind: 'json' });
}

/** Parser ketat — severity tak dikenal → error kind 'json'. */
export function parseCropResponse(raw: string): CropInspection {
  const s = String(raw).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw jsonError('JSON tidak valid');
  let json: unknown;
  try {
    json = JSON.parse(s.slice(a, b + 1));
  } catch {
    throw jsonError('JSON tidak valid');
  }
  if (typeof json !== 'object' || json === null) throw jsonError('JSON tidak valid');
  const o = json as Record<string, unknown>;
  const conf = o.confidence;
  if (typeof conf !== 'number' || !Number.isFinite(conf) || conf < 0 || conf > 1) {
    throw jsonError('confidence di luar 0-1');
  }
  const rawCrops = o.crops;
  if (!Array.isArray(rawCrops)) throw jsonError('crops bukan array');
  const crops: CropFinding[] = rawCrops.map((item) => {
    if (typeof item !== 'object' || item === null) throw jsonError('crop rusak');
    const c = item as Record<string, unknown>;
    for (const k of ['visible_noise', 'blur_or_soft', 'artifacts_or_halos'] as const) {
      if (typeof c[k] !== 'string' || !SEV.includes(c[k] as string)) {
        throw jsonError('severity tidak dikenal: ' + String(c[k]));
      }
    }
    return {
      region: typeof c.region === 'string' ? c.region : '',
      visible_noise: c.visible_noise as CropSeverity,
      blur_or_soft: c.blur_or_soft as CropSeverity,
      artifacts_or_halos: c.artifacts_or_halos as CropSeverity,
      dust_or_sensor_spots: c.dust_or_sensor_spots === true,
      ai_glitches: Array.isArray(c.ai_glitches) ? c.ai_glitches.map((x) => String(x)) : [],
      notes: typeof c.notes === 'string' ? c.notes : ''
    };
  });
  return { crops, confidence: conf };
}

/** Estimasi biaya panggilan inspeksi (teks informatif, bukan angka pasti). */
export function cropCostEstimate(cropCount: number, hasVision: boolean): string {
  if (!hasVision) return CROP_INSPECTION_UNAVAILABLE;
  return 'Estimasi ' + cropCount + ' panggilan vision (crop 512px) — mengikuti tarif model provider Anda.';
}

// Cache sesi (in-memory): pixelHash → inspeksi.
const cropCache = new Map<string, CropInspection>();

export function getCropCache(pixelHash: string): CropInspection | undefined {
  return cropCache.get(pixelHash);
}

export function setCropCache(pixelHash: string, inspection: CropInspection): void {
  if (cropCache.size > 200) cropCache.clear();
  cropCache.set(pixelHash, inspection);
}

export function clearCropCache(): void {
  cropCache.clear();
}
