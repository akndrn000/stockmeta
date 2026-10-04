// Fallback ANTAR PROVIDER (bukan antar model): provider aktif gagal karena 429 kuota harian
// ATAU 503 setelah retry habis → frame diproses lewat provider lain yang key-nya tersimpan.
// Provider fixed memakai SATU model (lihat models.ts); provider custom memakai baseUrl+model
// isi pengguna. Tanpa key lain / toggle mati → gagal dengan pesan asli provider aktif
// (jangan fallback diam-diam).
import type { AnalysisResult } from '../types';
import type { ParsedMetadata } from '../prompt';
import { readCustomBaseUrl, readCustomModel, readFallback, readKey } from '../storage';
import type { Platform, ProviderId } from '../types';
import { getProvider } from './index';
import { ProviderError } from './retry';
import type { WaitInfo } from './retry';
import type { CustomConfig, ImageInput, ProviderAdapter } from './types';

/** Urutan provider cadangan (di luar provider aktif; 'coming-soon' sengaja tidak ada). */
export const FALLBACK_ORDER: readonly ProviderId[] = ['groq', 'gemini', 'custom'];

/** Kandidat layak fallback: 429 kuota harian ATAU 503 setelah retry habis. */
export function canFallback(err: unknown): boolean {
  return err instanceof ProviderError && (err.dailyQuota || err.status === 503);
}

export interface FallbackGenerateArgs {
  /** provider aktif pilihan user */
  provider: ProviderId;
  /** API key provider aktif (dari panel, sudah lewat tes koneksi) */
  apiKey: string;
  image: ImageInput;
  platform: Platform;
  theme?: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
  /** konfigurasi custom bila provider aktif = custom */
  customConfig?: CustomConfig;
}

export interface FallbackDeps {
  getAdapter?: (id: ProviderId) => ProviderAdapter | undefined;
  /** key tersimpan per provider (bawaan: localStorage) */
  getKey?: (id: ProviderId) => string;
  /** toggle panel provider (bawaan: localStorage, default aktif) */
  isEnabled?: () => boolean;
  /** konfigurasi custom cadangan (bawaan: localStorage) */
  getCustomConfig?: () => CustomConfig;
}

export interface FallbackResult {
  meta: ParsedMetadata;
  /** provider yang akhirnya memproses frame */
  provider: ProviderId;
  /** true bila provider cadangan yang dipakai */
  usedFallback: boolean;
}

export async function generateWithFallback(
  opts: FallbackGenerateArgs,
  deps: FallbackDeps = {}
): Promise<FallbackResult> {
  const r = await withFallback(opts, deps, (adapter, apiKey, customConfig) =>
    adapter.generateForImage({
      apiKey,
      image: opts.image,
      platform: opts.platform,
      theme: opts.theme,
      signal: opts.signal,
      onWait: opts.onWait,
      ...(customConfig ? { baseUrl: customConfig.baseUrl, model: customConfig.model } : {})
    }));
  return { meta: r.value, provider: r.provider, usedFallback: r.usedFallback };
}

// M29: fallback untuk analisis — mesin yang sama, hanya panggilan adapter yang beda.
export interface FallbackAnalyzeArgs {
  /** provider aktif pilihan user */
  provider: ProviderId;
  /** API key provider aktif (dari panel, sudah lewat tes koneksi) */
  apiKey: string;
  image: ImageInput;
  platform: Platform;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
  /** konfigurasi custom bila provider aktif = custom */
  customConfig?: CustomConfig;
}

export interface FallbackAnalyzeResult {
  analysis: AnalysisResult;
  /** provider yang akhirnya memproses frame */
  provider: ProviderId;
  /** true bila provider cadangan yang dipakai */
  usedFallback: boolean;
}

export async function analyzeWithFallback(
  opts: FallbackAnalyzeArgs,
  deps: FallbackDeps = {}
): Promise<FallbackAnalyzeResult> {
  const r = await withFallback(opts, deps, (adapter, apiKey, customConfig) =>
    adapter.analyzeImage({
      apiKey,
      image: opts.image,
      platform: opts.platform,
      signal: opts.signal,
      onWait: opts.onWait,
      ...(customConfig ? { baseUrl: customConfig.baseUrl, model: customConfig.model } : {})
    }));
  return { analysis: r.value, provider: r.provider, usedFallback: r.usedFallback };
}

// M29: mesin fallback generik — generate metadata & analisis memakai jalur yang sama:
// provider aktif dulu, gagal layak-fallback (kuota harian/503) → coba cadangan ber-key.
export interface FallbackCallOpts {
  provider: ProviderId;
  apiKey: string;
  signal?: AbortSignal;
  customConfig?: CustomConfig;
}

export async function withFallback<T>(
  opts: FallbackCallOpts,
  deps: FallbackDeps,
  call: (adapter: ProviderAdapter, apiKey: string, customConfig?: CustomConfig) => Promise<T>
): Promise<{ value: T; provider: ProviderId; usedFallback: boolean }> {
  const getAdapter = deps.getAdapter ?? getProvider;
  const getKey = deps.getKey ?? readKey;
  const getCustomConfig = deps.getCustomConfig ?? (() => ({ baseUrl: readCustomBaseUrl(), model: readCustomModel() }));
  const enabled = (deps.isEnabled ?? readFallback)();

  const active = getAdapter(opts.provider);
  if (!active) throw new ProviderError('Provider tidak tersedia', { retryable: false });
  const activeConfig = opts.provider === 'custom' ? (opts.customConfig ?? getCustomConfig()) : undefined;

  try {
    const value = await call(active, opts.apiKey, activeConfig);
    return { value, provider: opts.provider, usedFallback: false };
  } catch (err) {
    if (!enabled || opts.signal?.aborted || !canFallback(err)) throw err;
    for (const id of FALLBACK_ORDER) {
      if (id === opts.provider) continue;
      const key = getKey(id).trim();
      if (!key) continue;
      const adapter = getAdapter(id);
      if (!adapter) continue;
      if (id === 'custom') {
        const cfg = getCustomConfig();
        if (!cfg.baseUrl.trim() || !cfg.model.trim()) continue;
        try {
          const value = await call(adapter, key, cfg);
          return { value, provider: id, usedFallback: true };
        } catch { /* provider cadangan juga gagal → coba berikutnya */ }
        continue;
      }
      try {
        const value = await call(adapter, key, undefined);
        return { value, provider: id, usedFallback: true };
      } catch { /* provider cadangan juga gagal → coba berikutnya */ }
    }
    throw err;   // tak ada key lain / semua cadangan gagal → pesan jelas dari provider aktif
  }
}
