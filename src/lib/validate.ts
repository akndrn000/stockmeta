// Cek keras deterministik (tanpa AI): { errors[], warnings[] } per frame per platform.
// Errors MEMBLOKIR ekspor frame itu; warnings tidak. Angka & daftar dari platform-rules.ts.
import { findBrandHits } from './brands';
import {
  ADOBE_KEYWORDS_MAX,
  ADOBE_KEYWORDS_MIN,
  ADOBE_KEYWORDS_TARGET_MAX,
  ADOBE_KEYWORDS_TARGET_MIN,
  ADOBE_TITLE_MAX,
  ADOBE_TITLE_SUGGEST_MAX,
  ADOBE_TITLE_WORDS_FIRST_N,
  AI_LABEL_PATTERN,
  ALLOWED_PORTAL_EXTENSIONS,
  EMOJI_PATTERN,
  INDONESIAN_COMMON_WORDS,
  sanitizeAdobeTitle,
  SS_DESCRIPTION_MAX_CHARS,
  SS_DESCRIPTION_MIN_WORDS,
  SS_DESCRIPTION_TARGET_MAX_CHARS,
  SS_DESCRIPTION_TARGET_MIN_CHARS,
  SS_KEYWORDS_MAX,
  SS_KEYWORDS_MIN,
  TECH_DATA_PATTERNS,
  TITLE_PHOTO_OF_PATTERN,
  adobeCategoryLabels,
  shutterstockCategoryNames,
  type RuleId
} from './platform-rules';
import type { AdobeMetadata, Metadata, Platform, ShutterstockMetadata } from './types';

export interface ValidationIssue {
  rule: RuleId;
  field: 'title' | 'description' | 'keywords' | 'category' | 'categories' | 'filename';
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** alias lama: daftar gabungan untuk ringkasan UI */
export type ValidationNote = ValidationIssue;

// M11: kategori diisi fallback oleh sistem (nama model tidak cocok / field kosong)
export const AUTO_CATEGORY_MSG = 'Kategori dipilih otomatis oleh sistem, periksa kembali.';

const countWords = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/** jumlah keyword UNIK (case-insensitive, setelah dedupe) */
export function countUniqueKeywords(keywords: readonly string[]): number {
  return new Set(keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)).size;
}

// Teks terlihat seperti daftar kata: banyak koma tapi sedikit kata per segmen.
function looksLikeWordList(text: string): boolean {
  const segs = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return false;
  return countWords(text) / segs.length <= 2;
}

const wordTokens = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length >= 3);

/** stem naif Inggris untuk deteksi pengulangan (forest/forestry/forests → satu akar) */
export function stemWord(w: string): string {
  let s = w.toLowerCase();
  if (s.endsWith('ies') && s.length > 4) return s.slice(0, -3) + 'y';
  for (const suf of ['ing', 'eed', 'ed', 'es']) {
    if (s.endsWith(suf) && s.length - suf.length >= 3) { s = s.slice(0, -suf.length); break; }
  }
  if (s.endsWith('s') && s.length > 3) s = s.slice(0, -1);
  return s;
}

/** kelompok keyword berbeda yang berbagi stem kata (maksimal contoh dibatasi pemanggil) */
export function findStemRepeats(keywords: readonly string[]): string[][] {
  const byStem = new Map<string, Set<string>>();
  for (const kw of keywords) {
    const words = wordTokens(kw).map(stemWord).filter((w) => w.length >= 4);
    for (const st of new Set(words)) {
      const set = byStem.get(st) ?? new Set<string>();
      set.add(kw);
      byStem.set(st, set);
    }
  }
  return [...byStem.values()].filter((set) => set.size >= 2).map((set) => [...set]);
}

/** rangkaian ≥2 kata kapital berurutan (calon nama orang/artis/karakter/instansi) */
export function findCapitalizedPhrases(text: string): string[] {
  const out: string[] = [];
  const STOP = new Set(['The', 'And', 'With', 'From', 'New', 'Red', 'Green', 'Blue', 'Black', 'White']);
  const re = /\b([A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,})+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1];
    if (phrase.split(/\s+/).some((w) => STOP.has(w))) continue;
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

