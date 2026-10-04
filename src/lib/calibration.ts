// Kalibrasi dari hasil nyata — simpan lokal bersama snapshot metrik + prediksi.
// Hanya MEREKOMENDASIKAN penyesuaian ambang (diff + konfirmasi), tidak mengubah otomatis.
// Sampel <20 per platform → peringatan "sampel terlalu sedikit".
import { CALIBRATION_MIN_SAMPLES } from './quality/thresholds';
import type { QualityMetrics } from './quality/metrics';
import type { AdobeAssessment, ShutterstockAssessment } from './outcome';

export type AdobeActual =
  | 'Diterima'
  | 'Ditolak-Similar content'
  | 'Ditolak-Quality'
  | 'Ditolak-IP'
  | 'Ditolak-lainnya';

export type ShutterstockActual =
  | 'Marketplace'
  | 'Data licensing saja'
  | 'Ditolak';

export interface CalibrationSample {
  id: string;
  date: string;
  platform: 'adobe' | 'shutterstock';
  predictedAdobe: AdobeAssessment['overall'] | null;
  predictedShutterstock: ShutterstockAssessment['estimate'] | null;
  actualAdobe: AdobeActual | null;
  actualShutterstock: ShutterstockActual | null;
  metrics: Pick<QualityMetrics, 'sharpnessGlobal' | 'noiseEstimate' | 'highlightClipPct' | 'shadowClipPct' | 'meanSaturation' | 'jpegBlockiness' | 'megapixels'>;
}

const LS_KEY = 'stockmeta_calibration';

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadSamples(): CalibrationSample[] {
  try {
    const raw = ls()?.getItem(LS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CalibrationSample[]) : [];
  } catch {
    return [];
  }
}

export function saveSample(s: CalibrationSample): CalibrationSample[] {
  const list = loadSamples().filter((x) => x.id !== s.id);
  list.unshift(s);
  try {
    ls()?.setItem(LS_KEY, JSON.stringify(list.slice(0, 500)));
  } catch { /* diabaikan */ }
  return list;
}

export function clearSamples(): void {
  try {
    ls()?.removeItem(LS_KEY);
  } catch { /* diabaikan */ }
}

export function exportCalibration(): string {
  return JSON.stringify(loadSamples(), null, 2);
}

export function importCalibration(json: string): number {
  let arr: unknown = null;
  try {
    arr = JSON.parse(json);
  } catch {
    throw new Error('JSON kalibrasi tidak valid');
  }
  if (!Array.isArray(arr)) throw new Error('JSON kalibrasi harus array');
  try {
    ls()?.setItem(LS_KEY, JSON.stringify((arr as CalibrationSample[]).slice(0, 500)));
  } catch { /* diabaikan */ }
  return (arr as unknown[]).length;
}

export interface ConfusionCell {
  predicted: string;
  actual: string;
  count: number;
}

/** Matriks prediksi vs hasil nyata per platform. */
export function confusionMatrix(platform: 'adobe' | 'shutterstock'): { cells: ConfusionCell[]; samples: number; tooFew: boolean } {
  const rows = loadSamples().filter((s) => s.platform === platform);
  const map = new Map<string, number>();
  for (const s of rows) {
    const p = platform === 'adobe' ? String(s.predictedAdobe ?? '?') : String(s.predictedShutterstock ?? '?');
    const a = platform === 'adobe' ? String(s.actualAdobe ?? '?') : String(s.actualShutterstock ?? '?');
    if (a === '?' || a === 'null') continue;
    map.set(p + '||' + a, (map.get(p + '||' + a) ?? 0) + 1);
  }
  const cells: ConfusionCell[] = [...map.entries()].map(([k, count]) => {
    const [predicted, actual] = k.split('||');
    return { predicted, actual, count };
  });
  return { cells, samples: rows.length, tooFew: rows.length < CALIBRATION_MIN_SAMPLES };
}

/** Metrik paling berkorelasi dengan penolakan: selisih rata-rata (tolak − terima). */
export function rejectionCorrelation(platform: 'adobe' | 'shutterstock'): { metric: string; delta: number }[] {
  const rows = loadSamples().filter((s) => s.platform === platform);
  const isReject = (s: CalibrationSample): boolean =>
    platform === 'adobe'
      ? s.actualAdobe !== null && s.actualAdobe !== 'Diterima'
      : s.actualShutterstock !== null && s.actualShutterstock !== 'Marketplace';
  const keys = ['sharpnessGlobal', 'noiseEstimate', 'highlightClipPct', 'shadowClipPct', 'meanSaturation', 'jpegBlockiness'] as const;
  const out: { metric: string; delta: number }[] = [];
  for (const k of keys) {
    const rej = rows.filter(isReject).map((s) => s.metrics[k]);
    const acc = rows.filter((s) => !isReject(s)).map((s) => s.metrics[k]);
    if (!rej.length || !acc.length) {
      out.push({ metric: k, delta: 0 });
      continue;
    }
    const mean = (a: number[]): number => a.reduce((x, y) => x + y, 0) / a.length;
    out.push({ metric: k, delta: mean(rej) - mean(acc) });
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

export interface ThresholdRecommendation {
  text: string;
  diff: string;
}

/**
 * Rekomendasi penyesuaian ambang (ditampilkan + minta konfirmasi; TIDAK diterapkan
 * otomatis). Heuristik sederhana berbasis arah korelasi + tingkat false-negative.
 */
export function recommendThresholds(platform: 'adobe' | 'shutterstock'): ThresholdRecommendation[] {
  const { samples, tooFew } = confusionMatrix(platform);
  if (tooFew || samples === 0) {
    return [{ text: 'Sampel terlalu sedikit (' + samples + ') — kumpulkan minimal ' + CALIBRATION_MIN_SAMPLES + ' per platform.', diff: '' }];
  }
  const corr = rejectionCorrelation(platform);
  const top = corr[0];
  if (!top || Math.abs(top.delta) < 1e-9) return [{ text: 'Belum ada pola jelas — lanjutkan mencatat hasil nyata.', diff: '' }];
  return [{
    text: 'Metrik "' + top.metric + '" paling berkorelasi dengan penolakan (Δ ' + (Math.round(top.delta * 100) / 100) + '). Pertimbangkan menggeser ambang terkait dan uji ulang.',
    diff: '~ ' + top.metric + ': arah ' + (top.delta > 0 ? 'naikkan ambang waspada' : 'turunkan ambang waspada')
  }];
}
