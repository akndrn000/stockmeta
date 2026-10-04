// Tes fallback ANTAR PROVIDER: aktif gagal karena 429 kuota harian / 503 setelah retry habis
// → diproses provider lain yang key-nya tersimpan; toggle mati atau tanpa key lain → gagal
// dengan pesan asli. Adapter & key disuntikkan lewat deps (tanpa jaringan, tanpa localStorage).
import { describe, expect, it, vi } from 'vitest';
import type { ParsedMetadata } from '../prompt';
import type { AnalysisResult, ProviderId } from '../types';
import { FALLBACK_ORDER, analyzeWithFallback, canFallback, generateWithFallback } from './fallback';
import { ProviderError, dailyQuotaError } from './retry';
import type { ProviderAdapter, TestResult } from './types';

const META: ParsedMetadata = { title: 'Judul contoh yang menjual' } as ParsedMetadata;
const ARGS = {
  provider: 'groq' as const,
  apiKey: 'k-groq',
  image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
  platform: 'adobe' as const
};

type Id = 'groq' | 'gemini' | 'custom';

function fakeAdapter(id: Id, impl: () => Promise<ParsedMetadata>): ProviderAdapter {
  return {
    id,
    label: id,
    supportsVision: true,
    testConnection: async (): Promise<TestResult> => ({ ok: true }),
    generateForImage: impl,
    analyzeImage: async () => ({ verdict: 'layak', issues: [], summary: '' }),
    callText: async () => '{}',
    callJudge: async () => ({
      verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
      category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
    })
  };
}

function setup(opts: {
  primary: () => Promise<ParsedMetadata>;
  /** adapter cadangan per provider (selain provider aktif) */
  others?: Partial<Record<Id, () => Promise<ParsedMetadata>>>;
  keys?: Partial<Record<Id, string>>;
  enabled?: boolean;
}) {
  const keys = { groq: 'k-groq', gemini: 'k-gemini', custom: 'k-custom', ...opts.keys };
  const enabled = opts.enabled ?? true;
  const getAdapter = vi.fn((id: ProviderId): ProviderAdapter | undefined => {
    const impl = id === 'groq' ? opts.primary : opts.others?.[id as Id];
    return impl ? fakeAdapter(id as Id, impl) : undefined;
  });
  const getKey = vi.fn((id: ProviderId): string => keys[id as Id] ?? '');
  const isEnabled = vi.fn(() => enabled);
  const getCustomConfig = vi.fn(() => ({ baseUrl: 'https://contoh.test/v1', model: 'model-uji' }));
  return { getAdapter, getKey, isEnabled, getCustomConfig, deps: { getAdapter, getKey, isEnabled, getCustomConfig } };
}

describe('canFallback', () => {
  it('429 kuota harian & 503 → layak fallback', () => {
    expect(canFallback(dailyQuotaError('Gemini', 'Groq'))).toBe(true);
    expect(canFallback(new ProviderError('Sibuk', { status: 503 }))).toBe(true);
  });

  it('429 per menit, 401/400, batal, dan error biasa → TIDAK fallback', () => {
    expect(canFallback(new ProviderError('Rate limit', { status: 429 }))).toBe(false);
    expect(canFallback(new ProviderError('Key salah', { status: 401 }))).toBe(false);
    expect(canFallback(new ProviderError('Dibatalkan'))).toBe(false);
    expect(canFallback(new Error('error biasa'))).toBe(false);
  });
});