function findIndonesianWords(text: string): string[] {
  const set = new Set(INDONESIAN_COMMON_WORDS);
  return [...new Set(wordTokens(text))].filter((w) => set.has(w));
}

function techHits(text: string): string[] {
  const hits: string[] = [];
  for (const re of TECH_DATA_PATTERNS) {
    const m = text.match(new RegExp(re.source, re.flags.includes('i') ? 'i' : ''));
    if (m?.[0] && !hits.includes(m[0])) hits.push(m[0]);
  }
  return hits;
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i).toLowerCase() : '';
}

function checkFilename(warnings: ValidationIssue[], filename: string): void {
  if (!filename) return;
  const ext = extensionOf(filename);
  if (ext && !ALLOWED_PORTAL_EXTENSIONS.includes(ext)) {
    warnings.push({
      rule: 'FILENAME_MATCH',
      field: 'filename',
      message: `Ekstensi ${ext} tidak umum di portal (umum: ${ALLOWED_PORTAL_EXTENSIONS.join(', ')}). Pastikan sama persis dengan nama file di portal.`
    });
  }
}

function checkBrands(warnings: ValidationIssue[], field: ValidationIssue['field'], text: string): void {
  const hits = findBrandHits(text);
  if (hits.length) {
    const shown = hits.slice(0, 3);
    const more = hits.length > shown.length ? ', …' : '';
    warnings.push({
      rule: 'IP_BRAND',
      field,
      message: `Kemungkinan merek terdeteksi (${shown.join(', ')}${more}) — hapus atau samarkan untuk konten komersial.`
    });
  }
}

function checkPersons(warnings: ValidationIssue[], field: ValidationIssue['field'], text: string): void {
  const phrases = findCapitalizedPhrases(text);
  if (phrases.length) {
    warnings.push({
      rule: 'IP_PERSON_ARTIST_CHARACTER',
      field,
      message: `Kemungkinan nama orang/artis/karakter/instansi (${phrases.slice(0, 3).join('; ')}${phrases.length > 3 ? '; …' : ''}) — pastikan bukan nama nyata/berhak cipta.`
    });
  }
}

function checkAiLabel(warnings: ValidationIssue[], field: ValidationIssue['field'], text: string): void {
  if (AI_LABEL_PATTERN.test(text)) {
    warnings.push({
      rule: 'AI_LABEL_IN_TEXT',
      field,
      message: 'Berisi "generative AI"/"AI generated" — hapus dari teks; status AI cukup dicentang manual di portal.'
    });
  }
}

function checkLanguage(warnings: ValidationIssue[], field: ValidationIssue['field'], text: string): void {
  const words = findIndonesianWords(text);
  if (words.length) {
    const shown = words.slice(0, 3);
    const more = words.length > shown.length ? ', …' : '';
    warnings.push({
      rule: 'LANGUAGE_EN',
      field,
      message: `Terdeteksi kata non-Inggris (${shown.join(', ')}${more}) — judul & keyword wajib satu bahasa (English).`
    });
  }
}

/**
 * Cek keras satu frame. `filename` = nama file di portal (default nama upload).
 * Tidak pernah memotong/mengubah data — sanitasi hanya dilaporkan sebagai warning.
 */
