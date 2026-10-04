// Similarity: duplikat warna/zoom masuk klaster; gambar berbeda tidak.
import { describe, expect, it } from 'vitest';
import {
  clusterSimilar,
  colorLayoutDistance,
  comparePair,
  hashesFromPixels,
  tokenizeKeywords,
  tokenizeTitle,
  type SimilarInput
} from './similarity';

function rgbFrame(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): { data: Uint8ClampedArray; w: number; h: number } {
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
  return { data, w, h };
}

function inp(id: string, fn: (x: number, y: number) => [number, number, number], title: string, kw: string[]): SimilarInput {
  const { data, w, h } = rgbFrame(48, 48, fn);
  return {
    id,
    hashes: hashesFromPixels(data, w, h),
    titleTokens: tokenizeTitle(title),
    keywordTokens: tokenizeKeywords(kw)
  };
}

const stripe = (x: number): [number, number, number] =>
  x % 8 < 4 ? [200, 40, 40] : [20, 20, 20];
const stripeShifted = (x: number): [number, number, number] =>
  x % 8 < 4 ? [40, 200, 40] : [20, 20, 20];
const dots = (x: number, y: number): [number, number, number] =>
  (x * y) % 7 === 0 ? [30, 30, 220] : [220, 220, 220];

describe('similarity', () => {
  it('duplikat pergeseran warna / zoom ringan masuk klaster; gambar berbeda tidak', () => {
    const a = inp('a', stripe, 'red striped abstract background', ['red', 'stripes', 'abstract background']);
    const b = inp('b', stripeShifted, 'green striped abstract background', ['green', 'stripes', 'abstract background']);
    const c = inp('c', dots, 'blue dots on white', ['blue dots', 'white', 'pattern']);
    const pair = comparePair(a, b);
    expect(pair.similar).toBe(true);
    const { clusters } = clusterSimilar([a, b, c], () => 50);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toEqual(expect.arrayContaining(['a', 'b']));
    expect(clusters[0].members).not.toContain('c');
  });

  it('metadata nyaris sama terdeteksi walau piksel beda', () => {
    const a = inp('a', stripe, 'sunset over mountain lake', ['sunset', 'mountain lake', 'evening sky']);
    const b = inp('b', dots, 'sunset over mountain lake', ['sunset', 'mountain lake', 'evening sky']);
    const pair = comparePair(a, b);
    expect(pair.reasons).toContain('metadata nyaris sama');
    expect(pair.similar).toBe(true);
  });

  it('color layout stabil untuk gambar identik', () => {
    const { data, w, h } = rgbFrame(16, 16, stripe);
    const { colorLayout } = hashesFromPixels(data, w, h);
    expect(colorLayoutDistance(colorLayout, [...colorLayout])).toBe(0);
  });
});
