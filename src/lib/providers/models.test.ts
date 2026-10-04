// Tes SATU MODEL PER PROVIDER FIXED + provider custom tanpa hardcode: konstanta tunggal
// di models.ts untuk Groq/Gemini; provider custom memakai baseUrl + model isi pengguna.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GEMINI_MODEL, GROQ_MODEL, PROVIDER_MODELS } from './models';

const DIR = new URL('.', import.meta.url);
const read = (file: string): string => readFileSync(new URL(file, DIR), 'utf8');

describe('models.ts', () => {
  it('tepat satu model untuk tiap provider fixed (custom diisi pengguna)', () => {
    expect(Object.keys(PROVIDER_MODELS).sort()).toEqual(['gemini', 'groq']);
  });

  it('nilai model sesuai spek', () => {
    expect(GROQ_MODEL).toBe('qwen/qwen3.8-27b');
    expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
    expect(PROVIDER_MODELS.groq).toBe(GROQ_MODEL);
    expect(PROVIDER_MODELS.gemini).toBe(GEMINI_MODEL);
  });

  it('adapter fixed mengambil model dari models.ts (bukan literal sendiri)', () => {
    for (const file of ['gemini.ts', 'groq.ts']) {
      expect(read(file), file).toContain("from './models'");
    }
  });

  it('adapter custom tanpa hardcode layanan/model/base URL', () => {
    const src = read('custom.ts');
    expect(src).toContain('baseUrl');
    expect(src).not.toContain('openrouter.ai');
    expect(src).not.toContain('openrouter/free');
  });

  it('tak ada daftar model / deteksi otomatis / pemilihan model dinamis di folder provider', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    const joined = files.map((f) => read(f)).join('\n');
    expect(joined).not.toMatch(/MODEL_PREFS|pickGeminiModel|FALLBACK_MODEL|_MODEL_PREFS/);
    // daftar model kandidat bekas ("gemini-2.5-flash", "gemini-1.5-flash", …) tidak boleh hidup lagi
    expect(joined).not.toMatch(/gemini-(1|2)\.\d/);
  });
});
