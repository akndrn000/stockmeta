// Validasi tema batch/per frame — fungsi murni tanpa DOM/React (Fase 1).
// Tema kini WAJIB: tema efektif sebuah frame = tema per frame (bila diisi) atau tema batch.
// "Tema untuk frame ini" tetap boleh kosong sebagai override.
import { THEME_MAX_LENGTH, THEME_MIN_LENGTH } from './limits';

export interface ThemeValidation {
  ok: boolean;
  message: string;
}

/** Trim + rapikan spasi ganda/newline menjadi satu spasi. */
export function normalizeTheme(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Tema efektif: override per frame bila diisi, sonst tema batch. */
export function effectiveTheme(batchTheme: string, frameTheme?: string): string {
  const per = normalizeTheme(frameTheme ?? '');
  if (per) return per;
  return normalizeTheme(batchTheme);
}

/** Validasi tema efektif: panjang 2–60 karakter setelah normalisasi. */
export function validateTheme(raw: string): ThemeValidation {
  const v = normalizeTheme(raw);
  if (!v) {
    return {
      ok: false,
      message: `Tema utama wajib diisi (${THEME_MIN_LENGTH}–${THEME_MAX_LENGTH} karakter).`
    };
  }
  if (v.length < THEME_MIN_LENGTH) {
    return {
      ok: false,
      message: `Tema utama minimal ${THEME_MIN_LENGTH} karakter (baru ${v.length}).`
    };
  }
  if (v.length > THEME_MAX_LENGTH) {
    return {
      ok: false,
      message: `Tema utama maksimal ${THEME_MAX_LENGTH} karakter (baru ${v.length}).`
    };
  }
  return { ok: true, message: '' };
}
