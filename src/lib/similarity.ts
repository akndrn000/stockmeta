// Deteksi konten mirip — murni, deterministik (tanpa AI, tanpa akses koleksi platform).
// dHash + pHash pada grayscale (tahan perubahan warna), hash crop tengah 80%
// (tahan zoom ringan), color layout sederhana, Jaccard keyword + overlap judul.
export interface HashSet {
  dhash: string;
  phash: string;
  centerHash: string;
  colorLayout: number[];
}

export interface SimilarInput {
  id: string;
  hashes: HashSet;
  titleTokens: string[];
  keywordTokens: string[];
}

export type SimilarReason = 'warna berbeda saja' | 'zoom/crop' | 'sudut/pose mirip' | 'metadata nyaris sama';

export interface SimilarPair {
  a: string;
  b: string;
  dDist: number;
  pDist: number;
  cDist: number;
  colorDist: number;
  keywordJaccard: number;
  titleOverlap: number;
  reasons: SimilarReason[];
  similar: boolean;
}

export interface SimilarCluster {
  members: string[];
  bestId: string;
  reasons: SimilarReason[];
}

function hexToBig(s: string): bigint {
  return BigInt('0x' + (s || '0'));
}

export function hammingHex(a: string, b: string): number {
  let x = hexToBig(a) ^ hexToBig(b);
  let c = 0;
  const one = BigInt(1);
  while (x !== BigInt(0)) {
    if ((x & one) !== BigInt(0)) c++;
    x >>= one;
  }
  return c;
}

/** Grayscale 2D → dHash 64-bit hex (perbandingan horizontal). */
export function dHashFromGray(gray: number[][], w: number, h: number): string {
  // Downscale ke 9x8 via sampling merata, lalu bit = kanan > kiri.
  const TW = 9;
  const TH = 8;
  let bits = BigInt(0);
  const one = BigInt(1);
  const at = (tx: number, ty: number): number => {
    const x = Math.min(w - 1, Math.floor(((tx + 0.5) / TW) * w));
    const y = Math.min(h - 1, Math.floor(((ty + 0.5) / TH) * h));
    return gray[y][x];
  };
  for (let y = 0; y < TH; y++) {
    for (let x = 0; x < TW - 1; x++) {
      bits = (bits << one) | (at(x + 1, y) > at(x, y) ? one : BigInt(0));
    }
  }
  return bits.toString(16).padStart(16, '0');
}

/** pHash sederhana via DCT-II 32x32 → 8x8 (tahan perubahan warna & skala ringan). */
export function pHashFromGray(gray: number[][], w: number, h: number): string {
  const N = 32;
  const small: number[][] = [];
  for (let y = 0; y < N; y++) {
    const row: number[] = [];
    for (let x = 0; x < N; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) / N) * w));
      const sy = Math.min(h - 1, Math.floor(((y + 0.5) / N) * h));
      row.push(gray[sy][sx]);
    }
    small.push(row);
  }
  const K = 8;
  const dct: number[][] = [];
  for (let u = 0; u < K; u++) {
    const row: number[] = [];
    for (let vv = 0; vv < K; vv++) {
      let s = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          s += small[y][x] *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N)) *
            Math.cos(((2 * y + 1) * vv * Math.PI) / (2 * N));
        }
      }
      row.push(s);
    }
    dct.push(row);
  }
  const flat = dct.flat();
  const med = [...flat].sort((a, b) => a - b)[Math.floor(flat.length / 2)];
  let bits = BigInt(0);
  const one = BigInt(1);
  for (const coef of flat) bits = (bits << one) | (coef > med ? one : BigInt(0));
  return bits.toString(16).padStart(16, '0');
}

/** Color layout: rata-rata tiap sel grid 4x4 dalam RGB ternormalisasi (48 angka). */
export function colorLayoutFromRGB(
  data: ArrayLike<number>, w: number, h: number
): number[] {
  const G = 4;
  const out: number[] = [];
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let c = 0;
      const x0 = Math.floor((gx / G) * w);
      const x1 = Math.floor(((gx + 1) / G) * w);
      const y0 = Math.floor((gy / G) * h);
      const y1 = Math.floor(((gy + 1) / G) * h);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * w + x) * 4;
          sr += (data[i] ?? 0) / 255;
          sg += (data[i + 1] ?? 0) / 255;
          sb += (data[i + 2] ?? 0) / 255;
          c++;
        }
      }
      out.push(c ? sr / c : 0, c ? sg / c : 0, c ? sb / c : 0);
    }
  }
  return out;
}

export function colorLayoutDistance(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const df = (a[i] ?? 0) - (b[i] ?? 0);
    s += df * df;
  }
  return Math.sqrt(s / Math.max(1, n));
}

