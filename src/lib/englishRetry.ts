// Pipeline bahasa Inggris Fase 3 — fungsi murni + pembungkus retry tepat satu kali.
// Aturan: judul/deskripsi terdeteksi Indonesia ATAU >20% keyword Indonesia
// → regenerasi SATU kali dengan instruksi koreksi bahasa.
import { INDONESIAN_KEYWORD_RATIO_LIMIT, indonesianKeywordRatio, looksIndonesian } from './language';
import type { ParsedMetadata } from './prompt';
import type { Platform } from './types';

export function textForPlatform(meta: ParsedMetadata, platform: Platform): string {
  return platform === 'adobe' ? (meta.title ?? '') : (meta.description ?? '');
}

/** true bila hasil perlu regenerasi bahasa (tepat satu kali). */
export function needsEnglishRetry(meta: ParsedMetadata, platform: Platform): boolean {
  if (looksIndonesian(textForPlatform(meta, platform))) return true;
  const kws = [...(meta.keywords ?? []), ...(meta.sourcedKeywords ?? []).map((s) => s.k)];
  if (kws.length && indonesianKeywordRatio(kws) > INDONESIAN_KEYWORD_RATIO_LIMIT) return true;
  return false;
}

/**
 * Jalankan generate sekali, cek bahasa, bila perlu ulangi TEPAT satu kali
 * dengan languageFix=true. `generate` menerima flag languageFix.
 * Mengembalikan hasil akhir + jumlah pemanggilan (1 atau 2) untuk tes/token audit.
 */
export async function generateWithEnglishRetry(
  generate: (languageFix: boolean) => Promise<ParsedMetadata>,
  platform: Platform
): Promise<{ meta: ParsedMetadata; calls: number; retried: boolean }> {
  const first = await generate(false);
  if (!needsEnglishRetry(first, platform)) return { meta: first, calls: 1, retried: false };
  const second = await generate(true);
  return { meta: second, calls: 2, retried: true };
}
