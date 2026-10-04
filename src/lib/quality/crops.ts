// Pemilihan 4 crop 512x512 pada RESOLUSI ASLI: detail tertinggi, area gelap,
// tepi kontras tinggi, dan pusat. Murni + deterministik (operasi pada grayscale).
export interface CropRect {
  region: 'detail-tertinggi' | 'shadow-gelap' | 'tepi-kontras' | 'pusat';
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CROP_SIZE = 512;

/** Pilih 4 crop dari grayscale penuh (nilai 0-255, panjang w*h). */
export function selectCropRects(gray: ArrayLike<number>, w: number, h: number): CropRect[] {
  const S = Math.min(CROP_SIZE, w, h);
  const cx = Math.max(0, Math.floor(w / 2 - S / 2));
  const cy = Math.max(0, Math.floor(h / 2 - S / 2));

  // Skor per kandidat grid kasar (langkah S/2): energi laplacian, kegelapan, kontras tepi.
  const step = Math.max(1, Math.floor(S / 2));
  interface Cand { x: number; y: number; energy: number; dark: number; edge: number }
  const cands: Cand[] = [];
  for (let y = 0; y + S <= h; y += step) {
    for (let x = 0; x + S <= w; x += step) {
      let energy = 0;
      let dark = 0;
      let edge = 0;
      let c = 0;
      for (let yy = y + 1; yy < y + S - 1; yy += 2) {
        for (let xx = x + 1; xx < x + S - 1; xx += 2) {
          const i = yy * w + xx;
          const lap = Math.abs(
            4 * (gray[i] ?? 0) - (gray[i - 1] ?? 0) - (gray[i + 1] ?? 0) - (gray[i - w] ?? 0) - (gray[i + w] ?? 0)
          );
          energy += lap;
          if ((gray[i] ?? 0) < 40) dark++;
          edge += lap;
          c++;
        }
      }
      cands.push({ x, y, energy: c ? energy / c : 0, dark: c ? dark / c : 0, edge: c ? edge / c : 0 });
    }
  }
  if (!cands.length) {
    return [
      { region: 'detail-tertinggi', x: 0, y: 0, w: S, h: S },
      { region: 'shadow-gelap', x: 0, y: 0, w: S, h: S },
      { region: 'tepi-kontras', x: 0, y: 0, w: S, h: S },
      { region: 'pusat', x: cx, y: cy, w: S, h: S }
    ];
  }
  const byEnergy = [...cands].sort((a, b) => b.energy - a.energy)[0];
  const byDark = [...cands].sort((a, b) => b.dark - a.dark)[0];
  const byEdge = [...cands].sort((a, b) => b.edge - a.edge)[0];
  const dedup = (c: Cand, used: CropRect[]): CropRect | null => {
    for (const u of used) {
      if (Math.abs(u.x - c.x) < S / 2 && Math.abs(u.y - c.y) < S / 2) return null;
    }
    return { region: 'detail-tertinggi', x: c.x, y: c.y, w: S, h: S };
  };
  const out: CropRect[] = [];
  const d = dedup(byEnergy, out);
  out.push(d ?? { region: 'detail-tertinggi', x: byEnergy.x, y: byEnergy.y, w: S, h: S });
  const s0 = dedup(byDark, out);
  out.push(s0 ? { ...s0, region: 'shadow-gelap' } : { region: 'shadow-gelap', x: byDark.x, y: byDark.y, w: S, h: S });
  const e0 = dedup(byEdge, out);
  out.push(e0 ? { ...e0, region: 'tepi-kontras' } : { region: 'tepi-kontras', x: byEdge.x, y: byEdge.y, w: S, h: S });
  out.push({ region: 'pusat', x: cx, y: cy, w: S, h: S });
  return out;
}
