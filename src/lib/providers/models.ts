// SATU MODEL PER PROVIDER — konstanta tunggal di satu tempat, dipakai adapter, UI, dan tes.
// Tanpa deteksi otomatis, tanpa daftar preferensi, tanpa pemilihan model dinamis.
import type { ProviderId } from '../types';

/** Groq: model tetap, limit gratis ±8.000 token/menit. */
export const GROQ_MODEL = 'qwen/qwen3.8-27b';

/** Gemini: Flash-Lite — kuota gratis jauh lebih longgar daripada flash biasa. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

/** OpenRouter: satu alias tetap; OpenRouter menentukan endpoint vision gratisnya sendiri. */
export const OPENROUTER_MODEL = 'openrouter/free';

/** Nama model per provider — teks statis di UI, tanpa dropdown pemilih model. */
export const PROVIDER_MODELS: Partial<Record<ProviderId, string>> = {
  groq: GROQ_MODEL,
  gemini: GEMINI_MODEL,
  openrouter: OPENROUTER_MODEL
};
