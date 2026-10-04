// Tes SATU MODEL PER PROVIDER + pengecualian pickGeminiModel untuk analisis:
// konstanta tunggal di models.ts untuk Groq/Gemini/OpenRouter; Mode Analisis boleh meminta
// varian Gemini non-lite (tanpa daftar preferensi umum / deteksi otomatis).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEMINI_FULL_MODEL, GEMINI_MODEL, GROQ_MODEL, OPENROUTER_MODEL, PROVIDER_MODELS, pickGeminiModel } from './models';

const DIR = new URL('.', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, DIR), 'utf8');

describe('models.ts', () => {
  it('tepat satu model untuk tiap provider (groq, gemini, openrouter)', () => {
    expect(Object.keys(PROVIDER_MODELS).sort()).toEqual(['gemini', 'groq', 'openrouter']);
  });

  it('nilai model sesuai spek', () => {
    expect(GROQ_MODEL).toBe('qwen/qwen3.8-27b');
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(OPENROUTER_MODEL).toBe('openrouter/free');
    expect(PROVIDER_MODELS.groq).toBe(GROQ_MODEL);
    expect(PROVIDER_MODELS.gemini).toBe(GEMINI_MODEL);
    expect(PROVIDER_MODELS.openrouter).toBe(OPENROUTER_MODEL);
  });

  it('pickGeminiModel: default lite (metadata), preferNonLite → non-lite (analisis)', () => {
    expect(pickGeminiModel()).toBe(GEMINI_MODEL);
    expect(pickGeminiModel(false)).toBe(GEMINI_MODEL);
    expect(pickGeminiModel(true)).toBe(GEMINI_FULL_MODEL);
    expect(GEMINI_FULL_MODEL).not.toContain('-lite');
    expect(GEMINI_MODEL).toContain('-lite');
  });

  it('adapter mengambil model dari models.ts (bukan literal sendiri)', () => {
    for (const file of ['gemini.ts', 'groq.ts', 'openrouter.ts']) {
      expect(read(file), file).toContain("from './models'");
    }
  });

  it('tak ada daftar preferensi umum / deteksi otomatis / fallback antar model di folder provider', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const joined = files.map((f) => read(f)).join('\n');
    expect(joined).not.toMatch(/MODEL_PREFS|FALLBACK_MODEL|_MODEL_PREFS/);
    // daftar model kandidat bekas ("gemini-2.5-flash", "gemini-1.5-flash", …) tidak boleh hidup lagi
    expect(joined).not.toMatch(/gemini-(1|2)\.\d/);
  });
});
