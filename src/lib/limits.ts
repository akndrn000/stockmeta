// Batas batch — SATU sumber angka untuk logika dan teks UI (jangan tulis 20 literal di copy).
// M15: kembali ke 20 (legacy) — grid thumbnail di ≥1024px kini tepat 5 kolom → 4 baris penuh.
export const MAX_FRAMES = 20;

// Jeda antar foto saat batch (detik) — pilihan select "Jeda antar foto", disimpan ke localStorage.
export const BATCH_DELAY_OPTIONS_SEC = [3, 6, 12, 20] as const;
export const BATCH_DELAY_DEFAULT_SEC = 6;

export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

// Batas metadata per platform (konstanta untuk logika validasi + teks UI).
export const MAX_KEYWORDS = 50;
export const MIN_KEYWORDS_ADOBE = 5;
export const MIN_KEYWORDS_SHUTTER = 7;
// Batas CSV resmi Adobe Stock — M24 (koreksi M9a): contoh CSV resmi yang diverifikasi
// user menyatakan Title "Up to 200 characters" dan Keywords "Max 49 keywords, most
// important first". Koma di judul AMAN (CSV di-quote); nama file termasuk ekstensi.
export const MAX_TITLE_CSV = 200;
export const MAX_KEYWORDS_ADOBE = 49;
export const MAX_FILENAME = 30;
// Deskripsi Shutterstock — M28 (koreksi final): MAKSIMAL 2048 KARAKTER berdasarkan
// SCREENSHOT LANGSUNG form upload Shutterstock sungguhan (sumber paling akurat).
// Riwayat salah: sempat memakai 200 (M11/M13/M18) lalu disebut 150 (komentar
// validate.ts) — keduanya SALAH. Jangan ubah lagi tanpa bukti sekuat screenshot form asli.
// Minimal tetap 5 KATA (dihitung per kata, bukan karakter) — terpisah dari batas karakter.
export const MAX_DESCRIPTION = 2048;
export const MIN_DESCRIPTION_WORDS = 5;
