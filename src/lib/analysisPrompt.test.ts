import { describe, expect, it } from 'vitest';
import { ANALYSIS_CATEGORIES, ANALYSIS_CATEGORY_LABELS, buildAnalysisPrompt, parseAnalysisResponse } from './analysisPrompt';

describe('buildAnalysisPrompt', () => {
  it('peran reviewer + kriteria penolakan + format JSON', () => {
    const p = buildAnalysisPrompt({ platform: 'adobe' });
    expect(p).toContain('REVIEWER STOCK PHOTO');
    expect(p).toContain('KELAYAKAN UPLOAD');
    expect(p).toContain('JANGAN membuat judul');
    expect(p).toContain('Platform target: adobe');
    // kriteria industri
    expect(p).toContain('Kualitas teknis');
    expect(p).toContain('Watermark');
    expect(p).toContain('merek dagang');
    expect(p).toContain('SEBUTKAN SECARA EKSPLISIT');
    expect(p).toContain('model release');
    expect(p).toContain('Komposisi buruk');
    expect(p).toContain('Nilai komersial rendah');
    // batasan anti-halusinasi
    expect(p).toContain('JANGAN mengarang masalah');
    expect(p).toContain('perlu-tinjau');
    // format JSON
    expect(p).toContain('"verdict"');
    expect(p).toContain('"issues"');
    expect(p).toContain('"summary"');
    for (const c of ANALYSIS_CATEGORIES) expect(p).toContain(c);
    expect(p.endsWith('Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.')).toBe(true);
  });

  it('platform shutterstock disebut', () => {
    expect(buildAnalysisPrompt({ platform: 'shutterstock' })).toContain('Platform target: shutterstock');
  });
});

describe('parseAnalysisResponse', () => {
  it('JSON valid ber-fence → verdict + issues + summary', () => {
    const raw = '```json\n{"verdict":"berpotensi-ditolak","issues":[{"category":"watermark-logo","description":"Logo terlihat di pojok"}],"summary":"Ada logo, berisiko ditolak."}\n```';
    const r = parseAnalysisResponse(raw);
    expect(r.verdict).toBe('berpotensi-ditolak');
    expect(r.issues).toEqual([{ category: 'watermark-logo', description: 'Logo terlihat di pojok' }]);
    expect(r.summary).toBe('Ada logo, berisiko ditolak.');
  });

  it('layak tanpa issues/summary → array kosong + string kosong', () => {
    const r = parseAnalysisResponse('{"verdict": "layak"}');
    expect(r).toEqual({ verdict: 'layak', issues: [], summary: '' });
  });

  it('teks di sekitar JSON tetap terbaca', () => {
    const r = parseAnalysisResponse('Hasil: {"verdict":"perlu-tinjau","summary":"Cek manual."} — selesai');
    expect(r.verdict).toBe('perlu-tinjau');
    expect(r.summary).toBe('Cek manual.');
  });

  it('JSON rusak / tanpa objek → Error "JSON tidak valid" (bisa di-retry)', () => {
    for (const bad of ['{"verdict": "x",}', 'bukan json sama sekali', '']) {
      try {
        parseAnalysisResponse(bad);
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toBe('JSON tidak valid');
        expect((e as { kind?: string }).kind).toBe('json');
      }
    }
  });

  it('verdict tak dikenal → error jelas', () => {
    expect(() => parseAnalysisResponse('{"verdict": "bagus"}')).toThrow('verdict tidak dikenal');
  });

  it('kategori issue tak dikenal / deskripsi kosong → error jelas', () => {
    expect(() => parseAnalysisResponse('{"verdict":"layak","issues":[{"category":"zzz","description":"x"}]}'))
      .toThrow('kategori issue tidak dikenal');
    expect(() => parseAnalysisResponse('{"verdict":"layak","issues":[{"category":"komposisi","description":"  "}]}'))
      .toThrow('deskripsi issue kosong');
    expect(() => parseAnalysisResponse('{"verdict":"layak","issues":"bukan-array"}'))
      .toThrow('issues bukan array');
  });

  it('semua kategori punya label Indonesia', () => {
    for (const c of ANALYSIS_CATEGORIES) expect(ANALYSIS_CATEGORY_LABELS[c].length).toBeGreaterThan(0);
  });
});
