// Runner browser: hitung metrik dari FILE ASLI di Web Worker (OffscreenCanvas),
// frame serial, bitmap dilepaskan, batas ukuran wajar, pesan jelas bila gagal.
// Fallback ke thread utama bila Worker/OffscreenCanvas tidak tersedia.
import type { ObservationMediaType } from '../observation';
import { computeQualityMetrics, type PixelFrame, type QualityMetrics } from './metrics';

export const MAX_FILE_BYTES = 80 * 1024 * 1024;

const WORKER_SRC = `
self.onmessage = async (e) => {
  try {
    const { bitmap, mediaType } = e.data;
    const w = bitmap.width, h = bitmap.height;
    let data;
    if (typeof OffscreenCanvas !== 'undefined') {
      const cv = new OffscreenCanvas(w, h);
      const cx = cv.getContext('2d', { willReadFrequently: true });
      cx.drawImage(bitmap, 0, 0);
      data = cx.getImageData(0, 0, w, h).data;
    } else {
      self.postMessage({ ok: false, error: 'OffscreenCanvas tidak tersedia' });
      return;
    }
    self.postMessage({ ok: true, w, h, pixels: data.buffer, mediaType }, [data.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : 'Worker gagal' });
  }
};
`;

let worker: Worker | null = null;

function getWorker(): Worker | null {
  try {
    if (typeof Worker === 'undefined') return null;
    if (!worker) worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
    return worker;
  } catch {
    return null;
  }
}

async function pixelsMainThread(file: File): Promise<PixelFrame> {
  const bmp = await createImageBitmap(file);
  try {
    const cv = document.createElement('canvas');
    cv.width = bmp.width;
    cv.height = bmp.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    if (!cx) throw new Error('Canvas 2D tidak tersedia');
    cx.drawImage(bmp, 0, 0);
    const img = cx.getImageData(0, 0, bmp.width, bmp.height);
    return { width: bmp.width, height: bmp.height, data: img.data };
  } finally {
    if (typeof bmp.close === 'function') bmp.close();
  }
}

/** Hitung metrik kualitas dari file asli (serial per panggilan). */
export async function runQualityFromFile(file: File, mediaType: ObservationMediaType = 'photo'): Promise<QualityMetrics> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File terlalu besar (' + Math.round(file.size / 1048576) + ' MB) — batas wajar 80 MB.');
  }
  const w = getWorker();
  if (!w) {
    return computeQualityMetrics(await pixelsMainThread(file), mediaType);
  }
  const bmp = await createImageBitmap(file);
  try {
    const res = await new Promise<QualityMetrics>((resolve, reject) => {
      const onMsg = (e: MessageEvent): void => {
        w.removeEventListener('message', onMsg);
        const d = e.data as { ok: boolean; w?: number; h?: number; pixels?: ArrayBuffer; error?: string };
        if (!d.ok) {
          reject(new Error(d.error || 'Quality worker gagal'));
          return;
        }
        try {
          const pixels = new Uint8ClampedArray(d.pixels as ArrayBuffer);
          resolve(computeQualityMetrics({ width: d.w as number, height: d.h as number, data: pixels }, mediaType));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('Gagal menghitung metrik'));
        }
      };
      w.addEventListener('message', onMsg);
      try {
        w.postMessage({ bitmap: bmp, mediaType });
      } catch (err) {
        w.removeEventListener('message', onMsg);
        reject(err instanceof Error ? err : new Error('Worker gagal'));
      }
    });
    return res;
  } finally {
    if (typeof bmp.close === 'function') bmp.close();
  }
}

export function stopQualityWorker(): void {
  try {
    worker?.terminate();
  } catch { /* diabaikan */ }
  worker = null;
}
