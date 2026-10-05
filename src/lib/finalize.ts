// M33 — finalisasi hasil model: terapkan theme_canonical/fit, pasca-proses
// keyword bersumber (verifikasi deterministik), kapitalisasi judul, putuskan
// perluasan, dan terapkan hasil Tahap D. Dipakai useBatch (total maksimal
// 3 panggilan/frame).
import {
  KEYWORD_MIN_TARGET,
  MIN_KEYWORDS_ADOBE,
  MIN_KEYWORDS_SHUTTER
} from './limits';
import {
  cleanAiTitle,
  normalizeLegacyKeywords,
  processSourcedKeywords,
  type KeywordSrc,
  type ProcessItem
} from './keywordGroups';
import type { ParsedMetadata } from './prompt';
import type { Platform } from './types';

export function minKeywords(platform: Platform): number {
  return platform === 'adobe' ? MIN_KEYWORDS_ADOBE : MIN_KEYWORDS_SHUTTER;
}

export interface FinalizeResult {
  meta: ParsedMetadata;
  removed: string[];
  themeMismatch: boolean;
  /** Final {kata, src, rel?, kind?} — untuk live-test dan perluasan. */
  items: ProcessItem[];
  srcCounts: Record<KeywordSrc, number>;
  /** Faset sumber yang belum terwakili di hasil final. */
  facetsMissing: string[];
}

/** Faset untuk catatan perluasan (M33: subjek, kostum, pola, gaya, suasana, usage). */
function missingFacets(
  srcCounts: Record<KeywordSrc, number>,
  themeFit: boolean
): string[] {
  const out: string[] = [];
  if (srcCounts.visible === 0) out.push('subjek');
  if (srcCounts.attribute === 0) out.push('kostum/pola/gaya');
  if (srcCounts.synonym === 0) out.push('sinonim');
  if (themeFit && srcCounts.theme === 0) out.push('tema');
  if (srcCounts.usage === 0) out.push('usage');
  return out;
}

/**
 * Terapkan pasca-proses deterministik ke hasil model:
 * - sourcedKeywords (format M32/M33) → verifikasi src terhadap pengamatan;
 * - keywords flat (respons/sesi lama) → normalisasi ringan tanpa grounding;
 * - theme_fit false (atau true tanpa evidence → sudah false di parser) →
 *   tema dibuang, themeMismatch true;
 * - judul AI dikapitalisasi tanpa koma; deskripsi dikapitalisasi.
 */
export function finalizeModelOutput(
  meta: ParsedMetadata,
  platform: Platform,
  opts?: { phraseMax?: number; wordsMax?: number; phrase3Max?: number }
): FinalizeResult {
  const themeFit = meta.themeFit ?? true;
  const themeMismatch = themeFit === false;
  const out: ParsedMetadata = { ...meta };

  let items: ProcessItem[] = [];
  let removed: string[] = [];
  const srcCounts: Record<KeywordSrc, number> = {
    visible: 0,
    attribute: 0,
    synonym: 0,
    theme: 0,
    usage: 0
  };

  if (meta.sourcedKeywords?.length) {
    const obs = meta.observation;
    const pp = processSourcedKeywords(
      {
        sourced: meta.sourcedKeywords,
        obs,
        canonical: meta.themeCanonical ?? '',
        themeFit,
        themeEvidence: meta.themeEvidence ?? '',
        mediaType: obs?.media_type ?? obs?.medium ?? '',
        platform,
        titleText: meta.title ?? meta.description ?? ''
      },
      opts
    );
    items = pp.items;
    removed = pp.removed;
    Object.assign(srcCounts, pp.srcCounts);
    out.keywords = pp.keywords;
    delete out.sourcedKeywords;
  } else {
    const leg = normalizeLegacyKeywords(meta.keywords ?? [], platform);
    out.keywords = leg.keywords;
    removed = leg.removed;
  }

  if (platform === 'adobe' && out.title) out.title = cleanAiTitle(out.title);
  if (platform === 'shutterstock' && out.description) {
    const d = out.description.replace(/\s+/g, ' ').trim();
    out.description = d ? d.charAt(0).toUpperCase() + d.slice(1) : d;
  }
  if (themeMismatch) out.themeFit = false;

  return {
    meta: out,
    removed,
    themeMismatch,
    items,
    srcCounts,
    facetsMissing: missingFacets(srcCounts, themeFit)
  };
}

/** true bila hasil final di bawah target 30 → satu putaran perluasan. */
export function needsExpansion(meta: ParsedMetadata): boolean {
  return (meta.keywords ?? []).length < KEYWORD_MIN_TARGET;
}

/** true bila ada keyword berisiko (synonym/theme/usage) → Tahap D bila anggaran ada. */
export function hasRiskyKeywords(items: ProcessItem[]): boolean {
  return items.some((x) => x.src === 'synonym' || x.src === 'theme' || x.src === 'usage');
}

/**
 * Instruksi perluasan (+verifikasi, M33 Fase 5): daftar keyword yang sudah ada
 * + faset yang belum terwakili; minta kata TUNGGAL tambahan hanya dari sumber
 * sah, sekaligus periksa daftar lama (jangan ulangi yang salah).
 */
export function expansionNote(existing: string[], missing: string[], need: number): string {
  const have = existing.length;
  const facetPart = missing.length
    ? ` Faset yang belum terwakili: ${missing.join(', ')}.`
    : '';
  const existingPart = have ? ` Sudah ada (${have}): ${existing.slice(0, 45).join(', ')}.` : '';
  return `Perluasan keyword: baru ${have}, target ${need}.${existingPart}${facetPart}`
    + ' Tambahkan kata TUNGGAL bahasa Inggris yang belum ada di daftar (frasa dua kata'
    + ' baku maksimal 8, tiga kata hanya nama objek pengamatan)'
    + ' HANYA dari sumber yang sah (visible/attribute yang tertulis di pengamatan,'
    + ' synonym dengan "of" dan "rel" yang benar, theme abstrak bila cocok, usage).'
    + ' Periksa juga daftar lama: JANGAN ulangi kata yang salah (jenis/benda berbeda,'
    + ' makhluk sebagai konsep tema, kata latar/anatomi).'
    + ' DILARANG kata latar, kata karangan, dan kata pengisi generik.';
}

/**
 * M33 Fase 2c — terapkan hasil Tahap D: buang keyword final yang tercantum
 * di `remove` (cocok tanpa peduli huruf). Mengembalikan items/keywords baru +
 * yang dibuang (untuk dilog).
 */
export function applyStageRemovals(
  items: ProcessItem[],
  remove: string[]
): { items: ProcessItem[]; removed: string[] } {
  const drop = new Set((remove ?? []).map((w) => String(w ?? '').toLowerCase()));
  const kept: ProcessItem[] = [];
  const removed: string[] = [];
  for (const it of items) {
    if (drop.has(it.k.toLowerCase())) removed.push(it.k);
    else kept.push(it);
  }
  return { items: kept, removed };
}
