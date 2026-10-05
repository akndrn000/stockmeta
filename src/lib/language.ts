// Deteksi bahasa Indonesia berbasis kata fungsi yang sangat umum — fungsi murni.
// Tanpa kamus besar: hanya kata fungsi/kata umum pendek yang jarang muncul utuh
// dalam teks Inggris baku. Pencocokan selalu whole-word (token), bukan substring.
import { INDONESIAN_KEYWORD_RATIO_LIMIT } from './limits';

export { INDONESIAN_KEYWORD_RATIO_LIMIT };
const ID_FUNCTION_WORDS = new Set([
  'yang', 'dan', 'dengan', 'untuk', 'dari', 'di', 'pada', 'ini', 'itu',
  'seorang', 'sebuah', 'seekor', 'adalah', 'karena', 'sebagai', 'dalam',
  'kepada', 'tersebut', 'mereka', 'kami', 'kita', 'saya', 'anda', 'juga',
  'tidak', 'bukan', 'sudah', 'telah', 'akan', 'bisa', 'dapat', 'sangat',
  'lebih', 'kurang', 'antara', 'setiap', 'semua', 'beberapa', 'para',
  'orang', 'atau', 'yaitu', 'yakni', 'agar', 'supaya', 'namun', 'tetapi',
  'sedang', 'masih', 'hanya', 'saja', 'oleh', 'tentang', 'tanpa', 'ialah'
]);

// Kata kuat: bila muncul sekali saja sudah hampir pasti Indonesia.
const ID_STRONG_WORDS = new Set([
  'seorang', 'sebuah', 'seekor', 'adalah', 'dengan', 'untuk', 'yang', 'tersebut'
]);

function tokens(text: string): string[] {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/** true bila teks tampak bahasa Indonesia (whole-word, tanpa kamus besar). */
export function looksIndonesian(text: string): boolean {
  const toks = tokens(text);
  if (!toks.length) return false;
  let hits = 0;
  for (const t of toks) {
    if (ID_STRONG_WORDS.has(t)) return true;
    if (ID_FUNCTION_WORDS.has(t)) hits++;
  }
  // Satu kata fungsi lemah (mis. "di"/"dan" sekali) belum cukup — butuh >=2
  // agar kalimat Inggris seperti "Fish and chips on a table" tidak salah tandai.
  return hits >= 2;
}

/** true bila satu keyword tampak Indonesia (cek whole-word per keyword). */
export function isIndonesianKeyword(keyword: string): boolean {
  const toks = tokens(keyword);
  if (!toks.length) return false;
  // Keyword 1-2 kata: satu kata fungsi saja cukup (mis. "dengan", "kucing lucu" TIDAK —
  // "kucing"/"lucu" bukan kata fungsi, jadi butuh daftar pendek kata umum? Tidak:
  // sesuai aturan, hanya kata fungsi/umum pendek yang dicek — "kucing" lolos sebagai
  // bukan-Indonesia di level ini; validasi grounding/relevansi Fase 4 yang menilai.)
  // Namun kata ganti umum pendek ikut dihitung agar "orang", "para" tertangkap.
  return toks.some((t) => ID_FUNCTION_WORDS.has(t));
}

/** Rasio keyword yang terdeteksi Indonesia (0-1). */
export function indonesianKeywordRatio(keywords: string[]): number {
  if (!keywords.length) return 0;
  let n = 0;
  for (const k of keywords) if (isIndonesianKeyword(k)) n++;
  return n / keywords.length;
}
