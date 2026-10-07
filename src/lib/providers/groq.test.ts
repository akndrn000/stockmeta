import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE } from '../limits';
import { groq } from './groq';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('groq.generateForImage', () => {
  it('bentuk request: data URI image_url + response_format json_object, hasil di-parse', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: JSON.stringify({
      description: 'Seekor kucing di atas meja',
      keywords: ['kucing', 'meja'],
      category: ['Nature', 'Objects']
    }) } }] }));

    const out = await groq.generateForImage({
      apiKey: 'RAHASIA',
      image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
      platform: 'shutterstock',
      theme: 'Halloween'
    });

    expect(out).toEqual({
      description: 'Seekor kucing di atas meja',
      keywords: ['kucing', 'meja'],
      category: 'Nature',
      categories: ['Nature', 'Objects']
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer RAHASIA');
    expect(url).not.toContain('RAHASIA');

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.response_format).toEqual({ type: 'json_object' });
    // Deterministik + JSON panjang tidak terpotong: suhu rendah, pagu token longgar.
    expect(body.temperature).toBe(GENERATION_TEMPERATURE);
    expect(body.max_tokens).toBe(GENERATION_MAX_TOKENS);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: expect.stringContaining('Tema utama dari kontributor: "Halloween".') },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' } }
    ]);
  });

  it('M33 Tahap D: promptOverride dipakai + gambar Tahap A tetap dikirim', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: '{"remove":["puppy"]}' } }] }));
    const out = await groq.generateForImage({
      apiKey: 'RAHASIA',
      image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
      platform: 'adobe',
      promptOverride: 'Hapus kata yang salah: {"remove": [...]}'
    });
    expect(out.stageRemove).toEqual(['puppy']);
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Hapus kata yang salah: {"remove": [...]}' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUFBQQ==' } }
    ]);
  });

  it('pesan error asli Groq dari body dibawa utuh ke ProviderError', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(
      { error: { message: 'Invalid API Key', type: 'invalid_request_error' } }, 401
    ));
    await expect(groq.generateForImage({
      apiKey: 'salah',
      image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
      platform: 'adobe'
    })).rejects.toThrow('Invalid API Key');
    expect(fetchMock).toHaveBeenCalledTimes(1);   // 401 tidak di-retry
  });

  it('model qwen tunggal tanpa fallback, key tidak pernah ada di URL', async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ choices: [{ message: { content: '{"keywords":[]}' } }] }));
    await groq.generateForImage({
      apiKey: 'RAHASIA-LAIN',
      image: { base64: 'QUFBQQ==', mimeType: 'image/png' },
      platform: 'adobe'
    });
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain('RAHASIA-LAIN');
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).model).toBe('qwen/qwen3.8-27b');
  });

  it('respons non-JSON (halaman error gateway) → pesan generik, bukan potongan body mentah', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const out = await groq.testConnection('kunci');
    expect(out).toEqual({ ok: false, message: 'Respons tidak terbaca dari Groq (HTTP 502).' });
  });
});
