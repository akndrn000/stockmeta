// Pengukuran kualitas deterministik dari piksel ASLI (tanpa AI).
// Fungsi murni: input identik → output identik. Beroperasi pada RGBA asli
// (BUKAN versi 1280px untuk AI). Test harus gagal bila memakai versi diperkecil
// (lihat metrics.test.ts — memakai dimensi asli sebagai bukti).
import type { ObservationMediaType } from '../observation';

export interface PixelFrame {
  width: number;
  height: number;
  /** RGBA, panjang = width*height*4 */
  data: Uint8ClampedArray | Uint8Array | number[];
}

export interface QualityMetrics {
  width: number;
  height: number;
  megapixels: number;
  aspectRatio: number;
  sharpnessGlobal: number;
  sharpnessMedian: number;
  sharpnessP90: number;
  sharpTileFraction: number;
  meanLuma: number;
  highlightClipPct: number;
  shadowClipPct: number;
  noiseEstimate: number;
  meanSaturation: number;
  verySaturatedPct: number;
  /** null bila media_type bukan photo (dilewati untuk ikon/vektor/pola). */
  wbDeviation: number | null;
  jpegBlockiness: number;
  nearWhitePct: number;
  emptyCanvasSuspected: boolean;
  /** hash stabil piksel (djb2 hex) — bukti determinisme + seed crop-AI. */
  pixelHash: string;
}

const TILE_GRID = 8;
const HIGHLIGHT_CUT = 250;
const SHADOW_CUT = 5;
const SAT_HIGH = 0.9;
const VAL_MIN = 0.5;
const NEAR_WHITE = 250;

function grayOf(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** djb2 hex — deterministik. */
export function stableHashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function pixelHashOf(frame: PixelFrame): string {
  let h = 5381;
  const d = frame.data;
  const n = d.length;
  // Sampel deterministik: semua piksel untuk gambar kecil, stride untuk besar.
  const stride = n > 4_000_000 ? 7 : 1;
  for (let i = 0; i < n; i += stride) h = ((h << 5) + h + (d[i] | 0)) | 0;
  h = ((h << 5) + h + frame.width) | 0;
  h = ((h << 5) + h + frame.height) | 0;
  return (h >>> 0).toString(16);
}

function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[idx];
}

