// Kategori resmi + fuzzy match — port setia dari legacy/js/categories.js.
// Daftar & nomor kini dari platform-rules.ts (satu sumber kebenaran); nama tampilan
// Adobe memakai "Landscapes" (CSV memakai angka 11 — perbedaan nama bukan celah).
import { ADOBE_CATEGORIES as ADOBE_ENTRIES, adobeNumberByLabel, SHUTTERSTOCK_CATEGORIES as SS_ENTRIES } from './platform-rules';
import type { Platform } from './types';

export const ADOBE_CATEGORIES = ADOBE_ENTRIES.map((c) => c.label);

// Nomor kategori untuk kolom Category di CSV Adobe (bukan nama).
// Urutan nomor mengikuti daftar resmi Adobe; verifikasi dengan impor CSV uji ke portal Adobe.
export const ADOBE_CATEGORY_IDS: Record<string, number> = adobeNumberByLabel();

export const SHUTTERSTOCK_CATEGORIES = SS_ENTRIES.map((c) => c.label);

export function getCategories(platform: Platform): readonly string[] {
  return platform === 'adobe' ? ADOBE_CATEGORIES : SHUTTERSTOCK_CATEGORIES;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const squish = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

// exact → contains → shared word → nearest spelling; null ketika tidak ada yang cukup dekat
export function normCat(value: unknown, list: readonly string[]): string | null {
  if (typeof value !== 'string') return null;
  const low = value.trim().toLowerCase();
  if (!low) return null;

  const exact = list.find((c) => c.toLowerCase() === low);
  if (exact) return exact;

  const loose = list.find((c) => {
    const l = c.toLowerCase();
    return l.includes(low) || low.includes(l);
  });
  if (loose) return loose;

  const toks = low.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (toks.length) {
    let best = '';
    let score = 0;
    for (const c of list) {
      const ct = c.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      const hit = toks.filter((t) => ct.some((x) => x === t || x.startsWith(t) || t.startsWith(x))).length;
      const s = hit / toks.length;
      if (s > score) { score = s; best = c; }
    }
    if (score >= 0.5) return best;
  }

  const needle = squish(low);
  let best = '';
  let dist = Infinity;
  for (const c of list) {
    const d = levenshtein(needle, squish(c));
    if (d < dist) { dist = d; best = c; }
  }
  if (!best) return null;
  const span = Math.max(needle.length, squish(best).length);
  return dist <= Math.max(2, Math.round(span * 0.45)) ? best : null;
}
