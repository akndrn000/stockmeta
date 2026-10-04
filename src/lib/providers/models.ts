// SATU MODEL PER PROVIDER FIXED — konstanta tunggal di satu tempat, dipakai adapter, UI, dan tes.
// Groq, Gemini & OpenRouter: tanpa deteksi otomatis, tanpa daftar preferensi, tanpa pemilihan
// model dinamis — kecuali pickGeminiModel (satu-satunya pengecualian): Mode Analisis boleh
// meminta varian non-lite karena butuh penalaran lebih dalam; jalur metadata tetap lite.
// TODO [VERIFIKASI]: pastikan model default di bawah benar-benar mendukung gambar.
import type { ProviderId } from '../types';

/** Groq: model tetap, limit gratis ±8.000 token/menit. */
export const GROQ_MODEL = 'qwen/qwen3.8-27b';

/** Gemini: Flash-Lite — kuota gratis jauh lebih longgar daripada flash biasa (jalur metadata). */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** Gemini varian non-lite — khusus Mode Analisis (penalaran lebih dalam, bukan deskripsi objek). */
export const GEMINI_FULL_MODEL = 'gemini-3.5-flash';

/** OpenRouter: satu alias tetap; OpenRouter menentukan endpoint vision gratisnya sendiri. */
export const OPENROUTER_MODEL = 'openrouter/free';

/**
 * Pilih model Gemini. Metadata (`preferNonLite=false`, default) tetap memakai varian lite
 * seperti sekarang; Mode Analisis mengoper `true` supaya varian "-lite" dihindari.
 */
export function pickGeminiModel(preferNonLite = false): string {
  return preferNonLite ? GEMINI_FULL_MODEL : GEMINI_MODEL;
}

/** Nama model per provider fixed — teks statis di UI, tanpa dropdown pemilih model. */
export const PROVIDER_MODELS: Partial<Record<ProviderId, string>> = {
  groq: GROQ_MODEL,
  gemini: GEMINI_MODEL,
  openrouter: OPENROUTER_MODEL
};
