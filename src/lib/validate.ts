// Saran validasi metadata + error pemblokir ekspor (blocking: true) — daftar { field, message }
// untuk ditampilkan UI di dekat field / ringkasan bawah. Angka batas dari limits.ts/categories.ts.
import {
  GENERIC_BAN_WORDS,
  MAX_DESCRIPTION_SHUTTER,
  MAX_FILENAME,
  MAX_KEYWORDS,
  MAX_KEYWORDS_ADOBE,
  MAX_TITLE_CSV,
  MIN_DESCRIPTION_WORDS,
  MIN_KEYWORDS_ADOBE,
  MIN_KEYWORDS_SHUTTER,
  SS_DESCRIPTION_SUGGEST,
  TARGET_KEYWORDS_MIN
} from './limits';
import { SS_CATEGORIES_REQUIRED } from './categories';
import { INDONESIAN_KEYWORD_RATIO_LIMIT, indonesianKeywordRatio, looksIndonesian } from './language';
import type { AdobeMetadata, Metadata, Platform } from './types';

export interface ValidationNote {
  field: 'title' | 'description' | 'keywords' | 'category' | 'categories' | 'filename';
  message: string;
  /** true = pemblokir ekspor (kategori Shutterstock rangkap/kurang, dsb.); undefined = saran biasa. */
  blocking?: boolean;
}

// M11: kategori diisi fallback oleh sistem (nama model tidak cocok / field kosong)
export const AUTO_CATEGORY_MSG = 'Kategori dipilih otomatis oleh sistem, periksa kembali.';
// Fase 3: pesan bahasa Inggris — pemblokir untuk judul/deskripsi, peringatan untuk keyword.
export const ENGLISH_REQUIRED_MSG = 'Tulis dalam bahasa Inggris';
// Fase 4: tema tidak cocok — peringatan non-pemblokir.
export const THEME_MISMATCH_MSG = 'Tema tidak cocok dengan gambar';
// Target kualitas 30 (TARGET_KEYWORDS_MIN): di bawahnya = saran non-pemblokir.
// Batas keras minimum (5 Adobe / 7 Shutterstock) tetap pemblokir terpisah di bawah.
export const KEYWORD_THIN_MSG = (_n: number): string => {
  void _n;
  return `Kata kunci kurang dari ${TARGET_KEYWORDS_MIN} — pertimbangkan menambah kata kunci relevan untuk visibilitas pencarian lebih baik.`;
};
// Jaring pengaman: deskripsi Shutterstock seharusnya sudah dibersihkan dari koma
// otomatis (cleanShutterstockDescription); bila masih ada koma → saran.
export const SS_COMMA_MSG =
  'Deskripsi masih mengandung koma — hapus koma agar menjadi satu kalimat mengalir.';

// Kata generik lolos ke daftar akhir (mis. ketikan manual) — saran non-pemblokir.
export const GENERIC_KEYWORD_MSG = (words: string[]): string =>
  `Kata kunci generik sebaiknya dibuang: ${words.join(', ')}.`;
