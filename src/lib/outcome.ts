// Penilaian risiko per platform — deterministik dari metrik + observation + cek keras.
// Semua keluaran adalah ESTIMASI. Tidak ada persen "peluang lolos" dan tidak ada klaim
// "dijamin lolos". Label Shutterstock memakai kalimat persis:
// "Data licensing saja (tidak masuk marketplace)" — JANGAN PERNAH kata approved/disetujui.
import { QUALITY_THRESHOLDS } from './quality/thresholds';
import { qualityScoreOf, type QualityMetrics } from './quality/metrics';
import type { Observation } from './observation';
import type { ValidationResult } from './validate';

export type RiskLevel = 'rendah' | 'sedang' | 'tinggi' | 'tidak diketahui';

export type AdobeCause =
  | 'SIMILAR_CONTENT'
  | 'QUALITY_FOCUS'
  | 'QUALITY_EXPOSURE'
  | 'QUALITY_NOISE_ARTIFACTS'
  | 'QUALITY_COLOR'
  | 'QUALITY_OVEREDIT'
  | 'IP_RELEASE';

export interface CauseAssessment {
  cause: AdobeCause;
  ruleId: string;
  level: RiskLevel;
  evidence: string[];
  fix: string;
}

export interface AdobeAssessment {
  perCause: CauseAssessment[];
  overall: RiskLevel;
  topCauses: AdobeCause[];
  qualityScore: number;
}

export type ShutterstockEstimate =
  | 'Marketplace'
  | 'Data licensing saja (tidak masuk marketplace)'
  | 'Kemungkinan ditolak';

export interface ShutterstockAssessment {
  estimate: ShutterstockEstimate;
  reasons: string[];
  evidence: string[];
  verifyNote: string | null;
}

export interface OutcomeContext {
  hardErrors: number;
  hardErrorSummary: string[];
  ipVisible: boolean;
  releaseNeeded: boolean;
  releaseMarked: boolean;
  editorial: boolean;
  commercial: boolean;
  inSimilarCluster: boolean;
  similarIsBest: boolean;
  conceptSaturated: boolean;
  cropFindings: CropSignal[];
  belowMinResolution: { adobe: boolean; shutterstock: boolean };
}

export interface CropSignal {
  region: string;
  visible_noise: 'none' | 'mild' | 'clear';
  blur_or_soft: 'none' | 'mild' | 'clear';
  artifacts_or_halos: 'none' | 'mild' | 'clear';
  dust_or_sensor_spots: boolean;
  ai_glitches: string[];
}

const T = QUALITY_THRESHOLDS;
const num = (d: { value: number }): number => d.value;

function lvl(high: boolean, mid: boolean): RiskLevel {
  if (high) return 'tinggi';
  if (mid) return 'sedang';
  return 'rendah';
}

function fmtPct(x: number): string {
  return (Math.round(x * 10) / 10).toString() + '%';
}

