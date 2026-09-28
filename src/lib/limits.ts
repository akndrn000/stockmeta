// Batas batch — SATU sumber angka untuk logika dan teks UI (jangan tulis 10 literal di copy).
export const MAX_FRAMES = 10;

// Jeda antar foto saat batch (detik) — pilihan select "Jeda antar foto", disimpan ke localStorage.
export const BATCH_DELAY_OPTIONS_SEC = [3, 6, 12, 20] as const;
export const BATCH_DELAY_DEFAULT_SEC = 6;

export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

// Batas metadata per platform (konstanta untuk logika validasi + teks UI).
export const MAX_KEYWORDS = 50;
export const MIN_KEYWORDS_ADOBE = 5;
export const MIN_KEYWORDS_SHUTTER = 7;
// Batas CSV resmi Adobe Stock (M9a): judul tanpa koma; nama file termasuk ekstensi.
export const MAX_TITLE_CSV = 70;
export const MAX_FILENAME = 30;
export const MAX_DESCRIPTION = 200;
export const MIN_DESCRIPTION_WORDS = 5;
