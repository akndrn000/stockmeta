import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gemini, pickGeminiModel } from './gemini';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('gemini.testConnection', () => {
  it('400 API_KEY_INVALID → key salah (peta dari BODY, bukan status saja)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({
      error: {
        code: 400,
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }]
      }
    }, 400));
    await expect(gemini.testConnection('kunci-salah')).resolves.toEqual({
      ok: false, message: 'Key salah — API key ditolak Gemini.'
    });
  });

  it('sukses: 200 + models[] → model auto-detect dari preferensi legacy', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ models: [
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }
    ] }));
    await expect(gemini.testConnection('kunci')).resolves.toEqual({ ok: true, model: 'gemini-3.5-flash' });
  });

  it('429 → batas kuota; 200 tanpa model → ditolak', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ error: { message: 'quota' } }, 429));
    await expect(gemini.testConnection('kunci')).resolves.toEqual({
      ok: false, message: 'Batas kuota tercapai (429) — coba lagi nanti.'
    });
    fetchMock.mockResolvedValueOnce(jsonRes({ models: [] }));
    await expect(gemini.testConnection('kunci')).resolves.toEqual({
      ok: false, message: 'Key diterima, tapi tidak ada model yang bisa dipakai.'
    });
  });

  it('jaringan mati → tidak ada koneksi; key tidak pernah muncul di pesan', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await gemini.testConnection('kunci-rahasia');
    expect(r).toEqual({ ok: false, message: 'Tidak ada koneksi ke server Gemini.' });
    expect(JSON.stringify(r)).not.toContain('kunci-rahasia');
  });
});

describe('pickGeminiModel', () => {
  it('preferensi urut legacy: 3.6 menang atas 2.5', () => {
    expect(pickGeminiModel([
      { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }
    ])).toBe('gemini-3.6-flash');
  });

  it('hanya model yang mendukung generateContent', () => {
    expect(pickGeminiModel([
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['embedContent'] }
    ])).toBe('gemini-2.5-flash');
  });

  it('nama tanpa prefix models/ dan tanpa supportedGenerationMethods tetap dipakai', () => {
    expect(pickGeminiModel([{ name: 'gemini-3.7-flash' }])).toBe('gemini-3.7-flash');
  });

  it('flash non-vision (image/audio/…) di-skip', () => {
    expect(pickGeminiModel([
      { name: 'models/gemini-experimental-flash-image', supportedGenerationMethods: ['generateContent'] }
    ])).toBe('gemini-2.5-flash');
  });

  it('fallback terakhir', () => {
    expect(pickGeminiModel([])).toBe('gemini-2.5-flash');
    expect(pickGeminiModel()).toBe('gemini-2.5-flash');
  });
});
