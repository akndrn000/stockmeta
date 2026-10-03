// Orkestrasi batch generate (M8): berurutan per frame, jeda antar frame, gagal-lanjut,
// batal via AbortSignal. Murni tanpa React & tanpa akses store — semua dependensi
// diinjeksi (lihat useBatch.ts untuk pemanggilan nyatanya).
// M29: generik atas hasil per frame (T = ParsedMetadata metadata, AnalysisResult analisis)
// — jalur metadata memakai default sehingga perilakunya identik seperti sebelumnya.
import type { ParsedMetadata } from './prompt';
import { BATCH_DELAY_MS, type WaitInfo } from './providers/retry';
import type { Platform } from './types';

/** pesan wajib untuk frame yang file aslinya hilang (sesi restore tanpa upload ulang) */
export const MISSING_FILE_MSG = 'File asli tidak tersedia — upload ulang frame ini';

export interface GenerateFrameArgs {
  platform: Platform;
  theme: string;
  signal?: AbortSignal;
  onWait?: (info: WaitInfo) => void;
}

export interface BatchSummary {
  /** frame yang berhasil */
  done: number;
  /** frame yang gagal (termasuk file hilang) */
  failed: number;
  /** frame yang tidak sempat diproses karena batal */
  skipped: number;
  cancelled: boolean;
  /** total frame dalam batch (untuk progress bar) */
  total: number;
}

export interface BatchOptions<T = ParsedMetadata> {
  frameIds: number[];
  platform: Platform;
  generate: (id: number, args: GenerateFrameArgs) => Promise<T>;
  getImage: (id: number) => File | undefined;
  getTheme: (id: number) => string;
  onStart?: (id: number) => void;
  /** frame yang sedang diproses saat batch dibatalkan — UI mengembalikannya ke 'menunggu' */
  onCancel?: (id: number) => void;
  onWait?: (id: number, info: WaitInfo) => void;
  onSuccess: (id: number, result: T) => void;
  onError: (id: number, message: string) => void;
  signal?: AbortSignal;
  /** jeda antar frame; hanya dihitung bila frame sebelumnya benar-benar memanggil API */
  delayMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

type Outcome<T> = { ok: T } | { error: unknown } | { stopped: true };

// Jeda tidur yang ikut terbangun saat signal dibatalkan (tidak pernah reject) — batch
// mengecek `signal.aborted` sesudahnya, jadi pembatalan tetap memutus di titik itu.
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(onEnd, ms);
    function onAbort() { onEnd(); }
    function onEnd() {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortSignal(signal?: AbortSignal): Promise<void> {
  if (!signal) return new Promise<void>(() => {});          // tanpa signal → tidak pernah menang
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

function errMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : 'Gagal diproses';
}

export async function runBatch<T = ParsedMetadata>(opts: BatchOptions<T>): Promise<BatchSummary> {
  const { frameIds, platform, generate, getImage, getTheme, onSuccess, onError, signal } = opts;
  const delayMs = opts.delayMs ?? BATCH_DELAY_MS;
  const sleep = opts.sleep ?? abortableSleep;
  const total = frameIds.length;
  const summary: BatchSummary = { done: 0, failed: 0, skipped: 0, cancelled: false, total };
  let pace = false;   // ada panggilan API di frame sebelumnya → layak jeda

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      summary.cancelled = true;
      summary.skipped += total - i;
      break;
    }
    if (pace && delayMs > 0) {
      await sleep(delayMs, signal);
      if (signal?.aborted) {
        summary.cancelled = true;
        summary.skipped += total - i;
        break;
      }
      pace = false;
    }
    const id = frameIds[i];
    if (!getImage(id)) {
      onError(id, MISSING_FILE_MSG);          // file hilang → tanpa jeda lanjut berikutnya
      summary.failed++;
      continue;
    }

    opts.onStart?.(id);
    pace = true;
    const settled: Promise<Outcome<T>> = generate(id, {
      platform,
      theme: getTheme(id),
      signal,
      onWait: (info) => {
        if (!signal?.aborted) opts.onWait?.(id, info);
      }
    }).then(
      (meta) => ({ ok: meta }),
      (error) => ({ error })
    );
    const stop: Promise<Outcome<T>> = abortSignal(signal).then(() => ({ stopped: true as const }));
    const outcome = await Promise.race<Outcome<T>>([settled, stop]);
    if ('stopped' in outcome || (signal?.aborted && 'error' in outcome)) {
      // batal di tengah frame berjalan: frame ini kembali 'menunggu', sisa tak disentuh
      summary.cancelled = true;
      summary.skipped += total - i;
      opts.onCancel?.(id);
      break;
    }
    if ('error' in outcome) {
      onError(id, errMessage(outcome.error));   // pesan error asli, batch tetap lanjut
      summary.failed++;
    } else {
      onSuccess(id, outcome.ok);
      summary.done++;
    }
  }
  return summary;
}
