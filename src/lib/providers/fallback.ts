// Fallback ANTAR PROVIDER (bukan antar model): provider aktif gagal karena 429 kuota harian
// ATAU 503 setelah retry habis → frame diproses lewat provider lain yang key-nya tersimpan.
// Tiap provider tetap memakai SATU model (lihat models.ts). Tanpa key lain / toggle mati →
// gagal dengan pesan asli provider aktif (jangan fallback diam-diam).
import { TARGET_KEYWORDS_MIN } from '../limits';
import type { ParsedMetadata } from '../prompt';
import { readFallback, readKey } from '../storage';
import type { Platform, ProviderId } from '../types';
import { getProvider } from './index';
import { ProviderError } from './retry';
import type { WaitInfo } from './retry';
import {
  TOPUP_ATTEMPT_DELAY_MS,
  TOPUP_MAX_CALLS,
  buildTopupPrompt,
  countKeywords,
  existingKeywordList,
  mergeTopupKeywords,
  needsTopup,
  sleepAbortable
} from './topup';
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
  /** Fase 3: diteruskan ke adapter sebagai instruksi koreksi bahasa. */
  languageFix?: boolean;
  /** Fase 4: catatan kekurangan keyword untuk retry. */
  retryNote?: string;
  /** M33 Fase 2c: prompt pengganti Tahap D (gambar tetap dikirim). */
  promptOverride?: string;
  /** Observabilitas top-up (opsional): dipanggil tiap percobaan (1 = awal, 2-3 = follow-up). */
  onTopup?: (info: { attempt: number; count: number }) => void;
}

export interface FallbackDeps {
  getAdapter?: (id: ProviderId) => ProviderAdapter | undefined;
  /** key tersimpan per provider (bawaan: localStorage) */
  getKey?: (id: ProviderId) => string;
  /** toggle panel provider (bawaan: localStorage, default aktif) */
  isEnabled?: () => boolean;
  /** jeda antar percobaan top-up (bawaan TOPUP_ATTEMPT_DELAY_MS; 0 di tes) */
  topupDelayMs?: number;
}

export interface FallbackResult {
  meta: ParsedMetadata;
  /** provider yang akhirnya memproses frame */
  provider: ProviderId;
  /** true bila provider cadangan yang dipakai */
  usedFallback: boolean;
  /** total panggilan generateForImage untuk frame ini (1 awal + follow-up, maks 3) */
  topupAttempts: number;
  /** jumlah keyword hasil lapisan provider (sebelum finalisasi) */
  topupCount: number;
}

export async function generateWithFallback(
  opts: FallbackGenerateArgs,
  deps: FallbackDeps = {}
): Promise<FallbackResult> {
  const getAdapter = deps.getAdapter ?? getProvider;
  const getKey = deps.getKey ?? readKey;
  const enabled = (deps.isEnabled ?? readFallback)();

  const run = (adapter: ProviderAdapter, apiKey: string): Promise<ParsedMetadata> =>
    adapter.generateForImage({
      apiKey,
      image: opts.image,
      platform: opts.platform,
      theme: opts.theme,
      signal: opts.signal,
      onWait: opts.onWait,
      languageFix: opts.languageFix,
      retryNote: opts.retryNote,
      promptOverride: opts.promptOverride
    });

  const active = getAdapter(opts.provider);
  if (!active) throw new ProviderError('Provider tidak tersedia', { retryable: false });

  // Top-up keyword: LOOP maksimal TOPUP_MAX_CALLS panggilan total (1 awal + 2
  // follow-up) ke adapter & key yang SAMA, gambar yang sama dikirim ulang tiap
  // percobaan — model butuh konteks visual lagi. Tiap follow-up mencantumkan daftar
  // keyword SEJAUH ITU (bukan cuma panggilan pertama) agar tak mengulang. Jeda
  // singkat antar percobaan supaya tak memicu rate limit. Tetap satu frame di
  // progress batch; follow-up gagal → hasil sejauh itu (batal → tetap batal).
  const withTopup = async (
    adapter: ProviderAdapter,
    apiKey: string,
    meta: ParsedMetadata
  ): Promise<{ meta: ParsedMetadata; attempts: number }> => {
    const once = { meta, attempts: 1 };
    if (opts.promptOverride) return once;   // Tahap D verifikasi → bukan metadata
    // Retry (koreksi bahasa / perluasan useBatch) adalah jaring pengaman KEDUA —
    // jangan menumpuk top-up di atasnya (maksimal +1 panggilan per frame).
    if (opts.languageFix || opts.retryNote) return once;
    opts.onTopup?.({ attempt: 1, count: countKeywords(meta) });
    let current = meta;
    let attempts = 1;
    const delayMs = deps.topupDelayMs ?? TOPUP_ATTEMPT_DELAY_MS;
    while (attempts < TOPUP_MAX_CALLS && needsTopup(current)) {
      if (opts.signal?.aborted) throw new ProviderError('Dibatalkan', { retryable: false });
      if (delayMs > 0) {
        await sleepAbortable(delayMs, opts.signal);
        if (opts.signal?.aborted) throw new ProviderError('Dibatalkan', { retryable: false });
      }
      let extra: ParsedMetadata;
      try {
        extra = await adapter.generateForImage({
          apiKey,
          image: opts.image,
          platform: opts.platform,
          theme: opts.theme,
          signal: opts.signal,
          onWait: opts.onWait,
          promptOverride: buildTopupPrompt(existingKeywordList(current))
        });
        current = mergeTopupKeywords(current, extra, opts.platform);
      } catch (e) {
        if (opts.signal?.aborted) throw e;   // batal → batal beneran, jangan ditelan
        break;   // follow-up gagal → hasil sejauh ini (lebih baik sedikit daripada gagal total)
      }
      attempts++;
      opts.onTopup?.({ attempt: attempts, count: countKeywords(current) });
    }
    const count = countKeywords(current);
    // PERMANEN (bukan debug): pemantauan batas kemampuan nyata provider/model.
    if (attempts >= TOPUP_MAX_CALLS && count < TARGET_KEYWORDS_MIN) {
      console.warn(
        `[topup] Frame gagal capai target keyword: ${count}/${TARGET_KEYWORDS_MIN} setelah ${attempts} percobaan (provider: ${adapter.id})`
      );
    }
    return { meta: current, attempts };
  };

  try {
    const meta = await run(active, opts.apiKey);
    const topped = await withTopup(active, opts.apiKey, meta);
    return {
      meta: topped.meta,
      provider: opts.provider,
      usedFallback: false,
      topupAttempts: topped.attempts,
      topupCount: countKeywords(topped.meta)
    };
  } catch (err) {
    if (!enabled || opts.signal?.aborted || !canFallback(err)) throw err;
    for (const id of FALLBACK_ORDER) {
      if (id === opts.provider) continue;
      const key = getKey(id).trim();
      if (!key) continue;
      const adapter = getAdapter(id);
      if (!adapter) continue;
      try {
        const meta = await run(adapter, key);
        const topped = await withTopup(adapter, key, meta);
        return {
          meta: topped.meta,
          provider: id,
          usedFallback: true,
          topupAttempts: topped.attempts,
          topupCount: countKeywords(topped.meta)
        };
      } catch { /* provider cadangan juga gagal → coba berikutnya */ }
    }
    throw err;   // tak ada key lain / semua cadangan gagal → pesan jelas dari provider aktif
  }
}
