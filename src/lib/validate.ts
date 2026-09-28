// Saran validasi metadata — BUKAN error pemblokir: daftar { field, message } untuk ditampilkan
// UI di dekat field / ringkasan bawah. Angka batas dari limits.ts.
import {
  MAX_DESCRIPTION,
  MAX_FILENAME,
  MAX_KEYWORDS,
  MAX_TITLE_CSV,
  MIN_DESCRIPTION_WORDS,
  MIN_KEYWORDS_ADOBE,
  MIN_KEYWORDS_SHUTTER
} from './limits';
import type { AdobeMetadata, Metadata, Platform } from './types';

export interface ValidationNote {
  field: 'title' | 'description' | 'keywords' | 'category' | 'categories' | 'filename';
  message: string;
}

const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

// Deskripsi terlihat seperti daftar kata: banyak koma tapi sedikit kata per segmen.
function looksLikeWordList(desc: string): boolean {
  const segs = desc.split(',').map((s) => s.trim()).filter(Boolean);
  if (segs.length < 2) return false;
  return countWords(desc) / segs.length <= 2;
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
    if (title.includes(',')) {
      notes.push({ field: 'title', message: 'Judul mengandung koma — CSV Adobe tanpa koma, ganti dengan spasi.' });
    }
    if (filename.length > MAX_FILENAME) {
      notes.push({ field: 'filename', message: `Nama file ${filename.length} karakter — batas CSV ${MAX_FILENAME} karakter (termasuk ekstensi).` });
    }
    const n = m?.keywords.length ?? 0;
    if (n < MIN_KEYWORDS_ADOBE) notes.push({ field: 'keywords', message: `Kata kunci minimal ${MIN_KEYWORDS_ADOBE} (baru ${n}).` });
    if (n > MAX_KEYWORDS) notes.push({ field: 'keywords', message: `Kata kunci ${n} — maksimal ${MAX_KEYWORDS}.` });
    if (!m?.category) notes.push({ field: 'category', message: 'Pilih satu kategori.' });
    return notes;
  }

  // Shutterstock
  const m = metadata as AdobeMetadata | undefined;   // union cukup untuk field yang dipakai
  const desc = 'description' in (m ?? {}) ? String((m as unknown as { description?: string }).description ?? '') : '';
  const words = countWords(desc);
  // Ambang saran 200 karakter (non-pemblokir): ketentuan resmi Shutterstock kini maks 2048
  // karakter (Content Publishing Standards) sementara editor Portfolio membatasi 150 karakter —
  // 200 dipertahankan sebagai penanda praktis "terlalu panjang untuk praktis".
  if (words > 0 && words < MIN_DESCRIPTION_WORDS) notes.push({ field: 'description', message: `Deskripsi minimal ${MIN_DESCRIPTION_WORDS} kata (baru ${words}).` });
  if (desc.length > MAX_DESCRIPTION) notes.push({ field: 'description', message: `Deskripsi ${desc.length} karakter — maksimal ${MAX_DESCRIPTION}.` });
  if (desc && looksLikeWordList(desc)) notes.push({ field: 'description', message: 'Deskripsi terlihat seperti daftar kata — tulis kalimat utuh.' });
  const n = m?.keywords.length ?? 0;
  if (n < MIN_KEYWORDS_SHUTTER) notes.push({ field: 'keywords', message: `Kata kunci minimal ${MIN_KEYWORDS_SHUTTER} (baru ${n}).` });
  if (n > MAX_KEYWORDS) notes.push({ field: 'keywords', message: `Kata kunci ${n} — maksimal ${MAX_KEYWORDS}.` });
  const cats = (m as unknown as { categories?: string[] })?.categories ?? [];
  if (!cats[0]) notes.push({ field: 'categories', message: 'Pilih kategori utama.' });
  return notes;
}