/** Adobe: 7 risiko terpisah. Hasil crop-AI hanya boleh MENAIKKAN level. */
export function assessAdobe(
  m: QualityMetrics,
  obs: Observation,
  ctx: OutcomeContext
): AdobeAssessment {
  const perCause: CauseAssessment[] = [];

  // SIMILAR_CONTENT — dari sinyal internal batch saja; koleksi platform = tidak diketahui.
  const similarLevel: RiskLevel = ctx.inSimilarCluster ? (ctx.similarIsBest ? 'sedang' : 'tinggi') : 'tidak diketahui';
  perCause.push({
    cause: 'SIMILAR_CONTENT',
    ruleId: 'ADOBE_SIMILAR',
    level: similarLevel,
    evidence: ctx.inSimilarCluster
      ? [ctx.similarIsBest ? 'Frame mirip batch lain; kandidat terbaik klaster.' : 'Frame mirip batch lain; bukan kandidat terbaik — risiko similar tinggi.']
      : ['Kemiripan terhadap koleksi Adobe tidak diketahui (tidak bisa dihitung lokal).'],
    fix: 'Hanya kirim kandidat terbaik per klaster, atau bedakan nyata (sudut, subjek, komposisi).'
  });

  const focusHigh = m.sharpnessGlobal < num(T.sharpGlobalLow) || m.sharpTileFraction < num(T.sharpTileFracLow);
  const focusMid = m.sharpnessGlobal < num(T.sharpGlobalMid) || m.sharpTileFraction < num(T.sharpTileFracMid);
  const focusLevel = lvl(focusHigh, focusMid);
  const focusEv = [
    'varians Laplacian global ' + Math.round(m.sharpnessGlobal) + ', fraksi tile tajam ' + fmtPct(m.sharpTileFraction * 100)
  ];
  perCause.push({
    cause: 'QUALITY_FOCUS',
    ruleId: 'ADOBE_QUALITY_FOCUS',
    level: focusLevel,
    evidence: focusEv,
    fix: 'Periksa fokus 100%, pertajam seperlunya tanpa halo, hindari penajaman berlebih.'
  });

  const expHigh = m.highlightClipPct >= num(T.highlightClipHigh) || m.shadowClipPct >= num(T.shadowClipHigh);
  const expMid =
    m.highlightClipPct >= num(T.highlightClipMid) ||
    m.shadowClipPct >= num(T.shadowClipMid) ||
    m.meanLuma < num(T.meanLumaLow) ||
    m.meanLuma > num(T.meanLumaHigh);
  perCause.push({
    cause: 'QUALITY_EXPOSURE',
    ruleId: 'ADOBE_QUALITY_EXPOSURE',
    level: lvl(expHigh, expMid),
    evidence: [
      'highlight terpotong ' + fmtPct(m.highlightClipPct) + ', shadow terpotong ' + fmtPct(m.shadowClipPct) + ', rata-rata luminans ' + Math.round(m.meanLuma)
    ],
    fix: 'Pulihkan highlight/shadow, sesuaikan eksposur; hindari highlight putih total.'
  });

  let noiseLevel = lvl(m.noiseEstimate >= num(T.noiseHigh), m.noiseEstimate >= num(T.noiseMid));
  const noiseEv = ['estimasi noise area datar ' + (Math.round(m.noiseEstimate * 100) / 100) + ', blokiness JPEG ' + (Math.round(m.jpegBlockiness * 100) / 100)];
  // Crop AI hanya menaikkan.
  for (const c of ctx.cropFindings) {
    if (c.visible_noise === 'clear' || c.artifacts_or_halos === 'clear' || c.dust_or_sensor_spots) {
      if (noiseLevel !== 'tinggi') {
        noiseLevel = 'tinggi';
        noiseEv.push('crop ' + c.region + ': terlihat jelas pada inspeksi detail 100%');
      }
    } else if ((c.visible_noise === 'mild' || c.artifacts_or_halos === 'mild') && noiseLevel === 'rendah') {
      noiseLevel = 'sedang';
      noiseEv.push('crop ' + c.region + ': terlihat ringan pada inspeksi detail');
    }
  }
  perCause.push({
    cause: 'QUALITY_NOISE_ARTIFACTS',
    ruleId: 'ADOBE_QUALITY_NOISE',
    level: noiseLevel,
    evidence: noiseEv,
    fix: 'Kurangi noise tanpa menghilangkan detail, ekspor JPEG kualitas tinggi, bersihkan bercak debu.'
  });

  const isPhoto = obs.media_type === 'photo';
  const wb = m.wbDeviation ?? 0;
  const satHigh = m.meanSaturation >= num(T.satMeanVeryHigh) || m.verySaturatedPct >= num(T.satPixelHigh);
  const satMid = m.meanSaturation >= num(T.satMeanHigh) || m.verySaturatedPct >= num(T.satPixelMid);
  const wbHigh = isPhoto && wb >= num(T.wbHigh);
  const wbMid = isPhoto && wb >= num(T.wbMid);
  perCause.push({
    cause: 'QUALITY_COLOR',
    ruleId: 'ADOBE_QUALITY_COLOR',
    level: isPhoto ? lvl(satHigh || wbHigh, satMid || wbMid) : lvl(satHigh, satMid),
    evidence: isPhoto
      ? ['saturasi rata-rata ' + (Math.round(m.meanSaturation * 100) / 100) + ', piksel sangat jenuh ' + fmtPct(m.verySaturatedPct) + ', deviasi WB ' + (Math.round(wb * 100) / 100)]
      : ['saturasi rata-rata ' + (Math.round(m.meanSaturation * 100) / 100) + ' (WB dilewati untuk ' + obs.media_type + ')'],
    fix: 'Netralkan white balance, turunkan saturasi yang tidak wajar.'
  });

  const overHigh = m.jpegBlockiness >= num(T.blockinessHigh);
  const overMid = m.jpegBlockiness >= num(T.blockinessMid);
  let overLevel = lvl(overHigh, overMid);
  const overEv = ['blokiness ' + (Math.round(m.jpegBlockiness * 100) / 100)];
  for (const c of ctx.cropFindings) {
    if (c.artifacts_or_halos === 'clear' && overLevel !== 'tinggi') {
      overLevel = 'tinggi';
      overEv.push('crop ' + c.region + ': halo/artefak jelas');
    }
  }
  perCause.push({
    cause: 'QUALITY_OVEREDIT',
    ruleId: 'ADOBE_QUALITY_OVEREDIT',
    level: overLevel,
    evidence: overEv,
    fix: 'Ulangi edit dari RAW dengan penajaman/clarity moderat; hindari halo tepi.'
  });

  const ipLevel: RiskLevel = ctx.ipVisible && ctx.commercial ? 'tinggi' : ctx.releaseNeeded && !ctx.releaseMarked ? 'sedang' : 'rendah';
  perCause.push({
    cause: 'IP_RELEASE',
    ruleId: 'ADOBE_MIN_RESOLUTION',
    level: ipLevel,
    evidence: ctx.ipVisible
      ? ['merek/teks/properti terlihat menurut observation; siapkan release / samarkan']
      : ['tidak ada IP pihak ketiga yang terdeteksi pada observation'],
    fix: 'Samarkan merek, siapkan model/property release, jawab pertanyaan recognizable di portal.'
  });

  // Crop blur hanya menaikkan FOCUS.
  const focusEntry = perCause.find((p) => p.cause === 'QUALITY_FOCUS');
  if (focusEntry) {
    for (const c of ctx.cropFindings) {
      if (c.blur_or_soft === 'clear' && focusEntry.level !== 'tinggi') {
        focusEntry.level = 'tinggi';
        focusEntry.evidence.push('crop ' + c.region + ': blur jelas pada inspeksi detail');
      }
    }
    if (focusLevel === 'rendah' && focusEntry.level === 'rendah') {
      const mild = ctx.cropFindings.some((c) => c.blur_or_soft === 'mild');
      if (mild) {
        focusEntry.level = 'sedang';
        focusEntry.evidence.push('inspeksi detail: kelembutan ringan terlihat');
      }
    }
  }

  // Resolusi minimum: di bawah minimum = error pemblokir (level tinggi + evidence).
  if (ctx.belowMinResolution.adobe && focusEntry) {
    focusEntry.level = 'tinggi';
    focusEntry.evidence.push('resolusi ' + m.width + 'x' + m.height + ' di bawah minimum Adobe');
  }

  const order: Record<RiskLevel, number> = { tinggi: 3, sedang: 2, rendah: 1, 'tidak diketahui': 0 };
  let overall: RiskLevel = 'rendah';
  for (const p of perCause) {
    if (p.level === 'tidak diketahui') continue;
    if (order[p.level] > order[overall]) overall = p.level;
  }
  const topCauses = perCause.filter((p) => p.level === overall && overall !== 'rendah').map((p) => p.cause);
  return { perCause, overall, topCauses, qualityScore: qualityScoreOf(m) };
}

