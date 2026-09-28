// Retry sabar — satu-satunya tempat keputusan tunggu/retry (429/503/dst, hormati retry-after).
// BATCH_DELAY_MS dipakai jeda antar gambar di M8, BUKAN di sini.
export const BATCH_DELAY_MS = 3000;

// Respons kosong / JSON tidak valid tidak deterministik → maksimal 2 retry saja.
export const MODEL_RETRY_MAX = 2;

const MAX_WAIT_MS = 120_000;   // di atas ini kita menyerah, bukan menunggu
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class ProviderError extends Error {
  status?: number;
  retryAfterMs?: number;
  retryable: boolean;
  /** jumlah retry maksimal untuk error ini (default: maxAttempts - 1) */
  maxRetries?: number;

  constructor(message: string, opts: { status?: number; retryAfterMs?: number; retryable?: boolean; maxRetries?: number } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.retryable = opts.retryable ?? (opts.status !== undefined && RETRYABLE_STATUS.has(opts.status));
    this.maxRetries = opts.maxRetries;
  }
}

export interface WaitInfo {
  attempt: number;
  maxAttempts: number;
  waitMs: number;
  reason: string;
}

export interface RetryOptions {
  /** total percobaan (1 awal + retry) */
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

function baseWaitMs(e: ProviderError): number {
  if (e.retryAfterMs) return e.retryAfterMs;
  if (e.status === 429) return 20000;
  return 5000;   // 503/500/502/504/jaringan
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const sleep = opts.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const e = toProviderError(err);
      const allowed = e.maxRetries ?? maxAttempts - 1;
      if (!e.retryable || attempt >= maxAttempts || attempt > allowed) throw e;

      const base = baseWaitMs(e);
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
