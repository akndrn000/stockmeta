// Kata kunci: parse input bebas → daftar chip, dedupe case-insensitive, potong di batas max.
// Murni tanpa DOM — dipakai KeywordEditor (M7) dan parser hasil model (M8).
import { MAX_KEYWORDS } from './limits';

/** Pecah teks berdasarkan koma / baris baru, trim, buang kosong. */
export function parseKeywordInput(text: string): string[] {
  return text
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface AddKeywordsResult {
  list: string[];
  addedCount: number;
  skippedDuplicate: number;
  skippedOverLimit: number;
}

/** Tambah incoming ke current: dedupe tanpa peduli huruf besar/kecil, potong di max. */
export function addKeywords(current: string[], incoming: string[], max = MAX_KEYWORDS): AddKeywordsResult {
  const list = [...current];
  const seen = new Set(list.map((k) => k.toLowerCase()));
  let addedCount = 0;
  let skippedDuplicate = 0;
  let skippedOverLimit = 0;
  for (const raw of incoming) {
    const kw = raw.trim();
    if (!kw) continue;
    const low = kw.toLowerCase();
    if (seen.has(low)) { skippedDuplicate++; continue; }
    if (list.length >= max) { skippedOverLimit++; continue; }
    seen.add(low);
    list.push(kw);
    addedCount++;
  }
  return { list, addedCount, skippedDuplicate, skippedOverLimit };
}

export function removeKeyword(list: string[], index: number): string[] {
  return list.filter((_, i) => i !== index);
}

export function keywordsToPlain(list: string[]): string {
  return list.join(', ');
}
