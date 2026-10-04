// Crop parser strict + riwayat hash-only + kalibrasi (matriks + sampel sedikit).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CROP_INSPECTION_UNAVAILABLE, cropCostEstimate, parseCropResponse } from './quality/cropInspect';
import { selectCropRects } from './quality/crops';
import { addHistory, clearHistory, importHistory, loadHistory } from './similarityStore';
import {
  confusionMatrix,
  loadSamples,
  recommendThresholds,
  saveSample,
  type CalibrationSample
} from './calibration';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    }
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe('crop inspection', () => {
  it('parser ketat menerima JSON valid, menolak severity tak dikenal', () => {
    const ok = parseCropResponse(
      '{"crops": [{"region": "pusat", "visible_noise": "mild", "blur_or_soft": "none", "artifacts_or_halos": "none", "dust_or_sensor_spots": false, "ai_glitches": [], "notes": ""}], "confidence": 0.8}'
    );
    expect(ok.crops).toHaveLength(1);
    expect(ok.confidence).toBe(0.8);
    expect(() =>
      parseCropResponse('{"crops": [{"region": "x", "visible_noise": "parah", "blur_or_soft": "none", "artifacts_or_halos": "none", "dust_or_sensor_spots": false, "ai_glitches": [], "notes": ""}], "confidence": 0.5}')
    ).toThrow();
  });
  it('provider tanpa vision → "inspeksi detail tidak tersedia", bukan tebakan', () => {
    expect(cropCostEstimate(4, false)).toBe(CROP_INSPECTION_UNAVAILABLE);
    expect(cropCostEstimate(4, true)).toMatch(/Estimasi/);
  });
  it('4 crop 512 pada resolusi asli (bukan diperkecil)', () => {
    const gray = new Array(1200 * 900).fill(128);
    const rects = selectCropRects(gray, 1200, 900);
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.w).toBe(512);
      expect(r.h).toBe(512);
      expect(r.x + r.w).toBeLessThanOrEqual(1200);
      expect(r.y + r.h).toBeLessThanOrEqual(900);
    }
    expect(new Set(rects.map((r) => r.region)).size).toBe(4);
  });
});

describe('riwayat lokal hanya hash', () => {
  it('menyimpan hash + metadata ringkas, menolak entri ber-gambar', () => {
    clearHistory();
    addHistory({
      hash: 'abc123',
      title: 'mountain lake',
      keywords: ['mountain', 'lake'],
      platform: 'adobe',
      date: '2026-10-04',
      hashes: { dhash: '0'.repeat(16), phash: '0'.repeat(16), centerHash: '0'.repeat(16), colorLayout: [] }
    });
    const list = loadHistory();
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toMatch(/thumb|base64|dataUrl/);
    const res = importHistory(
      JSON.stringify([
        { hash: 'def456', title: 'x', hashes: { dhash: '1'.repeat(16), phash: '1'.repeat(16), centerHash: '1'.repeat(16), colorLayout: [] } },
        { hash: 'bad', title: 'y', thumb: 'DATA_GAMBAR', hashes: { dhash: '2'.repeat(16), phash: '2'.repeat(16), centerHash: '2'.repeat(16), colorLayout: [] } }
      ])
    );
    expect(res.imported).toBe(1);
    expect(res.skipped).toBe(1);
    clearHistory();
  });
});

describe('kalibrasi', () => {
  it('matriks + peringatan sampel sedikit + rekomendasi tanpa ubah otomatis', () => {
    expect(loadSamples()).toEqual([]);
    const s: CalibrationSample = {
      id: 's1',
      date: '2026-10-04',
      platform: 'adobe',
      predictedAdobe: 'tinggi',
      predictedShutterstock: null,
      actualAdobe: 'Ditolak-Quality',
      actualShutterstock: null,
      metrics: { sharpnessGlobal: 10, noiseEstimate: 8, highlightClipPct: 2, shadowClipPct: 2, meanSaturation: 0.4, jpegBlockiness: 1, megapixels: 12 }
    };
    saveSample(s);
    const m = confusionMatrix('adobe');
    expect(m.samples).toBe(1);
    expect(m.tooFew).toBe(true);
    expect(m.cells[0]).toMatchObject({ predicted: 'tinggi', actual: 'Ditolak-Quality', count: 1 });
    const rec = recommendThresholds('adobe');
    expect(rec[0].text).toMatch(/terlalu sedikit/);
  });
});
