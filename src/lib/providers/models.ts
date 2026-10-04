// SATU MODEL PER PROVIDER FIXED — konstanta tunggal di satu tempat, dipakai adapter, UI, dan tes.
// Groq & Gemini: tanpa deteksi otomatis, tanpa daftar preferensi, tanpa pemilihan model dinamis.
// Provider 'custom': model DIISI PENGGUNA (tanpa hardcode), jadi tidak ada di sini.
// TODO [VERIFIKASI]: pastikan kedua model default di bawah benar-benar mendukung gambar.
import type { ProviderId } from '../types';

/** Groq: model tetap, limit gratis ±8.000 token/menit. */
export const GROQ_MODEL = 'qwen/qwen3.8-27b';

/** Gemini: Flash-Lite — kuota gratis jauh lebih longgar daripada flash biasa. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** Nama model per provider fixed — teks statis di UI, tanpa dropdown pemilih model. */
export const PROVIDER_MODELS: Partial<Record<ProviderId, string>> = {
  groq: GROQ_MODEL,
  gemini: GEMINI_MODEL
};
