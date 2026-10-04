// Fallback ANTAR PROVIDER (bukan antar model): provider aktif gagal karena 429 kuota harian
// ATAU 503 setelah retry habis → frame diproses lewat provider lain yang key-nya tersimpan.
// Tiap provider memakai SATU model tetap (lihat models.ts). Tanpa key lain / toggle mati →
// gagal dengan pesan asli provider aktif (jangan fallback diam-diam).
import type { AnalysisResult } from '../types';
import type { ParsedMetadata } from '../prompt';
import { readFallback, readKey } from '../storage';
import type { Platform, ProviderId } from '../types';
import { getProvider } from './index';
import { ProviderError } from './retry';
import type { WaitInfo } from './retry';
import type { ImageInput, ProviderAdapter } from './types';

/** Urutan provider cadangan (di luar provider aktif). */
export const FALLBACK_ORDER: readonly ProviderId[] = ['groq', 'gemini', 'openrouter'];

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
}

export interface FallbackDeps {
  getAdapter?: (id: ProviderId) => ProviderAdapter | undefined;
  /** key tersimpan per provider (bawaan: localStorage) */
  getKey?: (id: ProviderId) => string;
  /** toggle panel provider (bawaan: localStorage, default aktif) */
  isEnabled?: () => boolean;
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
  const r = await withFallback(opts, deps, (adapter, apiKey) =>
    adapter.generateForImage({
      apiKey,
      image: opts.image,
      platform: opts.platform,
      theme: opts.theme,
      signal: opts.signal,
      onWait: opts.onWait
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
  const r = await withFallback(opts, deps, (adapter, apiKey) =>
    adapter.analyzeImage({
      apiKey,
      image: opts.image,
      platform: opts.platform,
      signal: opts.signal,
      onWait: opts.onWait
    }));
  return { analysis: r.value, provider: r.provider, usedFallback: r.usedFallback };
}

// M29: mesin fallback generik — generate metadata & analisis memakai jalur yang sama:
// provider aktif dulu, gagal layak-fallback (kuota harian/503) → coba cadangan ber-key.
export interface FallbackCallOpts {
  provider: ProviderId;
  apiKey: string;
  signal?: AbortSignal;
}

export async function withFallback<T>(
  opts: FallbackCallOpts,
  deps: FallbackDeps,
  call: (adapter: ProviderAdapter, apiKey: string) => Promise<T>
): Promise<{ value: T; provider: ProviderId; usedFallback: boolean }> {
  const getAdapter = deps.getAdapter ?? getProvider;
  const getKey = deps.getKey ?? readKey;
  const enabled = (deps.isEnabled ?? readFallback)();

  const active = getAdapter(opts.provider);
  if (!active) throw new ProviderError('Provider tidak tersedia', { retryable: false });

  try {
    const value = await call(active, opts.apiKey);
    return { value, provider: opts.provider, usedFallback: false };
  } catch (err) {
    if (!enabled || opts.signal?.aborted || !canFallback(err)) throw err;
    for (const id of FALLBACK_ORDER) {
      if (id === opts.provider) continue;
      const key = getKey(id).trim();
      if (!key) continue;
      const adapter = getAdapter(id);
      if (!adapter) continue;
      try {
        const value = await call(adapter, key);
        return { value, provider: id, usedFallback: true };
      } catch { /* provider cadangan juga gagal → coba berikutnya */ }
    }
    throw err;   // tak ada key lain / semua cadangan gagal → pesan jelas dari provider aktif
  }
}
