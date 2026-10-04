// Fixture sintetis via kode — assertion berbasis URUTAN, bukan angka absolut.
import { describe, expect, it } from 'vitest';
import { computeQualityMetrics, type PixelFrame } from './metrics';

function makeFrame(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): PixelFrame {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fn(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

// Deterministic PRNG (mulberry32).
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 64;
const H = 64;

function checker(x: number, y: number): [number, number, number] {
  const v = (x + y) % 2 === 0 ? 240 : 20;
  return [v, v, v];
}

function blurred(x: number, y: number): [number, number, number] {
  // Gradien halus (low-pass) — varians Laplacian jauh lebih kecil dari checker.
  const v = Math.round(100 + 40 * Math.sin(x / 8) * Math.cos(y / 8));
  return [v, v, v];
}

describe('quality metrics ordering + determinisme (piksel asli)', () => {
  it('tajam > blur; noise tinggi > rendah; overexposed highlight lebih besar', () => {
    const sharp = computeQualityMetrics(makeFrame(W, H, checker), 'photo');
    const blur = computeQualityMetrics(makeFrame(W, H, blurred), 'photo');
    expect(sharp.sharpnessGlobal).toBeGreaterThan(blur.sharpnessGlobal);
    expect(sharp.sharpTileFraction).toBeGreaterThanOrEqual(blur.sharpTileFraction);

    const r1 = rng(42);
    const clean = makeFrame(W, H, () => [128, 128, 128]);
    const noisy = makeFrame(W, H, () => {
      const nz = Math.round((r1() - 0.5) * 80);
      const v = 128 + nz;
      return [v, v, v];
    });
    const mClean = computeQualityMetrics(clean, 'photo');
    const mNoisy = computeQualityMetrics(noisy, 'photo');
    expect(mNoisy.noiseEstimate).toBeGreaterThan(mClean.noiseEstimate);

    const over = computeQualityMetrics(makeFrame(W, H, () => [252, 252, 252]), 'photo');
    const under = computeQualityMetrics(makeFrame(W, H, () => [3, 3, 3]), 'photo');
    expect(over.highlightClipPct).toBeGreaterThan(under.highlightClipPct);
    expect(under.shadowClipPct).toBeGreaterThan(over.shadowClipPct);

    const sat = computeQualityMetrics(makeFrame(W, H, () => [255, 0, 0]), 'photo');
    const gray = computeQualityMetrics(makeFrame(W, H, () => [128, 128, 128]), 'photo');
    expect(sat.meanSaturation).toBeGreaterThan(gray.meanSaturation);
    expect(sat.verySaturatedPct).toBeGreaterThan(gray.verySaturatedPct);
  });

  it('deterministik: input identik → metrik identik + pixelHash sama', () => {
    const a = computeQualityMetrics(makeFrame(W, H, checker), 'photo');
    const b = computeQualityMetrics(makeFrame(W, H, checker), 'photo');
    expect(b).toEqual(a);
    expect(b.pixelHash).toBe(a.pixelHash);
  });

  it('memakai piksel asli: dimensi tercatat apa adanya (bukan versi diperkecil)', () => {
    const m = computeQualityMetrics(makeFrame(96, 72, checker), 'photo');
    expect(m.width).toBe(96);
    expect(m.height).toBe(72);
    expect(m.megapixels).toBeCloseTo((96 * 72) / 1000000, 9);
  });

  it('white balance dilewati untuk ikon/vektor/pola', () => {
    const icon = computeQualityMetrics(makeFrame(W, H, checker), 'icon');
    expect(icon.wbDeviation).toBeNull();
    const photo = computeQualityMetrics(makeFrame(W, H, checker), 'photo');
    expect(photo.wbDeviation).not.toBeNull();
  });
});
