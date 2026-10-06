// Ketiga provider memakai SATU builder prompt (buildMetadataPrompt): teks prompt
// yang dikirim untuk input sama harus identik pada kerangka aturannya.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gemini } from './gemini';
import { groq } from './groq';
import { openrouter } from './openrouter';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function jsonRes(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

const args = {
  apiKey: 'kunci',
  image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
  platform: 'adobe' as const,
  theme: 'Halloween'
};

const geminiOk = () => jsonRes({
  candidates: [{ content: { parts: [{ text: '{"keywords":[],"category":"Animals"}' }] } }]
});
const openaiOk = () => jsonRes({
  choices: [{ message: { content: '{"keywords":[],"category":"Animals"}' } }]
});

describe('satu builder prompt untuk semua provider', () => {
  it('teks prompt identik pada kerangka aturannya (adobe + shutterstock)', async () => {
    for (const platform of ['adobe', 'shutterstock'] as const) {
      const a = { ...args, platform };
      fetchMock.mockResolvedValueOnce(geminiOk());
      await gemini.generateForImage(a);
      const gBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
      const gPrompt = gBody.contents[0].parts[0].text as string;

      fetchMock.mockResolvedValueOnce(openaiOk());
      await groq.generateForImage(a);
      const qBody = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
      const qPrompt = qBody.messages[0].content[0].text as string;

      fetchMock.mockResolvedValueOnce(openaiOk());
      await openrouter.generateForImage(a);
      const oBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
      const oPrompt = oBody.messages[0].content[0].text as string;

      expect(qPrompt).toBe(gPrompt);
      expect(oPrompt).toBe(gPrompt);
      expect(gPrompt).toContain('visible_facts');
      fetchMock.mockClear();
    }
  });
});
