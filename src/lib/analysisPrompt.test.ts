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

  it('prompt Adobe vs Shutterstock BERBEDA substansi (bukan cuma label platform)', () => {
    const adobe = buildAnalysisPrompt({ platform: 'adobe' });
    const shutter = buildAnalysisPrompt({ platform: 'shutterstock' });
    expect(adobe).not.toBe(shutter);
    // Beda substansi: blok kebijakan AI per platform berbeda paragrap, bukan 1-2 kata.
    expect(Math.abs(adobe.length - shutter.length)).toBeGreaterThan(50);
    // Konteks platform eksplisit di badan instruksi, bukan cuma baris "Platform target".
    expect(adobe).toContain('platform: Adobe Stock');
    expect(shutter).toContain('platform: Shutterstock');
  });

  it('kebijakan AI-generated Adobe: diterima + disclosure, BUKAN penolakan', () => {
    const p = buildAnalysisPrompt({ platform: 'adobe' });
    expect(p).toContain('ai-generated-disclosure');
    expect(p).toContain('MENERIMA konten AI-generated DENGAN SYARAT disclosure');
    expect(p).toContain('BUKAN alasan penolakan');
    expect(p).toContain('verdict tetap boleh "layak"');
    // Kalimat tegas penolakan Shutterstock TIDAK boleh muncul di prompt Adobe.
    expect(p).not.toContain('Shutterstock tidak menerima konten AI-generated dari kontributor.');
  });

  it('kebijakan AI-generated Shutterstock: ditolak tegas + verdict berpotensi-ditolak', () => {
    const p = buildAnalysisPrompt({ platform: 'shutterstock' });
    expect(p).toContain('ai-generated-disclosure');
    expect(p).toContain('Shutterstock tidak menerima konten AI-generated dari kontributor.');
    expect(p).toContain('verdict HARUS "berpotensi-ditolak"');
    expect(p).not.toContain('MENERIMA konten AI-generated DENGAN SYARAT disclosure');
  });

  it('kedua prompt mewanti-wanti deteksi AI tidak 100% pasti', () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const p = buildAnalysisPrompt({ platform });
      expect(p).toContain('tidak bisa memastikan 100%');
      expect(p).toContain('JANGAN menebak asal-asalan');
    }
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
