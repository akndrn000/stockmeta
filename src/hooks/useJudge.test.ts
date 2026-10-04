// @vitest-environment jsdom
// Tes useJudge: konsensus 3 juri mock, timeout satu provider, cache invalid saat metadata berubah.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileStore } from '../lib/fileStore';
import { blankObservation } from '../lib/observation';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import { groq } from '../lib/providers/groq';
import { custom } from '../lib/providers/custom';
import type { JudgeOutput, ProviderAdapter } from '../lib/providers/types';
import type { Frame } from '../lib/types';
import { useProvider } from './useProvider';
import { useSession } from './useSession';
import { judgeEntryOf, PRIVACY_MSG, useJudge } from './useJudge';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../lib/image', () => ({
  prepareImage: async (file: File) => ({ base64: 'stub', mimeType: file.type || 'image/jpeg' }),
  makeThumbnail: async () => ''
}));

const PASS: JudgeOutput = {
  verdict: 'pass', score: 95,
  checks: [{ rule_id: 'ADOBE_TITLE_LEN', status: 'ok', evidence: '34 karakter', fix: '' }],
  unsupported_metadata: [], ip_risks: [], category_ok: true,
  suggested_category: null, needs_editorial_or_release: false, confidence: 0.9
};
const FAIL: JudgeOutput = {
  verdict: 'fail', score: 30,
  checks: [{ rule_id: 'IP_BRAND', status: 'fail', evidence: 'logo terlihat', fix: 'samarkan logo' }],
  unsupported_metadata: [], ip_risks: ['logo'], category_ok: true,
  suggested_category: null, needs_editorial_or_release: true, confidence: 0.8
};

let verdicts: Record<string, JudgeOutput | Error> = {};
function mockAdapter(id: 'groq' | 'gemini' | 'custom'): ProviderAdapter {
  return {
    id,
    label: id,
    supportsVision: true,
    testConnection: async () => ({ ok: true }),
    generateForImage: async () => ({}),
    analyzeImage: async () => ({ verdict: 'layak', issues: [], summary: '' }),
    observeImage: async () => blankObservation(),
    callText: async () => '{}',
    callJudge: async () => {
      const v = verdicts[id] ?? PASS;
      if (v instanceof Error) throw v;
      return v;
    }
  };
}

const holderRef: {
  current?: {
    s: ReturnType<typeof useSession>;
    p: ReturnType<typeof useProvider>;
    j: ReturnType<typeof useJudge>;
  };
} = {};
function Harness() {
  const s = useSession();
  const p = useProvider();
  const j = useJudge(s, p, { delayMs: 0 });
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian
  holderRef.current = { s, p, j };
  return createElement('div');
}
const api = () => holderRef.current as NonNullable<typeof holderRef.current>;

let root: Root;
let host: HTMLElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const GOOD_META = {
  title: 'Red panda eating bamboo in forest',
  keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature', 'green',
    'mountain', 'daylight', 'animal', 'cute', 'fur', 'tree', 'leaves',
    'outdoor', 'park', 'resting', 'sitting', 'branch', 'tall', 'brown', 'black', 'white', 'grey'],
  category: 'Animals'
};

function addReadyFrame(): number {
  let id = 0;
  act(() => {
    id = api().s.addFrame({
      name: 'f0.jpg', thumb: '', tema: '',
      status: { adobe: 'menunggu', shutterstock: 'menunggu' },
      error: { adobe: '', shutterstock: '' },
      metadata: {}
    });
    fileStore.set(id, new File(['x'], 'f0.jpg', { type: 'image/jpeg' }));
    api().s.applyGenerated(id, 'adobe', GOOD_META);
    api().s.applyObservation(id, { ...blankObservation(), main_subject: 'red panda', confidence: 0.9 });
  });
  return id;
}

beforeEach(() => {
  localStorage.clear();
  fileStore.clear();
  verdicts = {};
  localStorage.setItem('stockmeta_groq_key', 'k1');
  localStorage.setItem('stockmeta_gemini_key', 'k2');
  localStorage.setItem('stockmeta_custom_key', 'k3');
  localStorage.setItem('stockmeta_custom_baseurl', 'https://contoh.test/v1');
  localStorage.setItem('stockmeta_custom_model', 'm');
  registry.groq = mockAdapter('groq');
  registry.gemini = mockAdapter('gemini');
  registry.custom = mockAdapter('custom');
  holderRef.current = undefined;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  registry.gemini = gemini;
  registry.groq = groq;
  registry.custom = custom;
  await act(async () => root.unmount());
  host.remove();
});

async function ackAndJudge(id: number) {
  act(() => api().j.ackPrivacy());
  act(() => api().p.setKey('k1'));
  await act(async () => { await api().p.test(); });
  act(() => api().j.judgeFrame(id));
  await flush();
  await flush();
}

describe('useJudge', () => {
  it('privasi wajib dikonfirmasi sekali sebelum menilai', async () => {
    const id = addReadyFrame();
    act(() => api().j.judgeFrame(id));
    await flush();
    expect(api().j.notice).toBe(PRIVACY_MSG);
    expect(api().j.privacyAcked).toBe(false);
  });

  it('3 pass → LOLOS + matriks per juri tersimpan', async () => {
    const id = addReadyFrame();
    await ackAndJudge(id);
    const frame = api().s.frames.find((f) => f.id === id) as Frame;
    const entry = judgeEntryOf(frame, 'adobe');
    expect(entry?.badge).toBe('LOLOS');
    expect(entry?.judges).toHaveLength(3);
    expect(entry?.consensus.checks[0].rule_id).toBe('ADOBE_TITLE_LEN');
  });

  it('2 pass 1 fail → PERLU DITINJAU', async () => {
    verdicts = { custom: FAIL };
    const id = addReadyFrame();
    await ackAndJudge(id);
    const frame = api().s.frames.find((f) => f.id === id) as Frame;
    expect(judgeEntryOf(frame, 'adobe')?.badge).toBe('PERLU_DITINJAU');
  });

  it('timeout satu provider → 2 juri lain tetap dinilai', async () => {
    verdicts = { gemini: new Error('Timeout') };
    const id = addReadyFrame();
    await ackAndJudge(id);
    const frame = api().s.frames.find((f) => f.id === id) as Frame;
    const entry = judgeEntryOf(frame, 'adobe');
    expect(entry?.badge).toBe('LOLOS');
    expect(entry?.judges).toHaveLength(2);
  });

  it('cek keras gagal mengalahkan 3 pass → TIDAK LOLOS', async () => {
    const id = addReadyFrame();
    act(() => {
      api().s.updateMetadata(id, 'adobe', { title: 'x'.repeat(201) });
    });
    await ackAndJudge(id);
    const frame = api().s.frames.find((f) => f.id === id) as Frame;
    expect(judgeEntryOf(frame, 'adobe')?.badge).toBe('TIDAK_LOLOS');
  });

  it('cache invalid saat metadata berubah', async () => {
    const id = addReadyFrame();
    await ackAndJudge(id);
    let frame = api().s.frames.find((f) => f.id === id) as Frame;
    expect(judgeEntryOf(frame, 'adobe')).not.toBeNull();
    act(() => {
      api().s.updateMetadata(id, 'adobe', { title: 'Red panda sleeping on branch' });
    });
    frame = api().s.frames.find((f) => f.id === id) as Frame;
    expect(judgeEntryOf(frame, 'adobe')).toBeNull();
  });
});
