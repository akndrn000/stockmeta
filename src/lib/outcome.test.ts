// Tabel-driven outcome.ts: tiga hasil Shutterstock + risiko Adobe; crop hanya menaikkan.
import { describe, expect, it } from 'vitest';
import { assessAdobe, assessShutterstock, clampJuryBadge, type OutcomeContext } from './outcome';
import type { Observation } from './observation';
import { blankObservation } from './observation';
import type { QualityMetrics } from './quality/metrics';

function goodMetrics(over: Partial<QualityMetrics> = {}): QualityMetrics {
  return {
    width: 4000,
    height: 3000,
    megapixels: 12,
    aspectRatio: 4 / 3,
    sharpnessGlobal: 500,
    sharpnessMedian: 400,
    sharpnessP90: 800,
    sharpTileFraction: 0.9,
    meanLuma: 128,
    highlightClipPct: 0.5,
    shadowClipPct: 1,
    noiseEstimate: 1.2,
    meanSaturation: 0.35,
    verySaturatedPct: 1,
    wbDeviation: 0.03,
    jpegBlockiness: 0.5,
    nearWhitePct: 2,
    emptyCanvasSuspected: false,
    pixelHash: 'abc',
    ...over
  };
}

function ctx(over: Partial<OutcomeContext> = {}): OutcomeContext {
  return {
    hardErrors: 0,
    hardErrorSummary: [],
    ipVisible: false,
    releaseNeeded: false,
    releaseMarked: false,
    editorial: false,
    commercial: true,
    inSimilarCluster: false,
    similarIsBest: true,
    conceptSaturated: false,
    cropFindings: [],
    belowMinResolution: { adobe: false, shutterstock: false },
    ...over
  };
}

const obs: Observation = { ...blankObservation(), media_type: 'photo', main_subject: 'mountain lake' };

describe('outcome: shutterstock tiga arah', () => {
  it('Marketplace bila semua rendah', () => {
    const r = assessShutterstock(goodMetrics(), obs, ctx(), { errors: [], warnings: [] });
    expect(r.estimate).toBe('Marketplace');
  });
  it('Data licensing saja bila kualitas di bawah minimum', () => {
    const r = assessShutterstock(goodMetrics({ noiseEstimate: 6 }), obs, ctx(), { errors: [], warnings: [] });
    expect(r.estimate).toBe('Data licensing saja (tidak masuk marketplace)');
  });
  it('Kemungkinan ditolak bila error cek keras / IP komersial / kualitas parah', () => {
    const e1 = assessShutterstock(goodMetrics(), obs, ctx(), {
      errors: [{ rule: 'SS_DESC_LEN', field: 'description', message: 'pendek' }],
      warnings: []
    });
    expect(e1.estimate).toBe('Kemungkinan ditolak');
    const e2 = assessShutterstock(goodMetrics(), obs, ctx({ ipVisible: true, commercial: true }), { errors: [], warnings: [] });
    expect(e2.estimate).toBe('Kemungkinan ditolak');
    const e3 = assessShutterstock(goodMetrics({ sharpnessGlobal: 5 }), obs, ctx(), { errors: [], warnings: [] });
    expect(e3.estimate).toBe('Kemungkinan ditolak');
  });
  it('label data licensing tidak pernah memakai kata approved/disetujui', () => {
    const r = assessShutterstock(goodMetrics({ noiseEstimate: 6 }), obs, ctx(), { errors: [], warnings: [] });
    const text = r.estimate + ' ' + r.reasons.join(' ');
    expect(text.toLowerCase()).not.toMatch(/approv|disetujui/);
    expect(r.estimate).toBe('Data licensing saja (tidak masuk marketplace)');
  });
  it('catatan VERIFIKASI bila similarity/kejenuhan tinggi', () => {
    const r = assessShutterstock(goodMetrics({ noiseEstimate: 6 }), obs, ctx({ inSimilarCluster: true }), {
      errors: [],
      warnings: []
    });
    expect(r.verifyNote).toMatch(/VERIFIKASI/);
  });
});

describe('outcome: adobe', () => {
  it('risiko keseluruhan = tertinggi + penyebab utama + bukti angka', () => {
    const r = assessAdobe(goodMetrics({ highlightClipPct: 10 }), obs, ctx());
    expect(r.overall).toBe('tinggi');
    expect(r.topCauses).toContain('QUALITY_EXPOSURE');
    const exp = r.perCause.find((p) => p.cause === 'QUALITY_EXPOSURE');
    expect(exp?.evidence.join(' ')).toMatch(/highlight terpotong/);
  });
  it('similarity terhadap koleksi = tidak diketahui bila tanpa sinyal internal', () => {
    const r = assessAdobe(goodMetrics(), obs, ctx());
    const s = r.perCause.find((p) => p.cause === 'SIMILAR_CONTENT');
    expect(s?.level).toBe('tidak diketahui');
  });
  it('crop AI hanya menaikkan, tidak menurunkan', () => {
    const base = assessAdobe(goodMetrics({ sharpnessGlobal: 5 }), obs, ctx());
    expect(base.overall).toBe('tinggi');
    const withCleanCrop = assessAdobe(
      goodMetrics({ sharpnessGlobal: 5 }),
      obs,
      ctx({ cropFindings: [{ region: 'center', visible_noise: 'none', blur_or_soft: 'none', artifacts_or_halos: 'none', dust_or_sensor_spots: false, ai_glitches: [] }] })
    );
    expect(withCleanCrop.overall).toBe('tinggi');
  });
  it('juri tidak bisa menurunkan risiko deterministik', () => {
    expect(clampJuryBadge('LOLOS', 'tinggi', 0)).toBe('PERLU_DITINJAU');
    expect(clampJuryBadge('LOLOS', 'rendah', 0)).toBe('LOLOS');
    expect(clampJuryBadge('LOLOS', 'rendah', 2)).toBe('TIDAK_LOLOS');
  });
});