describe('generateWithFallback', () => {
  it('provider aktif sukses → tanpa sentuh provider lain', async () => {
    const s = setup({ primary: async () => META });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out).toEqual({ meta: META, provider: 'groq', usedFallback: false });
    expect(s.getAdapter).toHaveBeenCalledTimes(1);
    expect(s.getKey).not.toHaveBeenCalled();
  });

  it('kuota harian habis → frame diproses provider lain yang key-nya tersimpan', async () => {
    const s = setup({
      primary: async () => { throw dailyQuotaError('Groq', 'Gemini'); },
      others: { gemini: async () => META }
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out.provider).toBe('gemini');
    expect(out.usedFallback).toBe(true);
    expect(s.getAdapter.mock.calls.map((c) => c[0])).toEqual(['groq', 'gemini']);
  });

  it('503 setelah retry habis → ikut fallback', async () => {
    const s = setup({
      primary: async () => { throw new ProviderError('Sibuk', { status: 503 }); },
      others: { gemini: async () => META }
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out).toMatchObject({ provider: 'gemini', usedFallback: true });
  });

  it('toggle mati → TIDAK fallback, error asli dilempar utuh', async () => {
    const s = setup({
      primary: async () => { throw dailyQuotaError('Groq', 'Gemini'); },
      others: { gemini: async () => META },
      enabled: false
    });
    await expect(generateWithFallback(ARGS, s.deps)).rejects.toThrow(
      'Kuota harian Groq habis, coba lagi besok atau pakai Gemini.'
    );
    expect(s.getAdapter).toHaveBeenCalledTimes(1);
  });

  it('key provider lain tidak ada → tidak fallback, cukup gagal dengan pesan jelas', async () => {
    const s = setup({
      primary: async () => { throw dailyQuotaError('Groq', 'Gemini'); },
      others: { gemini: async () => META },
      keys: { groq: 'k-groq', gemini: '', custom: '' }
    });
    await expect(generateWithFallback(ARGS, s.deps)).rejects.toThrow('Kuota harian Groq habis');
    expect(s.getAdapter.mock.calls.map((c) => c[0])).toEqual(['groq']);
  });

  it('error non-kandidat (401 key salah) → langsung gagal, provider lain tak dicoba', async () => {
    const s = setup({
      primary: async () => { throw new ProviderError('Key salah', { status: 401 }); },
      others: { gemini: async () => META }
    });
    await expect(generateWithFallback(ARGS, s.deps)).rejects.toThrow('Key salah');
    expect(s.getAdapter).toHaveBeenCalledTimes(1);
  });

  it('cadangan pertama ikut kuota harian → lanjut ke cadangan berikutnya; bila semua gagal, pesan aktif yang dilempar', async () => {
    const s = setup({
      primary: async () => { throw dailyQuotaError('Groq', 'Gemini'); },
      others: { gemini: async () => { throw dailyQuotaError('Gemini', 'Groq'); } },
      keys: { groq: 'k-groq', gemini: 'k-gemini', custom: '' }
    });
    await expect(generateWithFallback(ARGS, s.deps)).rejects.toThrow('Kuota harian Groq habis');
    expect(s.getAdapter.mock.calls.map((c) => c[0])).toEqual(['groq', 'gemini']);
  });

  it('cadangan tanpa key dilewati → provider cadangan berikutnya yang dipakai', async () => {
    const s = setup({
      primary: async () => { throw dailyQuotaError('Groq', 'Custom'); },
      others: { custom: async () => META },
      keys: { groq: 'k-groq', gemini: '', custom: 'k-cu' }
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out).toMatchObject({ provider: 'custom', usedFallback: true });
    expect(s.getAdapter.mock.calls.map((c) => c[0])).toEqual(['groq', 'custom']);  // gemini tanpa key dilewati
  });
});

describe('FALLBACK_ORDER', () => {
  it('urutan cadangan: Groq, Gemini, Custom — tanpa provider placeholder', () => {
    expect([...FALLBACK_ORDER]).toEqual(['groq', 'gemini', 'custom']);
    expect(new Set(FALLBACK_ORDER).size).toBe(FALLBACK_ORDER.length);
    expect(FALLBACK_ORDER).not.toContain('coming-soon');
  });
});

describe('analyzeWithFallback (M29)', () => {
  const OK: AnalysisResult = { verdict: 'layak', issues: [], summary: 'OK' };
  const AARGS = {
    provider: 'groq' as const,
    apiKey: 'k-groq',
    image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
    platform: 'adobe' as const
  };

  function setupAnalysis(primary: () => Promise<AnalysisResult>, other?: () => Promise<AnalysisResult>) {
    const mk = (id: Id, analyzeImage: () => Promise<AnalysisResult>): ProviderAdapter => ({
      id,
      label: id,
      supportsVision: true,
      testConnection: async (): Promise<TestResult> => ({ ok: true }),
      generateForImage: async () => ({}),
      analyzeImage,
      callText: async () => '{}',
      callJudge: async () => ({
        verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
        category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
      })
    });
    const getAdapter = vi.fn((id: ProviderId): ProviderAdapter | undefined => {
      if (id === 'groq') return mk('groq', primary);
      if (id === 'gemini' && other) return mk('gemini', other);
      return undefined;
    });
    const getKey = vi.fn((id: ProviderId): string => ({ groq: 'k-groq', gemini: 'k-gemini', custom: '' })[id as Id] ?? '');
    const isEnabled = vi.fn(() => true);
    return { getAdapter, getKey, isEnabled, deps: { getAdapter, getKey, isEnabled } };
  }

  it('aktif sukses → tanpa sentuh provider lain', async () => {
    const s = setupAnalysis(async () => OK);
    const out = await analyzeWithFallback(AARGS, s.deps);
    expect(out).toEqual({ analysis: OK, provider: 'groq', usedFallback: false });
    expect(s.getAdapter).toHaveBeenCalledTimes(1);
  });

  it('kuota harian habis → analisis jalan via cadangan', async () => {
    const s = setupAnalysis(
      async () => { throw dailyQuotaError('Groq', 'Gemini'); },
      async () => OK
    );
    const out = await analyzeWithFallback(AARGS, s.deps);
    expect(out).toMatchObject({ provider: 'gemini', usedFallback: true, analysis: OK });
  });
});
