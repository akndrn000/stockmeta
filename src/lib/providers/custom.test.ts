import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Observation } from '../observation';
import { normalizeBaseUrl } from './custom';
import { custom } from './custom';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const CFG = { baseUrl: 'https://layanan.contoh/api/v1/', model: 'model-uji' };

const gen = (apiKey = 'RAHASIA') => custom.generateForImage({
  apiKey,
  ...CFG,
  image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
  platform: 'shutterstock',
  theme: 'Halloween'
});

const OBS: Observation = {
  media_type: 'photo', main_subject: 'cat', secondary_subjects: [],
  people: { count: 0, recognizable_face: false, visible_actions: [] },
  setting: '', time_or_lighting: '', viewpoint_composition: [], colors: [],
  mood_concepts: [], copy_space: false, isolated_background: false, visible_text: [],
  visible_brands_logos: [], landmarks_or_private_property: [], possible_ai_look: false,
  quality_issues: [], confidence: 0.9, theme_mismatch: false
};

describe('normalizeBaseUrl', () => {
  it('memangkas slash akhir', () => {
    expect(normalizeBaseUrl('https://x.test/v1///')).toBe('https://x.test/v1');
  });
});

describe('custom.testConnection', () => {
  it('GET {base}/models dengan Bearer → ok, key tidak ada di URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ data: [{ id: 'model-uji' }] }));

    expect(await custom.testConnection('kunci', CFG)).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://layanan.contoh/api/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer kunci');
    expect(url).not.toContain('kunci');
  });

  it('tanpa baseUrl/model → gagal jelas tanpa jaringan', async () => {
    expect(await custom.testConnection('kunci', {})).toEqual({
      ok: false, message: 'Isi base URL dan model provider custom dulu.'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('error.message dari body dibawa utuh saat key ditolak', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(
      { error: { message: 'Invalid API key provided' } }, 401
    ));
    expect(await custom.testConnection('salah', CFG)).toEqual({
      ok: false,
      message: 'Invalid API key provided'
    });
  });
});

describe('custom.generateForImage', () => {
  it('model isi pengguna + data URI + response_format json_object, hasil di-parse', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: JSON.stringify({
      description: 'Seekor kucing di atas meja',
      keywords: ['kucing', 'meja'],
      category: ['Nature']
    }) } }] }));

    const out = await gen();

    expect(out).toEqual({
      description: 'Seekor kucing di atas meja',
      keywords: ['kucing', 'meja'],
      category: 'Nature'
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://layanan.contoh/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer RAHASIA');

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('model-uji');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('Tema utama dari kontributor: "Halloween".') },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' } }
    ]);
  });

  it('tanpa model → gagal cepat tanpa jaringan', async () => {
    await expect(custom.generateForImage({
      apiKey: 'k', baseUrl: CFG.baseUrl, model: '',
      image: { base64: 'x', mimeType: 'image/jpeg' }, platform: 'adobe'
    })).rejects.toThrow('Isi base URL dan model');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('custom.callText', () => {
  it('teks murni tanpa bagian gambar', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: '{"a":1}' } }] }));
    const out = await custom.callText({ apiKey: 'k', ...CFG, prompt: 'halo' });
    expect(out).toBe('{"a":1}');
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].content).toBe('halo');
  });
});

describe('custom.callJudge', () => {
  const judgeBody = {
    verdict: 'pass_with_notes', score: 82,
    checks: [{ rule_id: 'SS_DESC_LEN', status: 'ok', evidence: '12 kata', fix: '' }],
    unsupported_metadata: [], ip_risks: [], category_ok: true,
    suggested_category: null, needs_editorial_or_release: false, confidence: 0.8
  };

  it('tanpa gambar bila sendImage mati; rule_id asing ditolak', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: JSON.stringify(judgeBody) } }] }));
    const out = await custom.callJudge({
      apiKey: 'k', ...CFG, sendImage: false,
      image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
      observation: OBS, metadataText: '{}', rulesBlock: 'RULES', hardContext: ''
    });
    expect(out.verdict).toBe('pass_with_notes');
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].content).not.toContain('image_url');
  });

  it('dengan gambar bila sendImage aktif', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: JSON.stringify(judgeBody) } }] }));
    await custom.callJudge({
      apiKey: 'k', ...CFG, sendImage: true,
      image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
      observation: OBS, metadataText: '{}', rulesBlock: 'RULES', hardContext: ''
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('JURI KEPATUHAN') },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' } }
    ]);
  });
});
