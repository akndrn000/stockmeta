// Kategori resmi + fuzzy match — port setia dari legacy/js/categories.js.
import type { Platform } from './types';

export const ADOBE_CATEGORIES = ['Animals', 'Buildings and Architecture', 'Business', 'Drinks',
  'The Environment', 'States of Mind', 'Food', 'Graphic Resources', 'Hobbies and Leisure',
  'Industry', 'Landscape', 'Lifestyle', 'People', 'Plants and Flowers', 'Culture and Religion',
  'Science', 'Social Issues', 'Sports', 'Technology', 'Transport', 'Travel'] as const;

// Nomor kategori untuk kolom Category di CSV Adobe (bukan nama).
// Urutan nomor mengikuti daftar resmi Adobe; verifikasi dengan impor CSV uji ke portal Adobe.
export const ADOBE_CATEGORY_IDS: Record<string, number> = {
  Animals: 1,
  'Buildings and Architecture': 2,
  Business: 3,
  Drinks: 4,
  'The Environment': 5,
  'States of Mind': 6,
  Food: 7,
  'Graphic Resources': 8,
  'Hobbies and Leisure': 9,
  Industry: 10,
  Landscape: 11,
  Lifestyle: 12,
  People: 13,
  'Plants and Flowers': 14,
  'Culture and Religion': 15,
  Science: 16,
  'Social Issues': 17,
  Sports: 18,
  Technology: 19,
  Transport: 20,
  Travel: 21
};

export const SHUTTERSTOCK_CATEGORIES = ['Abstract', 'Animals/Wildlife', 'Arts', 'Backgrounds/Textures',
  'Beauty/Fashion', 'Buildings/Landmarks', 'Business/Finance', 'Celebrities', 'Education',
  'Food and Drink', 'Healthcare/Medical', 'Holidays', 'Industrial', 'Interiors', 'Miscellaneous',
  'Nature', 'Objects', 'Parks/Outdoor', 'People', 'Religion', 'Science', 'Signs/Symbols',
  'Sports/Recreation', 'Technology', 'Transportation', 'Vintage'] as const;

// Shutterstock wajib punya TEPAT dua kategori berbeda (Fase 1) — SATU sumber angka untuk
// prompt, parser, validasi, dan teks UI. Jangan tulis literal 2 di copy/logika lain.
export const SS_CATEGORIES_REQUIRED = 2;

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
