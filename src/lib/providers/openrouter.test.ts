import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE } from '../limits';
import { openrouter } from './openrouter';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const gen = (apiKey = 'RAHASIA') => openrouter.generateForImage({
  apiKey,
  image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
  platform: 'shutterstock',
  theme: 'Halloween'
});

describe('openrouter.testConnection', () => {
  it('GET /models dengan Bearer → daftar model = sukses, key tidak ada di URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ data: [{ id: 'google/gemma-3-27b-it:free' }] }));

    expect(await openrouter.testConnection('kunci')).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer kunci');
    expect(url).not.toContain('kunci');
  });

  it('error.message dari body OpenRouter dibawa utuh + status HTTP saat key ditolak', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(
      { error: { message: 'Invalid API key provided' } }, 401
    ));
    expect(await openrouter.testConnection('salah')).toEqual({
      ok: false,
      message: 'Invalid API key provided (HTTP 401)'
    });
  });

  it('error.code ikut ditampilkan bila ada (diagnostik, bukan generik)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(
      { error: { message: 'No endpoints found', code: 404 } }, 404
    ));
    expect(await openrouter.testConnection('kunci')).toEqual({
      ok: false,
      message: 'No endpoints found [code 404] (HTTP 404)'
    });
  });

  it('respons non-JSON (halaman error gateway) → status + potongan body mentah', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    expect(await openrouter.testConnection('kunci')).toEqual({
      ok: false,
      message: 'OpenRouter error (HTTP 502): <html>Bad Gateway</html>'
    });
  });

  it('JSON tanpa error.message dikenal → status + ringkasan JSON (tetap ada info)', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ unexpected: 'shape' }, 500));
    expect(await openrouter.testConnection('kunci')).toEqual({
      ok: false,
      message: 'OpenRouter error (HTTP 500): {"unexpected":"shape"}'
    });
  });
});

describe('openrouter.generateForImage', () => {
  it('M33 Tahap D: promptOverride dipakai + gambar Tahap A tetap dikirim', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: '{"remove":["puppy"]}' } }] }));
    const out = await openrouter.generateForImage({
      apiKey: 'RAHASIA',
      image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
      platform: 'adobe',
      promptOverride: 'Hapus kata yang salah'
    });
    expect(out.stageRemove).toEqual(['puppy']);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Hapus kata yang salah' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' } }
    ]);
  });

  it('model openrouter/free + data URI + response_format json_object, hasil di-parse', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: JSON.stringify({
      description: 'Seekor kucing di atas meja',
      keywords: ['kucing', 'meja'],
      category: ['Nature', 'Objects']
    }) } }] }));

    const out = await gen();

    expect(out).toEqual({
      description: 'Seekor kucing di atas meja',
      keywords: ['kucing', 'meja'],
      category: 'Nature',
      categories: ['Nature', 'Objects']
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer RAHASIA');
    expect(url).not.toContain('RAHASIA');

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('openrouter/free');          // alias, bukan hardcode model vision
    expect(body.response_format).toEqual({ type: 'json_object' });
    // Seragam Groq/Gemini: suhu rendah + pagu token longgar.
    expect(body.temperature).toBe(GENERATION_TEMPERATURE);
    expect(body.max_tokens).toBe(GENERATION_MAX_TOKENS);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('Tema utama dari kontributor: "Halloween".') },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' } }
    ]);
  });

  it('response_format ditolak (400) → ulangi sekali TANPA parameter itu', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonRes({ error: { message: 'response_format not supported' } }, 400))
      .mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: '{"keywords":["a"]}' } }] }));

    const out = await gen();
    expect(out.keywords).toEqual(['a']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(first.response_format).toEqual({ type: 'json_object' });
    expect(second.response_format).toBeUndefined();
    expect(second.temperature).toBe(GENERATION_TEMPERATURE);
    expect(second.max_tokens).toBe(GENERATION_MAX_TOKENS);
    expect(second.model).toBe('openrouter/free');
    expect(second.messages[0].content).toEqual(first.messages[0].content);   // prompt & gambar identik
  });

  it('error non-retryable (404) membawa pesan body utuh + status, satu panggilan saja', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ error: { message: 'No endpoints found' } }, 404));
    await expect(gen('RAHASIA-LAIN')).rejects.toThrow('No endpoints found (HTTP 404)');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('RAHASIA-LAIN');
  });
});
