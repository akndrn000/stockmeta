import { describe, expect, it } from 'vitest';
import {
  BADGE_LABEL,
  buildJudgePrompt,
  consensusJudge,
  JUDGE_DISCLAIMER,
  mergeChecks,
  parseJudgeResponse
} from './judge';
import type { JudgeOutput } from './providers/types';

const mk = (patch: Partial<JudgeOutput> = {}): JudgeOutput => ({
  verdict: 'pass',
  score: 95,
  checks: [{ rule_id: 'ADOBE_TITLE_LEN', status: 'ok', evidence: '34 karakter', fix: '' }],
  unsupported_metadata: [],
  ip_risks: [],
  category_ok: true,
  suggested_category: null,
  needs_editorial_or_release: false,
  confidence: 0.9,
  ...patch
});

describe('parseJudgeResponse', () => {
  it('JSON dalam code fence terurai', () => {
    expect(parseJudgeResponse('```json\n' + JSON.stringify(mk()) + '\n```').verdict).toBe('pass');
  });

  it('rule_id tidak dikenal → error (di-retry, bukan lolos diam-diam)', () => {
    const bad = mk({ checks: [{ rule_id: 'ATURAN_KARANGAN', status: 'fail', evidence: 'x', fix: 'y' }] });
    expect(() => parseJudgeResponse(JSON.stringify(bad))).toThrow('rule_id tidak dikenal');
  });

  it('verdict/score/confidence invalid → error', () => {
    expect(() => parseJudgeResponse(JSON.stringify(mk({ verdict: 'maybe' as never })))).toThrow('verdict');
    expect(() => parseJudgeResponse(JSON.stringify(mk({ score: 101 })))).toThrow('score');
    expect(() => parseJudgeResponse(JSON.stringify(mk({ confidence: 2 })))).toThrow('confidence');
    expect(() => parseJudgeResponse('bukan json')).toThrow('JSON tidak valid');
  });
});

describe('buildJudgePrompt', () => {
  it('memuat aturan + observasi + metadata + konteks keras; luar aturan = n/a', () => {
    const p = buildJudgePrompt({
      observation: { main_subject: 'cat' } as never,
      metadataText: '{"title":"Cat"}',
      rulesBlock: '- ADOBE_TITLE_LEN: …',
      hardContext: '1 error: judul kosong',
      withoutImage: true
    });
    expect(p).toContain('JURI KEPATUHAN');
    expect(p).toContain('ADOBE_TITLE_LEN');
    expect(p).toContain('{"title":"Cat"}');
    expect(p).toContain('1 error: judul kosong');
    expect(p).toContain('"n/a"');
    expect(p).toContain('TIDAK menerima gambar');
  });
});

describe('consensusJudge', () => {
  it('semua pass → LOLOS + catatan juri N dari 3', () => {
    const r = consensusJudge(0, [mk(), mk(), mk()]);
    expect(r.badge).toBe('LOLOS');
    expect(r.judgeNote).toBe('juri: 3 dari 3');
    expect(BADGE_LABEL[r.badge]).toBe('LOLOS');
  });

  it('cek keras gagal mengalahkan 3 juri pass → TIDAK LOLOS', () => {
    expect(consensusJudge(2, [mk(), mk(), mk()]).badge).toBe('TIDAK_LOLOS');
  });

  it('2 pass 1 fail → PERLU DITINJAU (juri berbeda)', () => {
    const fail = mk({
      verdict: 'fail',
      checks: [{ rule_id: 'IP_BRAND', status: 'fail', evidence: 'logo Nike terlihat', fix: 'hapus' }]
    });
    const r = consensusJudge(0, [mk(), mk(), fail]);
    expect(r.badge).toBe('PERLU_DITINJAU');
  });

  it('semua fail ber-evidence tanpa pass → TIDAK LOLOS', () => {
    const fail = mk({
      verdict: 'fail',
      checks: [{ rule_id: 'IP_BRAND', status: 'fail', evidence: 'logo terlihat', fix: 'samarkan' }]
    });
    expect(consensusJudge(0, [fail, fail]).badge).toBe('TIDAK_LOLOS');
  });

  it('tanpa fail tapi ada pass_with_notes → LOLOS DENGAN CATATAN', () => {
    const r = consensusJudge(0, [mk(), mk({ verdict: 'pass_with_notes', score: 70 })]);
    expect(r.badge).toBe('LOLOS_DENGAN_CATATAN');
  });

  it('rata-rata confidence < 0.6 → PERLU DITINJAU', () => {
    const r = consensusJudge(0, [mk({ confidence: 0.5 }), mk({ confidence: 0.5 })]);
    expect(r.badge).toBe('PERLU_DITINJAU');
    expect(r.avgConfidence).toBeCloseTo(0.5);
  });

  it('tanpa juri → PERLU DITINJAU', () => {
    expect(consensusJudge(0, []).badge).toBe('PERLU_DITINJAU');
  });

  it('label hasil selalu saran, bukan keputusan platform', () => {
    expect(JUDGE_DISCLAIMER).toContain('bukan keputusan platform');
  });
});

describe('mergeChecks', () => {
  it('status terburuk menang; evidence digabung; fix paling sering dipilih', () => {
    const merged = mergeChecks([
      mk({ checks: [{ rule_id: 'IP_BRAND', status: 'ok', evidence: 'bersih', fix: '' }] }),
      mk({ checks: [{ rule_id: 'IP_BRAND', status: 'fail', evidence: 'logo terlihat', fix: 'samarkan' }] }),
      mk({ checks: [{ rule_id: 'IP_BRAND', status: 'warn', evidence: 'logo samar', fix: 'samarkan' }] })
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('fail');
    expect(merged[0].evidence).toEqual(['bersih', 'logo terlihat', 'logo samar']);
    expect(merged[0].fix).toBe('samarkan');
  });
});