const GENERIC_BAN_SET = new Set(GENERIC_BAN_WORDS.map((w) => w.toLowerCase()));
// Hanya kata tunggal yang persis generik yang ditandai (frasa multi-kata
// sudah dinilai jalurnya sendiri di keywordGroups).
function findGenericKeywords(kws: string[]): string[] {
  const hit: string[] = [];
  for (const k of kws) {
    const words = k.toLowerCase().split(/[^a-z]+/).filter(Boolean);
    if (words.length === 1 && GENERIC_BAN_SET.has(words[0]) && !hit.includes(k)) hit.push(k);
  }
  return hit;
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Deskripsi terlihat seperti daftar kata: banyak koma tapi sedikit kata per segmen.
function looksLikeWordList(desc: string): boolean {
  const segs = desc.split(',').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return false;
  return countWords(desc) / segs.length <= 2;
}

// true bila ada catatan pemblokir ekspor (dipakai footer Export CSV).
export function hasBlockingNotes(notes: ValidationNote[]): boolean {
  return notes.some((n) => n.blocking);
}

// filename dipakai saran nama file Adobe (CSV maks 30 karakter); tidak diverifikasi bila kosong.
export function validateMetadata(platform: Platform, metadata: Metadata | undefined, filename = ''): ValidationNote[] {
  const notes: ValidationNote[] = [];

  if (platform === 'adobe') {
    const m = metadata as AdobeMetadata | undefined;
    const title = m?.title ?? '';
    if (title.length > MAX_TITLE_CSV) {
      notes.push({ field: 'title', message: `Judul ${title.length} karakter — melebihi batas CSV ${MAX_TITLE_CSV} karakter.` });
    }
    // Fase 3: judul Indonesia = pemblokir ekspor.
    if (title && looksIndonesian(title)) {
      notes.push({ field: 'title', message: ENGLISH_REQUIRED_MSG, blocking: true });
    }
    // M24: saran koma dihapus — koma di judul Adobe aman karena sel CSV di-quote
    if (filename.length > MAX_FILENAME) {
      notes.push({ field: 'filename', message: `Nama file ${filename.length} karakter — batas CSV ${MAX_FILENAME} karakter (termasuk ekstensi).` });
    }
    const kws = m?.keywords ?? [];
    const n = kws.length;
    // M32: batas minimum platform = pemblokir ekspor.
    if (n < MIN_KEYWORDS_ADOBE) notes.push({ field: 'keywords', message: `Kata kunci minimal ${MIN_KEYWORDS_ADOBE} (baru ${n}).`, blocking: true });
    if (n > MAX_KEYWORDS_ADOBE) notes.push({ field: 'keywords', message: `Kata kunci ${n} — maksimal ${MAX_KEYWORDS_ADOBE}.` });
    // Di bawah target kualitas 30 = saran (tidak digenapi kata karangan).
    if (n > 0 && n < TARGET_KEYWORDS_MIN) notes.push({ field: 'keywords', message: KEYWORD_THIN_MSG(n) });
    // Kata generik yang lolos (mis. ketikan manual) = saran non-pemblokir.
    const genericAdobe = findGenericKeywords(kws);
    if (genericAdobe.length) notes.push({ field: 'keywords', message: GENERIC_KEYWORD_MSG(genericAdobe) });
    // Fase 3: keyword Indonesia >20% = peringatan (non-pemblokir).
    if (n > 0 && indonesianKeywordRatio(kws) > INDONESIAN_KEYWORD_RATIO_LIMIT) {
      notes.push({ field: 'keywords', message: `${ENGLISH_REQUIRED_MSG} (sebagian kata kunci terdeteksi bahasa Indonesia).` });
    }
    // M11: kategori fallback otomatis tetap disarankan untuk diperiksa, meski slotnya terisi
    if (m?.categoryAuto) notes.push({ field: 'category', message: AUTO_CATEGORY_MSG });
    else if (!m?.category) notes.push({ field: 'category', message: 'Pilih satu kategori.' });
    // Fase 4: tema tidak cocok = peringatan non-pemblokir.
    if ((m as unknown as { themeMismatch?: boolean })?.themeMismatch) {
      notes.push({ field: 'category', message: THEME_MISMATCH_MSG });
    }
    // Peringatan validator pasca-AI (kata dibuang/dipindah) — non-pemblokir.
    for (const w of (m as unknown as { warnings?: string[] })?.warnings ?? []) {
      notes.push({ field: 'keywords', message: w });
    }
    return notes;
  }

  // Shutterstock
  const m = metadata as AdobeMetadata | undefined;   // union cukup untuk field yang dipakai
  const desc = 'description' in (m ?? {}) ? String((m as unknown as { description?: string }).description ?? '') : '';
  const words = countWords(desc);
  // M33: pagar maksimum = ketentuan resmi 2048. Panjang ideal TETAP saran
  // terpisah (100–250 karakter, satu-dua kalimat natural) — batas atas hanya pagar.
  if (words > 0 && words < MIN_DESCRIPTION_WORDS) notes.push({ field: 'description', message: `Deskripsi minimal ${MIN_DESCRIPTION_WORDS} kata (baru ${words}).` });
  if (desc.length > MAX_DESCRIPTION_SHUTTER) notes.push({ field: 'description', message: `Deskripsi ${desc.length} karakter — maksimal ${MAX_DESCRIPTION_SHUTTER}.` });
  else if (desc.length > SS_DESCRIPTION_SUGGEST.MAX) notes.push({ field: 'description', message: `Deskripsi ${desc.length} karakter — idealnya ${SS_DESCRIPTION_SUGGEST.MIN}–${SS_DESCRIPTION_SUGGEST.MAX} karakter.` });
  if (desc && looksLikeWordList(desc)) notes.push({ field: 'description', message: 'Deskripsi terlihat seperti daftar kata — tulis kalimat utuh.' });
  if (desc.includes(',')) notes.push({ field: 'description', message: SS_COMMA_MSG });
  // Fase 3: deskripsi Indonesia = pemblokir ekspor.
  if (desc && looksIndonesian(desc)) {
    notes.push({ field: 'description', message: ENGLISH_REQUIRED_MSG, blocking: true });
  }
  const kws = (m as unknown as { keywords?: string[] })?.keywords ?? [];
  const n = kws.length;
  // M32: batas minimum platform = pemblokir ekspor.
  if (n < MIN_KEYWORDS_SHUTTER) notes.push({ field: 'keywords', message: `Kata kunci minimal ${MIN_KEYWORDS_SHUTTER} (baru ${n}).`, blocking: true });
  if (n > MAX_KEYWORDS) notes.push({ field: 'keywords', message: `Kata kunci ${n} — maksimal ${MAX_KEYWORDS}.` });
  // Di bawah target kualitas 30 = saran (tidak digenapi kata karangan).
  if (n > 0 && n < TARGET_KEYWORDS_MIN) notes.push({ field: 'keywords', message: KEYWORD_THIN_MSG(n) });
  const genericShutter = findGenericKeywords(kws);
  if (genericShutter.length) notes.push({ field: 'keywords', message: GENERIC_KEYWORD_MSG(genericShutter) });
  if (n > 0 && indonesianKeywordRatio(kws) > INDONESIAN_KEYWORD_RATIO_LIMIT) {
    notes.push({ field: 'keywords', message: `${ENGLISH_REQUIRED_MSG} (sebagian kata kunci terdeteksi bahasa Indonesia).` });
  }
  const cats = (m as unknown as { categories?: string[] })?.categories ?? [];
  if (m?.categoryAuto && cats.length < SS_CATEGORIES_REQUIRED) {
    notes.push({ field: 'categories', message: AUTO_CATEGORY_MSG, blocking: true });
  } else if (!cats[0]) {
    notes.push({ field: 'categories', message: 'Pilih kategori utama.', blocking: true });
  } else if (cats.length < SS_CATEGORIES_REQUIRED || !cats[1]) {
    notes.push({ field: 'categories', message: `Shutterstock wajib punya ${SS_CATEGORIES_REQUIRED} kategori berbeda — pilih Kategori tambahan.`, blocking: true });
  } else if (cats[0] === cats[1]) {
    notes.push({ field: 'categories', message: 'Kategori Shutterstock tidak boleh sama — pilih dua kategori berbeda.', blocking: true });
  } else if (m?.categoryAuto) {
    notes.push({ field: 'categories', message: AUTO_CATEGORY_MSG });
  }
  // Fase 4: tema tidak cocok = peringatan non-pemblokir (Shutterstock: di keywords).
  if ((m as unknown as { themeMismatch?: boolean })?.themeMismatch) {
    notes.push({ field: 'keywords', message: THEME_MISMATCH_MSG });
  }
  // Peringatan validator pasca-AI (kata dibuang/dipindah) — non-pemblokir.
  for (const w of (m as unknown as { warnings?: string[] })?.warnings ?? []) {
    notes.push({ field: 'keywords', message: w });
  }
  return notes;
}
