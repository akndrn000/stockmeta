// Tes SATU MODEL PER PROVIDER: konstanta tunggal di models.ts, dipakai adapter, tanpa
// daftar preferensi / deteksi otomatis / pemilihan model dinamis di provider mana pun.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEMINI_MODEL, GROQ_MODEL, OPENROUTER_MODEL, PROVIDER_MODELS } from './models';

const DIR = new URL('.', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, DIR), 'utf8');

describe('models.ts', () => {
  it('tepat satu model untuk tiap provider yang tersedia', () => {
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

  it('adapter mengambil model dari models.ts (bukan literal sendiri)', () => {
    for (const file of ['gemini.ts', 'groq.ts', 'openrouter.ts']) {
      expect(read(file), file).toContain("from './models'");
    }
  });

  it('tak ada daftar model / deteksi otomatis / pemilihan model dinamis di folder provider', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const joined = files.map((f) => read(f)).join('\n');
    expect(joined).not.toMatch(/MODEL_PREFS|pickGeminiModel|FALLBACK_MODEL|_MODEL_PREFS/);
    // daftar model kandidat bekas ("gemini-2.5-flash", "gemini-1.5-flash", …) tidak boleh hidup lagi
    expect(joined).not.toMatch(/gemini-(1|2)\.\d/);
  });
});
