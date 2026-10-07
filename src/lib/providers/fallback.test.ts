// Tes fallback ANTAR PROVIDER: aktif gagal karena 429 kuota harian / 503 setelah retry habis
// → diproses provider lain yang key-nya tersimpan; toggle mati atau tanpa key lain → gagal
// dengan pesan asli. Adapter & key disuntikkan lewat deps (tanpa jaringan, tanpa localStorage).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedMetadata } from '../prompt';
import type { ProviderId } from '../types';
import { FALLBACK_ORDER, canFallback, generateWithFallback } from './fallback';
import { ProviderError, dailyQuotaError } from './retry';
import type { ProviderAdapter, TestResult } from './types';

const META: ParsedMetadata = { title: 'Judul contoh yang menjual' } as ParsedMetadata;
const ARGS = {
  provider: 'groq' as const,
  apiKey: 'k-groq',
  image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
  platform: 'adobe' as const
};

type Id = 'groq' | 'gemini' | 'openrouter';

function fakeAdapter(id: Id, impl: () => Promise<ParsedMetadata>): ProviderAdapter {
  return { id, testConnection: async (): Promise<TestResult> => ({ ok: true }), generateForImage: impl };
}

function setup(opts: {
  primary: () => Promise<ParsedMetadata>;
  /** adapter cadangan per provider (selain provider aktif) */
  others?: Partial<Record<Id, () => Promise<ParsedMetadata>>>;
  keys?: Partial<Record<Id, string>>;
  enabled?: boolean;
}) {
  const keys = { groq: 'k-groq', gemini: 'k-gemini', openrouter: 'k-openrouter', ...opts.keys };
  const enabled = opts.enabled ?? true;
  const getAdapter = vi.fn((id: ProviderId): ProviderAdapter | undefined => {
    const impl = id === 'groq' ? opts.primary : opts.others?.[id as Id];
    return impl ? fakeAdapter(id as Id, impl) : undefined;
  });
  const getKey = vi.fn((id: ProviderId): string => keys[id as Id] ?? '');
  const isEnabled = vi.fn(() => enabled);
  // top-up tanpa jeda di tes (produksi 1,5 dtk antar percobaan)
  const deps = { getAdapter, getKey, isEnabled, topupDelayMs: 0 };
  return { getAdapter, getKey, isEnabled, deps };
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
  // withTopup SELALU console.warn (produksi: browser Console) — dibisukan di sini
  // supaya output tes bersih; isi log di-assert di topup.test.ts.
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('provider aktif sukses → tanpa sentuh provider lain (top-up no-op: extra kosong)', async () => {
    const s = setup({ primary: async () => META });
    const out = await generateWithFallback(ARGS, s.deps);
    // META tanpa keyword → loop top-up jalan sampai 3x tapi merge no-op
    expect(out).toEqual({ meta: META, provider: 'groq', usedFallback: false, topupAttempts: 3, topupCount: 0 });
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
      keys: { groq: 'k-groq', gemini: '', openrouter: '' }
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
      keys: { groq: 'k-groq', gemini: 'k-gemini', openrouter: '' }
    });
    await expect(generateWithFallback(ARGS, s.deps)).rejects.toThrow('Kuota harian Groq habis');
    expect(s.getAdapter.mock.calls.map((c) => c[0])).toEqual(['groq', 'gemini']);
  });

  it('cadangan tanpa key dilewati → provider cadangan berikutnya yang dipakai', async () => {
    const s = setup({
      primary: async () => { throw dailyQuotaError('Groq', 'OpenRouter'); },
      others: { openrouter: async () => META },
      keys: { groq: 'k-groq', gemini: '', openrouter: 'k-or' }
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out).toMatchObject({ provider: 'openrouter', usedFallback: true });
    expect(s.getAdapter.mock.calls.map((c) => c[0])).toEqual(['groq', 'openrouter']);  // gemini tanpa key dilewati
  });
});

describe('FALLBACK_ORDER', () => {
  it('urutan cadangan: Groq, Gemini, OpenRouter — tanpa provider placeholder', () => {
    expect([...FALLBACK_ORDER]).toEqual(['groq', 'gemini', 'openrouter']);
    expect(new Set(FALLBACK_ORDER).size).toBe(FALLBACK_ORDER.length);
    expect(FALLBACK_ORDER).not.toContain('coming-soon');
  });
});
