// Retry sabar — satu-satunya tempat keputusan tunggu/retry (429/503/dst, hormati retry-after).
// 429 dibedakan: limit per MENIT → tunggu sesuai header/pesan lalu coba lagi (maks 2 retry);
// kuota HARIAN habis (RESOURCE_EXHAUSTED / pesan "…per day") → TIDAK di-retry sama sekali.
// 503/sibuk → backoff 5s/10s (2 retry) lalu gagal. Total percobaan maksimal 3.
// BATCH_DELAY_MS dipakai jeda antar gambar di M8, BUKAN di sini.
export const BATCH_DELAY_MS = 3000;

// Respons kosong / JSON tidak valid tidak deterministik → maksimal 2 retry saja.
export const MODEL_RETRY_MAX = 2;

/** total percobaan bawaan: 1 panggilan awal + maksimal 2 retry. */
export const MAX_ATTEMPTS_DEFAULT = 3;

const MAX_WAIT_MS = 120_000;   // di atas ini kita menyerah, bukan menunggu
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface ProviderErrorOpts {
  status?: number;
  retryAfterMs?: number;
  retryable?: boolean;
  maxRetries?: number;
  /** true = 429 kuota HARIAN habis → tanpa retry, layak fallback antar provider */
  dailyQuota?: boolean;
}

export class ProviderError extends Error {
  status?: number;
  retryAfterMs?: number;
  retryable: boolean;
  /** jumlah retry maksimal untuk error ini (default: maxAttempts - 1) */
  maxRetries?: number;
  /** true bila 429 kuota harian habis (bukan limit per menit) */
  dailyQuota: boolean;

  constructor(message: string, opts: ProviderErrorOpts = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.retryable = opts.retryable ?? (opts.status !== undefined && RETRYABLE_STATUS.has(opts.status));
    this.maxRetries = opts.maxRetries;
    this.dailyQuota = opts.dailyQuota ?? false;
  }
}

/**
 * Klasifikasi error 429 dari body respons: true = kuota HARIAN habis
 * (RESOURCE_EXHAUSTED Google atau pesan "…kuota per day"), false = limit per menit
 * (mis. "Rate limit reached, try again in 7.5s") yang boleh di-retry.
 */
export function isDailyQuota(status: number, bodyText: string): boolean {
  if (status !== 429) return false;
  if (/RESOURCE_EXHAUSTED/i.test(bodyText)) return true;                 // gaya Google
  if (/\b(daily|today|tomorrow|besok|harian)\b/i.test(bodyText)) return true;
  if (/\bper[\s-]?(day|hari)\b/i.test(bodyText)) return true;
  return /(quota|kuota)[^\n]{0,120}(per[\s-]?day|per[\s-]?hari|harian|daily)/i.test(bodyText);
}

/** Error 429 kuota harian: tanpa retry, pesan jelas berbahasa Indonesia. */
export function dailyQuotaError(label: string, alternative: string): ProviderError {
  return new ProviderError(
    `Kuota harian ${label} habis, coba lagi besok atau pakai ${alternative}.`,
    { status: 429, retryable: false, dailyQuota: true }
  );
}

export interface WaitInfo {
  attempt: number;
  maxAttempts: number;
  waitMs: number;
  reason: string;
}

export interface RetryOptions {
  /** total percobaan (1 awal + retry); default MAX_ATTEMPTS_DEFAULT = 3 */
  maxAttempts?: number;
  onWait?: (info: WaitInfo) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// error non-ProviderError (TypeError fetch, Error kind 'json' dari parser) dipetakan ke sini
function toProviderError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const e = err as { message?: string; kind?: string } | null;
  const kind = e && typeof e.kind === 'string' ? e.kind : '';
  if (kind === 'json' || kind === 'empty') {
    return new ProviderError(e?.message || 'JSON tidak valid', { retryable: true, maxRetries: MODEL_RETRY_MAX });
  }
  if (err instanceof TypeError) {
    return new ProviderError('Tidak ada koneksi', { retryable: true });
  }
  return new ProviderError(e?.message || 'Gagal diproses', { retryable: false });
}

function baseWaitMs(e: ProviderError, attempt: number): number {
  if (e.retryAfterMs) return e.retryAfterMs;
  if (e.status === 429) return 20000;                      // limit per menit: reset cepat
  return 5000 * Math.pow(2, attempt - 1);                  // 503/500/…: backoff 5s → 10s
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS_DEFAULT;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = toProviderError(err);
      const allowed = e.maxRetries ?? maxAttempts - 1;
      if (!e.retryable || attempt >= maxAttempts || attempt > allowed) throw e;

      const base = baseWaitMs(e, attempt);
      if (base > MAX_WAIT_MS) {
        throw new ProviderError(
          'Kuota harian/limit panjang tercapai, coba lagi nanti (~' + Math.ceil(base / 60000) + ' menit)',
          { status: e.status, retryable: false }
        );
      }
      if (opts.signal?.aborted) throw e;

      const waitMs = base + Math.floor(Math.random() * 1000);   // jitter kecil 0–1 detik
      opts.onWait?.({
        attempt,
        maxAttempts,
        waitMs,
        reason: e.status !== undefined ? 'HTTP ' + e.status : e.message
      });
      await sleep(waitMs);
    }
  }
}

function durationMs(text: string): number | undefined {
  const re = /(\d+(?:\.\d+)?)(ms|[smhd])/g;
  let total = 0;
  let found = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    found = true;
    const n = Number(m[1]);
    total += m[2] === 'ms' ? n : m[2] === 's' ? n * 1000 : m[2] === 'm' ? n * 60000
      : m[2] === 'h' ? n * 3600000 : n * 86400000;
  }
  return found ? Math.round(total) : undefined;
}

const DUR = String.raw`(\d+(?:\.\d+)?(?:ms|[smhd])(?:\d+(?:\.\d+)?(?:ms|[smhd]))*)`;

/** header retry-after (detik atau HTTP-date), lalu isi body: "try again in 7.5s" (Groq) /
 *  "retryDelay":"34s" (Google RetryInfo). Kembalikan milidetik atau undefined. */
export function parseRetryAfter(headers: Headers, bodyText?: string): number | undefined {
  const raw = headers.get('retry-after');
  if (raw) {
    const secs = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(secs)) return Math.max(1000, Math.round(secs * 1000));
    const when = Date.parse(raw);
    if (Number.isFinite(when)) return Math.max(1000, when - Date.now());
  }
  if (!bodyText) return undefined;
  const m = bodyText.match(new RegExp('try again in\\s+' + DUR, 'i'))
    || bodyText.match(new RegExp('["\']retryDelay["\']\\s*:\\s*["\']([^"\']+)["\']', 'i'))
    || bodyText.match(new RegExp('\\bin\\s+' + DUR, 'i'));
  if (!m || !m[1]) return undefined;
  const ms = durationMs(m[1]);
  return ms === undefined ? undefined : Math.max(1000, ms);
}