// Batas keras kualitas Shutterstock: di bawah minimum menurut metrik/inspeksi.
function severeQuality(m: QualityMetrics, crops: CropSignal[]): boolean {
  const clearCount = crops.filter(
    (c) => c.visible_noise === 'clear' || c.blur_or_soft === 'clear' || c.artifacts_or_halos === 'clear' || c.dust_or_sensor_spots
  ).length;
  return (
    m.sharpnessGlobal < num(T.sharpGlobalLow) ||
    m.highlightClipPct >= num(T.highlightClipHigh) ||
    m.shadowClipPct >= num(T.shadowClipHigh) ||
    m.noiseEstimate >= num(T.noiseHigh) ||
    m.jpegBlockiness >= num(T.blockinessHigh) ||
    clearCount >= 2
  );
}

function belowMinimum(m: QualityMetrics, crops: CropSignal[]): boolean {
  const mild =
    m.sharpnessGlobal < num(T.sharpGlobalMid) ||
    m.highlightClipPct >= num(T.highlightClipMid) ||
    m.shadowClipPct >= num(T.shadowClipMid) ||
    m.noiseEstimate >= num(T.noiseMid) ||
    m.jpegBlockiness >= num(T.blockinessMid) ||
    m.meanSaturation >= num(T.satMeanHigh) ||
    crops.some((c) => c.visible_noise === 'mild' || c.blur_or_soft === 'mild' || c.artifacts_or_halos === 'mild');
  return mild;
}

/**
 * Shutterstock tiga arah:
 * - error cek keras / IP komersial / release tanpa penanda / kualitas parah → Kemungkinan ditolak
 * - legal/metadata lolos tapi kualitas di bawah minimum → Data licensing saja (tidak masuk marketplace)
 * - selain itu → Marketplace (risiko rendah di semua).
 */