export function validateMetadata(
  platform: Platform,
  metadata: Metadata | undefined,
  filename = ''
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (platform === 'adobe') {
    const m = metadata as AdobeMetadata | undefined;
    const title = m?.title ?? '';
    const keywords = m?.keywords ?? [];

    if (!title.trim()) {
      errors.push({ rule: 'ADOBE_TITLE_LEN', field: 'title', message: 'Judul kosong — tulis frasa faktual tentang subjek utama.' });
    } else {
      if (title.length > ADOBE_TITLE_MAX) {
        errors.push({ rule: 'ADOBE_TITLE_LEN', field: 'title', message: `Judul ${title.length} karakter — melebihi batas portal ${ADOBE_TITLE_MAX} karakter.` });
      } else if (title.length > ADOBE_TITLE_SUGGEST_MAX) {
        // TODO [VERIFIKASI]: apakah impor CSV Adobe menolak judul >70? Sementara peringatan.
        warnings.push({ rule: 'ADOBE_TITLE_LEN', field: 'title', message: `Judul ${title.length} karakter — dokumentasi CSV menyarankan ≤${ADOBE_TITLE_SUGGEST_MAX}; portal memakai maks ${ADOBE_TITLE_MAX}.` });
      }
      const san = sanitizeAdobeTitle(title);
      if (san.changed) {
        warnings.push({ rule: 'ADOBE_TITLE_COMMA', field: 'title', message: `Judul mengandung koma/karakter khusus — diekspor sebagai "${san.text}". Nilai asli tetap tersimpan di editor.` });
      }
      if (looksLikeWordList(title)) {
        warnings.push({ rule: 'ADOBE_TITLE_WORDS', field: 'title', message: 'Judul terlihat seperti daftar kata — tulis satu frasa faktual.' });
      }
      if (TITLE_PHOTO_OF_PATTERN.test(title)) {
        warnings.push({ rule: 'ADOBE_TITLE_WORDS', field: 'title', message: 'Judul diawali "photo of"/"photograph of" — hapus awalan itu.' });
      }
      checkBrands(warnings, 'title', title);
      checkPersons(warnings, 'title', title);
      checkAiLabel(warnings, 'title', title);
      checkLanguage(warnings, 'title', title);
    }

    const unique = countUniqueKeywords(keywords);
    if (unique < ADOBE_KEYWORDS_MIN) {
      errors.push({ rule: 'ADOBE_KEYWORDS_RANGE', field: 'keywords', message: `Kata kunci unik minimal ${ADOBE_KEYWORDS_MIN} (baru ${unique}).` });
    } else if (unique > ADOBE_KEYWORDS_MAX) {
      errors.push({ rule: 'ADOBE_KEYWORDS_RANGE', field: 'keywords', message: `Kata kunci unik ${unique} — maksimal ${ADOBE_KEYWORDS_MAX}.` });
    } else if (unique < ADOBE_KEYWORDS_TARGET_MIN || unique > ADOBE_KEYWORDS_TARGET_MAX) {
      warnings.push({ rule: 'ADOBE_KEYWORDS_RANGE', field: 'keywords', message: ` Ideal ${ADOBE_KEYWORDS_TARGET_MIN}-${ADOBE_KEYWORDS_TARGET_MAX} keyword (baru ${unique}).`.trim() });
    }
    const titleWords = new Set(wordTokens(title).map(stemWord));
    const firstHay = keywords.slice(0, ADOBE_TITLE_WORDS_FIRST_N).join(' ').toLowerCase();
    const overlap = [...titleWords].some((w) => firstHay.includes(w) || firstHay.includes(stemWord(w)));
    if (title.trim() && titleWords.size > 0 && !overlap) {
      warnings.push({ rule: 'ADOBE_KEYWORDS_TITLE_WORDS', field: 'keywords', message: ` ${ADOBE_TITLE_WORDS_FIRST_N} keyword pertama sebaiknya memuat kata dari judul.`.trim() });
    }
    const kwText = keywords.join(', ');
    const tech = techHits(kwText);
    if (tech.length) {
      warnings.push({ rule: 'TECH_DATA', field: 'keywords', message: `Data teknis terdeteksi (${tech.slice(0, 3).join(', ')}) — hapus dari keyword Adobe.` });
    }
    checkBrands(warnings, 'keywords', kwText);
    checkPersons(warnings, 'keywords', kwText);
    checkAiLabel(warnings, 'keywords', kwText);
    checkLanguage(warnings, 'keywords', kwText);

    const labels = adobeCategoryLabels();
    // M11: kategori fallback otomatis tetap disarankan untuk diperiksa, meski slotnya terisi
    if (m?.categoryAuto) warnings.push({ rule: 'ADOBE_CATEGORY', field: 'category', message: AUTO_CATEGORY_MSG });
    else if (!m?.category) errors.push({ rule: 'ADOBE_CATEGORY', field: 'category', message: 'Pilih satu kategori (angka 1-21).' });
    else if (!labels.includes(m.category)) errors.push({ rule: 'ADOBE_CATEGORY', field: 'category', message: `Kategori "${m.category}" tidak dikenal — pilih dari daftar resmi.` });

    checkFilename(warnings, filename);
    return { errors, warnings };
  }

  // Shutterstock
  const m = metadata as ShutterstockMetadata | undefined;
  const desc = m?.description ?? '';
  const keywords = m?.keywords ?? [];
  const cats = m?.categories ?? [];

  const words = countWords(desc);
  if (words < SS_DESCRIPTION_MIN_WORDS) {
    errors.push({ rule: 'SS_DESC_LEN', field: 'description', message: `Deskripsi minimal ${SS_DESCRIPTION_MIN_WORDS} kata (baru ${words}).` });
  } else {
    if (desc.length > SS_DESCRIPTION_MAX_CHARS) {
      errors.push({ rule: 'SS_DESC_LEN', field: 'description', message: `Deskripsi ${desc.length} karakter — maksimal ${SS_DESCRIPTION_MAX_CHARS}.` });
    } else if (desc.length < SS_DESCRIPTION_TARGET_MIN_CHARS || desc.length > SS_DESCRIPTION_TARGET_MAX_CHARS) {
      warnings.push({ rule: 'SS_DESC_LEN', field: 'description', message: `Target ${SS_DESCRIPTION_TARGET_MIN_CHARS}-${SS_DESCRIPTION_TARGET_MAX_CHARS} karakter (baru ${desc.length}).` });
    }
    if (looksLikeWordList(desc)) {
      errors.push({ rule: 'SS_DESC_SENTENCE', field: 'description', message: 'Deskripsi terlihat seperti daftar kata — tulis satu kalimat utuh.' });
    }
    if (EMOJI_PATTERN.test(desc)) {
      warnings.push({ rule: 'SS_DESC_SENTENCE', field: 'description', message: 'Deskripsi mengandung emoji/karakter khusus — hapus.' });
    }
    checkBrands(warnings, 'description', desc);
    checkAiLabel(warnings, 'description', desc);
    checkLanguage(warnings, 'description', desc);
  }

  const unique = countUniqueKeywords(keywords);
  if (unique < SS_KEYWORDS_MIN) {
    errors.push({ rule: 'SS_KEYWORDS_RANGE', field: 'keywords', message: `Kata kunci unik minimal ${SS_KEYWORDS_MIN} (baru ${unique}).` });
  } else if (unique > SS_KEYWORDS_MAX) {
    errors.push({ rule: 'SS_KEYWORDS_RANGE', field: 'keywords', message: `Kata kunci unik ${unique} — maksimal ${SS_KEYWORDS_MAX}.` });
  }
  const stems = findStemRepeats(keywords);
  if (stems.length) {
    const contoh = stems.slice(0, 2).map((g) => g.slice(0, 3).join(' / ')).join('; ');
    warnings.push({ rule: 'SS_KEYWORDS_STEM', field: 'keywords', message: `Pengulangan kata/stem terdeteksi (${contoh}) — variasikan keyword.` });
  }
  const kwText = keywords.join(', ');
  checkBrands(warnings, 'keywords', kwText);
  checkPersons(warnings, 'keywords', kwText);
  checkAiLabel(warnings, 'keywords', kwText);
  checkLanguage(warnings, 'keywords', kwText);

  const names = shutterstockCategoryNames();
  if (m?.categoryAuto) warnings.push({ rule: 'SS_CATEGORIES', field: 'categories', message: AUTO_CATEGORY_MSG });
  else if (!cats[0]) errors.push({ rule: 'SS_CATEGORIES', field: 'categories', message: 'Pilih kategori utama (1 wajib, maks 2).' });
  else if (cats.length > 2) errors.push({ rule: 'SS_CATEGORIES', field: 'categories', message: `Kategori maksimal 2 (baru ${cats.length}).` });
  else {
    const badCat = cats.find((c) => !names.includes(c));
    if (badCat) errors.push({ rule: 'SS_CATEGORIES', field: 'categories', message: `Kategori "${badCat}" tidak dikenal — pilih nama persis dari daftar resmi.` });
  }

  checkFilename(warnings, filename);
  return { errors, warnings };
}

/** jumlah error cek keras (0 = boleh diekspor) */
export function countHardErrors(result: ValidationResult): number {
  return result.errors.length;
}