function medianOf(a: number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Hitung metrik kualitas dari piksel asli. `mediaType` mengontrol metrik yang
 * dilewati: white balance hanya untuk photo (ikon/vektor/pola → null).
 */
export function computeQualityMetrics(frame: PixelFrame, mediaType: ObservationMediaType = 'photo'): QualityMetrics {
  const { width: w, height: h, data: d } = frame;
  const n = w * h;
  const gray = new Float64Array(n);
  let sumLuma = 0;
  let hiCount = 0;
  let loCount = 0;
  let sumSat = 0;
  let verySat = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let nearWhite = 0;

  for (let i = 0; i < n; i++) {
    const r = d[i * 4] ?? 0;
    const g = d[i * 4 + 1] ?? 0;
    const b = d[i * 4 + 2] ?? 0;
    const gr = grayOf(r, g, b);
    gray[i] = gr;
    sumLuma += gr;
    if (gr >= HIGHLIGHT_CUT) hiCount++;
    if (gr <= SHADOW_CUT) loCount++;
    sumR += r;
    sumG += g;
    sumB += b;
    const mx = Math.max(r, g, b) / 255;
    const mn = Math.min(r, g, b) / 255;
    const sat = mx <= 0 ? 0 : (mx - mn) / mx;
    sumSat += sat;
    if (sat > SAT_HIGH && mx > VAL_MIN) verySat++;
    if (r >= NEAR_WHITE && g >= NEAR_WHITE && b >= NEAR_WHITE) nearWhite++;
  }

  // Laplacian (4-neighbour) pada grayscale.
  const lap = new Float64Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      lap[i] = Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]);
    }
  }
  let meanLap = 0;
  for (let i = 0; i < n; i++) meanLap += lap[i];
  meanLap /= Math.max(1, n);
  let varLap = 0;
  for (let i = 0; i < n; i++) {
    const df = lap[i] - meanLap;
    varLap += df * df;
  }
  varLap /= Math.max(1, n);

  // Per-tile (grid 8x8): varians Laplacian per tile.
  const tileVars: number[] = [];
  const tw = Math.max(1, Math.floor(w / TILE_GRID));
  const th = Math.max(1, Math.floor(h / TILE_GRID));
  for (let ty = 0; ty < TILE_GRID; ty++) {
    for (let tx = 0; tx < TILE_GRID; tx++) {
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = tx === TILE_GRID - 1 ? w : Math.min(w, x0 + tw);
      const y1 = ty === TILE_GRID - 1 ? h : Math.min(h, y0 + th);
      let s = 0;
      let c = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          s += lap[y * w + x];
          c++;
        }
      }
      const m = c ? s / c : 0;
      let vv = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const df = lap[y * w + x] - m;
          vv += df * df;
        }
      }
      tileVars.push(c ? vv / c : 0);
    }
  }
  const sortedTiles = [...tileVars].sort((a, b2) => a - b2);
  const tileMedian = medianOf(tileVars);
  const tileP90 = percentile(sortedTiles, 0.9);
  const sharpCount = tileVars.filter((t) => t >= varLap).length;
  const sharpTileFraction = tileVars.length ? sharpCount / tileVars.length : 0;

  // Noise: estimasi pada area datar (tile berdetail rendah = di bawah median).
  // MAD pada high-pass (laplacian) di tile datar → skala ke std.
  const flatVals: number[] = [];
  for (let ty = 0; ty < TILE_GRID; ty++) {
    for (let tx = 0; tx < TILE_GRID; tx++) {
      const idx = ty * TILE_GRID + tx;
      if (tileVars[idx] > tileMedian) continue;
      const x0 = tx * tw;
      const y0 = ty * th;
      const x1 = tx === TILE_GRID - 1 ? w : Math.min(w, x0 + tw);
      const y1 = ty === TILE_GRID - 1 ? h : Math.min(h, y0 + th);
      for (let y = Math.max(1, y0); y < Math.min(h - 1, y1); y++) {
        for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
          flatVals.push(lap[y * w + x]);
        }
      }
    }
  }
  let noiseEstimate = 0;
  if (flatVals.length > 8) {
    const med = medianOf(flatVals);
    const devs = flatVals.map((x) => Math.abs(x - med)).sort((a, b2) => a - b2);
    const mad = medianOf(devs);
    noiseEstimate = mad * 1.4826;
  }

  // White balance: penyimpangan gray-world (hanya photo).
  let wbDeviation: number | null = null;
  if (mediaType === 'photo') {
    const mr = sumR / Math.max(1, n);
    const mg = sumG / Math.max(1, n);
    const mb = sumB / Math.max(1, n);
    const mean = (mr + mg + mb) / 3 || 1;
    wbDeviation = Math.max(Math.abs(mr - mg), Math.abs(mr - mb), Math.abs(mg - mb)) / mean;
  }

  // Blokiness JPEG: diskontinuitas rata-rata pada batas kelipatan 8 vs interior.
  let bSum = 0;
  let bCnt = 0;
  let iSum = 0;
  let iCnt = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      const df = Math.abs(gray[y * w + x] - gray[y * w + x - 1]);
      if (x % TILE_GRID === 0) {
        bSum += df;
        bCnt++;
      } else {
        iSum += df;
        iCnt++;
      }
    }
  }
  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const df = Math.abs(gray[y * w + x] - gray[(y - 1) * w + x]);
      if (y % TILE_GRID === 0) {
        bSum += df;
        bCnt++;
      } else {
        iSum += df;
        iCnt++;
      }
    }
  }
  const bMean = bCnt ? bSum / bCnt : 0;
  const iMean = iCnt ? iSum / iCnt : 0;
  const jpegBlockiness = Math.max(0, bMean - iMean);

  const meanLuma = sumLuma / Math.max(1, n);
  const highlightClipPct = (hiCount / Math.max(1, n)) * 100;
  const shadowClipPct = (loCount / Math.max(1, n)) * 100;
  const meanSaturation = sumSat / Math.max(1, n);
  const verySaturatedPct = (verySat / Math.max(1, n)) * 100;
  const nearWhitePct = (nearWhite / Math.max(1, n)) * 100;
  const megapixels = (w * h) / 1000000;
  const aspectRatio = h === 0 ? 1 : w / h;
  const emptyCanvasSuspected = nearWhitePct >= 95 || (varLap < 1 && nearWhitePct > 80);

  return {
    width: w,
    height: h,
    megapixels,
    aspectRatio,
    sharpnessGlobal: varLap,
    sharpnessMedian: tileMedian,
    sharpnessP90: tileP90,
    sharpTileFraction,
    meanLuma,
    highlightClipPct,
    shadowClipPct,
    noiseEstimate,
    meanSaturation,
    verySaturatedPct,
    wbDeviation,
    jpegBlockiness,
    nearWhitePct,
    emptyCanvasSuspected,
    pixelHash: pixelHashOf(frame)
  };
}

/** Skor kualitas tunggal 0-100 dari metrik (untuk kandidat terbaik klaster). */
export function qualityScoreOf(m: QualityMetrics): number {
  let s = 100;
  s -= Math.min(30, m.highlightClipPct * 2);
  s -= Math.min(30, m.shadowClipPct * 1.5);
  s -= Math.min(25, Math.max(0, m.noiseEstimate - 4.5) * 2);
  s -= Math.min(20, Math.max(0, m.meanSaturation - 0.62) * 60);
  s -= Math.min(20, Math.max(0, (m.wbDeviation ?? 0) - 0.09) * 80);
  s -= Math.min(25, Math.max(0, m.jpegBlockiness - 4) * 3);
  if (m.sharpnessGlobal < 28) s -= 25;
  else if (m.sharpnessGlobal < 90) s -= 10;
  return Math.max(0, Math.min(100, s));
}