export function assessShutterstock(
  m: QualityMetrics,
  obs: Observation,
  ctx: OutcomeContext,
  validation: ValidationResult
): ShutterstockAssessment {
  const evidence: string[] = [];
  const reasons: string[] = [];
  void obs;

  if (ctx.belowMinResolution.shutterstock) {
    reasons.push('Resolusi di bawah minimum Shutterstock (' + m.width + 'x' + m.height + ').');
    evidence.push('megapiksel ' + (Math.round(m.megapixels * 100) / 100));
    return { estimate: 'Kemungkinan ditolak', reasons, evidence, verifyNote: null };
  }
  if (validation.errors.length > 0) {
    reasons.push('Ada ' + validation.errors.length + ' error cek keras metadata.');
    evidence.push(...validation.errors.slice(0, 3).map((e) => e.rule + ': ' + e.message));
    return { estimate: 'Kemungkinan ditolak', reasons, evidence, verifyNote: null };
  }
  if (ctx.ipVisible && ctx.commercial && !ctx.editorial) {
    reasons.push('Merek/teks terlihat untuk konten komersial.');
    evidence.push('observation: merek/teks terlihat');
    return { estimate: 'Kemungkinan ditolak', reasons, evidence, verifyNote: null };
  }
  if (ctx.releaseNeeded && !ctx.releaseMarked) {
    reasons.push('Kebutuhan release tanpa penanda release.');
    evidence.push('wajah dikenali / properti privat menurut observation');
    return { estimate: 'Kemungkinan ditolak', reasons, evidence, verifyNote: null };
  }
  if (severeQuality(m, ctx.cropFindings)) {
    reasons.push('Masalah kualitas parah menurut metrik/inspeksi.');
    evidence.push(
      'tajam ' + Math.round(m.sharpnessGlobal) + ', highlight ' + fmtPct(m.highlightClipPct) + ', noise ' + (Math.round(m.noiseEstimate * 100) / 100)
    );
    return { estimate: 'Kemungkinan ditolak', reasons, evidence, verifyNote: null };
  }
  if (belowMinimum(m, ctx.cropFindings)) {
    reasons.push('Legal/kepatuhan/metadata lolos tetapi kualitas di bawah minimum.');
    evidence.push(
      'tajam ' + Math.round(m.sharpnessGlobal) + ', highlight ' + fmtPct(m.highlightClipPct) + ', shadow ' + fmtPct(m.shadowClipPct) + ', noise ' + (Math.round(m.noiseEstimate * 100) / 100)
    );
    // TODO [VERIFIKASI]: laporan komunitas — konten mirip/rendah potensi jual dengan
    // kualitas wajar juga bisa masuk Data Catalog. Hanya catatan, bukan aturan keras.
    const verifyNote =
      ctx.inSimilarCluster || ctx.conceptSaturated
        ? 'Catatan [VERIFIKASI]: dilaporkan bisa masuk data licensing walau kualitas wajar bila similarity/kejenuhan tinggi.'
        : null;
    return { estimate: 'Data licensing saja (tidak masuk marketplace)', reasons, evidence, verifyNote };
  }
  reasons.push('Risiko rendah di semua: legal, metadata, dan kualitas memenuhi minimum.');
  evidence.push('tajam ' + Math.round(m.sharpnessGlobal) + ', noise ' + (Math.round(m.noiseEstimate * 100) / 100));
  return { estimate: 'Marketplace', reasons, evidence, verifyNote: null };
}

/**
 * Juri tidak boleh menurunkan risiko deterministik: badge juri yang lebih baik dari
 * risiko metrik/cek keras dinaikkan ke PERLU_DITINJAU minimal (tidak pernah LOLOS).
 * Risiko tinggi deterministik tidak bisa dianulir juri.
 */
export function clampJuryBadge(
  juryBadge: 'LOLOS' | 'LOLOS_DENGAN_CATATAN' | 'TIDAK_LOLOS' | 'PERLU_DITINJAU',
  deterministicWorst: RiskLevel,
  hardErrors: number
): 'LOLOS' | 'LOLOS_DENGAN_CATATAN' | 'TIDAK_LOLOS' | 'PERLU_DITINJAU' {
  if (hardErrors > 0) return 'TIDAK_LOLOS';
  if (deterministicWorst === 'tinggi') {
    if (juryBadge === 'LOLOS' || juryBadge === 'LOLOS_DENGAN_CATATAN') return 'PERLU_DITINJAU';
  }
  return juryBadge;
}
