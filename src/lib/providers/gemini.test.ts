import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gemini } from './gemini';
import { GEMINI_MODEL } from './models';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonRes(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers }
  });
}

const genArgs = { apiKey: 'RAHASIA', image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' }, platform: 'adobe' } as const;

describe('gemini.testConnection', () => {
  it('tes ke endpoint model tunggal: key valid + model tersedia → sukses', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ name: 'models/' + GEMINI_MODEL }));
    await expect(gemini.testConnection('kunci')).resolves.toEqual({ ok: true });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + '?key=kunci');
    expect(url).not.toContain('kunci-rahasia');
  });

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

  it('404 model ditolak API → pesan menyebut nama model (tanpa pindah model diam-diam)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({
      error: { code: 404, message: 'models/' + GEMINI_MODEL + ' is not found', status: 'NOT_FOUND' }
    }, 404));
    const out = await gemini.testConnection('kunci');
    expect(out.ok).toBe(false);
    expect((out as { message: string }).message).toContain(GEMINI_MODEL);
    expect((out as { message: string }).message).toContain('laporkan');
  });

  it('429 → batas kuota', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ error: { message: 'quota' } }, 429));
    await expect(gemini.testConnection('kunci')).resolves.toEqual({
      ok: false, message: 'Batas kuota tercapai (429) — coba lagi nanti.'
    });
  });

  it('jaringan mati → tidak ada koneksi; key tidak pernah muncul di pesan', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await gemini.testConnection('kunci-rahasia');
    expect(r).toEqual({ ok: false, message: 'Tidak ada koneksi ke server Gemini.' });
    expect(JSON.stringify(r)).not.toContain('kunci-rahasia');
  });
});

describe('gemini.generateForImage', () => {
  it('hanya memakai model tunggal dari models.ts (tanpa daftar/pemilihan model)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ candidates: [{ content: { parts: [{ text: '{"keywords":[]}' }] } }] }));
    await gemini.generateForImage(genArgs);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/models/' + GEMINI_MODEL + ':generateContent');
    expect(url).not.toContain('gemini-2');
    expect(url).toContain('key=RAHASIA');
    expect(url.indexOf('RAHASIA')).toBeGreaterThan(url.indexOf('key='));
  });

  it('429 RESOURCE_EXHAUSTED (kuota harian) → TIDAK di-retry, pesan jelas Indonesia', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({
      error: {
        code: 429,
        message: "Quota exceeded for quota metric 'GenerateContentRequestCount' and limit 'GenerateContentRequestsPerDay'",
        status: 'RESOURCE_EXHAUSTED'
      }
    }, 429));
    await expect(gemini.generateForImage(genArgs)).rejects.toThrow(
      'Kuota harian Gemini habis, coba lagi besok atau pakai Groq.'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 per menit (tanpa RESOURCE_EXHAUSTED) → menunggu retry-after lalu coba lagi', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ error: { message: 'Rate limit reached' } }, 429, { 'retry-after': '1' }))
      .mockResolvedValueOnce(jsonRes({ candidates: [{ content: { parts: [{ text: '{"keywords":[]}' }] } }] }));
    await gemini.generateForImage(genArgs);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
