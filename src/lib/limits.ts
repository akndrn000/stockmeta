// Batas batch + alias kompatibilitas. SUMBER ANGKA TUNGGAL kini platform-rules.ts;
// file ini hanya me-re-export (jangan menambah literal batas di sini).
// M15: MAX_FRAMES 20 (legacy) — grid thumbnail di ≥1024px tepat 5 kolom → 4 baris penuh.
export const MAX_FRAMES = 20;

// Jeda antar foto saat batch (detik) — pilihan select "Jeda antar foto", disimpan ke localStorage.
export const BATCH_DELAY_OPTIONS_SEC = [3, 6, 12, 20] as const;
export const BATCH_DELAY_DEFAULT_SEC = 6;

export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** LEGACY sementara (batas 30 karakter nama file Adobe pra-platform-rules) — dipakai
 * validate.ts lama; DIHAPUS saat validate rewrite (aturan baru: Filename sama persis). */
export const MAX_FILENAME = 30;

export {
  ADOBE_KEYWORDS_MAX as MAX_KEYWORDS_ADOBE,
  ADOBE_KEYWORDS_MIN as MIN_KEYWORDS_ADOBE,
  ADOBE_TITLE_MAX as MAX_TITLE_CSV,
  SS_DESCRIPTION_MAX_CHARS as MAX_DESCRIPTION,
  SS_DESCRIPTION_MIN_WORDS as MIN_DESCRIPTION_WORDS,
  SS_KEYWORDS_MAX as MAX_KEYWORDS,
  SS_KEYWORDS_MIN as MIN_KEYWORDS_SHUTTER
} from './platform-rules';