/** Hash lengkap dari piksel RGBA asli (grayscale untuk dHash/pHash). */
export function hashesFromPixels(
  data: ArrayLike<number>, w: number, h: number
): HashSet {
  const gray: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      row.push(0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0));
    }
    gray.push(row);
  }
  const dhash = dHashFromGray(gray, w, h);
  const phash = pHashFromGray(gray, w, h);
  // Crop tengah 80%: potong 10% tiap sisi.
  const mx0 = Math.floor(w * 0.1);
  const my0 = Math.floor(h * 0.1);
  const mx1 = Math.ceil(w * 0.9);
  const my1 = Math.ceil(h * 0.9);
  const cw = Math.max(1, mx1 - mx0);
  const ch = Math.max(1, my1 - my0);
  const center: number[][] = [];
  for (let y = my0; y < my1; y++) center.push(gray[y].slice(mx0, mx1));
  const centerHash = dHashFromGray(center, cw, ch);
  return { dhash, phash, centerHash, colorLayout: colorLayoutFromRGB(data, w, h) };
}

export function tokenizeTitle(t: string): string[] {
  return t.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((x) => x.length >= 3);
}

export function tokenizeKeywords(kw: readonly string[]): string[] {
  const out: string[] = [];
  for (const k of kw) {
    for (const t of k.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((x) => x.length >= 3)) {
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / Math.max(1, sa.size + sb.size - inter);
}

/** Tumpang tindih token judul (Dice): 2*|∩| / (|a|+|b|). */
export function titleOverlap(a: readonly string[], b: readonly string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size && !sb.size) return 1;
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

export interface PairThresholds {
  dMax: number;
  pMax: number;
  cMax: number;
  colorMax: number;
  jaccHigh: number;
  jaccMid: number;
  titleHigh: number;
}

export const DEFAULT_PAIR_THRESHOLDS: PairThresholds = {
  dMax: 10,
  pMax: 10,
  cMax: 8,
  colorMax: 0.22,
  jaccHigh: 0.8,
  jaccMid: 0.55,
  titleHigh: 0.8
};

/** Bandingkan dua frame; `similar` bila bukti piksel ATAU metadata kuat. */
export function comparePair(a: SimilarInput, b: SimilarInput, t: PairThresholds = DEFAULT_PAIR_THRESHOLDS): SimilarPair {
  const dDist = hammingHex(a.hashes.dhash, b.hashes.dhash);
  const pDist = hammingHex(a.hashes.phash, b.hashes.phash);
  const cDist = hammingHex(a.hashes.centerHash, b.hashes.centerHash);
  const colorDist = colorLayoutDistance(a.hashes.colorLayout, b.hashes.colorLayout);
  const kj = jaccard(a.keywordTokens, b.keywordTokens);
  const to = titleOverlap(a.titleTokens, b.titleTokens);
  const reasons: SimilarReason[] = [];
  const pixelClose = dDist <= t.dMax || pDist <= t.pMax || cDist <= t.cMax;
  if (pixelClose && colorDist > t.colorMax) reasons.push('warna berbeda saja');
  if (cDist <= t.cMax && dDist > t.dMax) reasons.push('zoom/crop');
  if (pixelClose && colorDist <= t.colorMax) reasons.push('sudut/pose mirip');
  if (kj >= t.jaccHigh || to >= t.titleHigh) reasons.push('metadata nyaris sama');
  else if (kj >= t.jaccMid && pixelClose) reasons.push('metadata nyaris sama');
  const similar = pixelClose || kj >= t.jaccHigh || to >= t.titleHigh;
  return { a: a.id, b: b.id, dDist, pDist, cDist, colorDist, keywordJaccard: kj, titleOverlap: to, reasons, similar };
}

/** Klasterkan pasangan mirip (union-find); bestId dipilih pemanggil via skor kualitas. */
export function clusterSimilar(
  inputs: SimilarInput[],
  qualityScore: (id: string) => number,
  t: PairThresholds = DEFAULT_PAIR_THRESHOLDS
): { clusters: SimilarCluster[]; pairs: SimilarPair[] } {
  const pairs: SimilarPair[] = [];
  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) {
      pairs.push(comparePair(inputs[i], inputs[j], t));
    }
  }
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    parent.set(x, parent.get(x) ?? x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    return r;
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const p of pairs) if (p.similar) union(p.a, p.b);
  const groups = new Map<string, string[]>();
  for (const inp of inputs) {
    const r = find(inp.id);
    const g = groups.get(r) ?? [];
    g.push(inp.id);
    groups.set(r, g);
  }
  const clusters: SimilarCluster[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let bestId = members[0];
    let best = qualityScore(bestId);
    for (const m of members.slice(1)) {
      const s = qualityScore(m);
      if (s > best) {
        best = s;
        bestId = m;
      }
    }
    const why = new Set<SimilarReason>();
    for (const p of pairs) {
      if (!p.similar) continue;
      if (members.includes(p.a) && members.includes(p.b)) {
        for (const r of p.reasons) why.add(r);
      }
    }
    clusters.push({ members: [...members].sort(), bestId, reasons: [...why] });
  }
  clusters.sort((x, y) => (x.members[0] < y.members[0] ? -1 : 1));
  return { clusters, pairs };
}
