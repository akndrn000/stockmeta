// @vitest-environment jsdom
// Tes useAnalysisBatch (M29, Mode Analisis) lewat harness React kecil — pola useBatch.test.ts:
// adapter palsu di registry, tanpa jaringan. Slot metadata TIDAK boleh tersentuh.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileStore } from '../lib/fileStore';
import { blankObservation } from '../lib/observation';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import { groq } from '../lib/providers/groq';
import type { ProviderAdapter } from '../lib/providers/types';
import type { AnalysisResult } from '../lib/types';
import type { Frame } from '../lib/types';
import { ALL_ANALYZED_MSG, ANALYSIS_LIMIT_TIP_MSG, useAnalysisBatch } from './useAnalysisBatch';
import { NEED_TEST_MSG } from './useBatch';
import { useProvider } from './useProvider';
import { useSession } from './useSession';

// prepareImage asli butuh canvas/FileReader — cukup stub seperti useBatch.test.ts.
vi.mock('../lib/image', () => ({
  prepareImage: async (file: File) => ({ base64: 'stub', mimeType: file.type || 'image/jpeg' }),
  makeThumbnail: async () => ''
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Step = { analysis?: AnalysisResult; err?: Error };
let script: Step[] = [];
let calls = 0;

const fakeAdapter: ProviderAdapter = {
  id: 'gemini',
  label: 'Gemini',
  supportsVision: true,
  testConnection: async () => ({ ok: true }),
  callText: async () => '{}',
  callJudge: async () => ({
    verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
    category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
  }),
  generateForImage: async () => ({}),
  observeImage: async () => blankObservation(),
  analyzeImage: async () => {
    const step = script[Math.min(calls, Math.max(script.length - 1, 0))] ?? {};
    calls++;
    if (step.err) throw step.err;
    return step.analysis ?? { verdict: 'layak', issues: [], summary: '' };
  }
};

const holderRef: {
  current?: {
    s: ReturnType<typeof useSession>;
    p: ReturnType<typeof useProvider>;
    a: ReturnType<typeof useAnalysisBatch>;
  };
} = {};
function Harness() {
  const s = useSession();
  const p = useProvider();
  const a = useAnalysisBatch(s, p, { delayMs: 0 });
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = { s, p, a };
  return createElement('div');
}
const api = () => holderRef.current as NonNullable<typeof holderRef.current>;

let root: Root;
let host: HTMLElement;

const blank = (name: string): Omit<Frame, 'id'> => ({
  name,
  thumb: '',
  tema: '',
  status: { adobe: 'menunggu', shutterstock: 'menunggu' },
  error: { adobe: '', shutterstock: '' },
  metadata: {}
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear();
  fileStore.clear();
  script = [];
  calls = 0;
  registry.gemini = fakeAdapter;
  registry.groq = fakeAdapter;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  registry.gemini = gemini;
  registry.groq = groq;
  await act(async () => root.unmount());
  host.remove();
});

function addFrames(n: number) {
  act(() => {
    for (let i = 0; i < n; i++) {
      const id = api().s.addFrame(blank(`f${i}.jpg`));
      fileStore.set(id, new File(['x'], `f${i}.jpg`, { type: 'image/jpeg' }));
    }
  });
}

async function ready() {
  act(() => api().p.setKey('kunci-rahasia'));
  await act(async () => { await api().p.test(); });
  expect(api().p.status).toBe('ok');
}

describe('useAnalysisBatch — startAnalysis', () => {
  it('sukses → slot analysis terisi + analysisStatus siap, metadata TAK tersentuh', async () => {
    addFrames(1);
    await ready();
    script = [{ analysis: { verdict: 'berpotensi-ditolak', issues: [{ category: 'komposisi', description: 'Horizon miring.' }], summary: 'Komposisi bermasalah.' } }];

    act(() => api().a.startAnalysis());
    await flush();

    const f = api().s.frames[0];
    expect(f.analysis?.adobe).toEqual(script[0].analysis);
    expect(f.analysisStatus?.adobe).toBe('siap');
    expect(f.analysisError?.adobe).toBe('');
    // slot metadata tetap perawan
    expect(f.metadata.adobe).toBeUndefined();
    expect(f.status.adobe).toBe('menunggu');
    expect(api().a.progress).toEqual({ done: 1, failed: 0, total: 1 });
    expect(api().a.busy).toBe(false);
  });

  it('frame yang sudah dianalisis dilewati; gagal diproses ulang', async () => {
    addFrames(3);
    await ready();
    act(() => {
      api().s.applyAnalysis(0, 'adobe', { verdict: 'layak', issues: [], summary: 'OK' });
      api().s.failAnalysis(1, 'adobe', 'HTTP 500');
    });
    script = [{ analysis: { verdict: 'layak', issues: [], summary: 'Baru.' } }];

    act(() => api().a.startAnalysis());
    await flush();

    expect(calls).toBe(2);   // frame 0 (siap) dilewati
    expect(api().s.frames[0].analysis?.adobe?.summary).toBe('OK');
    expect(api().s.frames[1].analysisStatus?.adobe).toBe('siap');
    expect(api().s.frames[2].analysisStatus?.adobe).toBe('siap');
  });

  it('semua sudah dianalisis → pesan, tanpa panggilan', async () => {
    addFrames(1);
    await ready();
    act(() => api().s.applyAnalysis(0, 'adobe', { verdict: 'layak', issues: [], summary: 'OK' }));

    act(() => api().a.startAnalysis());
    await flush();

    expect(api().a.notice).toBe(ALL_ANALYZED_MSG);
    expect(calls).toBe(0);
  });

  it('provider belum dites → tolak, tanpa panggilan', async () => {
    addFrames(1);

    act(() => api().a.startAnalysis());
    await flush();

    expect(api().a.notice).toBe(NEED_TEST_MSG);
    expect(calls).toBe(0);
  });

  it('gagal → analysisStatus gagal + pesan asli, limit → saran tampil', async () => {
    addFrames(2);
    await ready();
    script = [
      { err: new Error('Batas kuota tercapai (429)') },
      { analysis: { verdict: 'layak', issues: [], summary: 'OK' } }
    ];

    act(() => api().a.startAnalysis());
    await flush();

    expect(api().s.frames[0].analysisStatus?.adobe).toBe('gagal');
    expect(api().s.frames[0].analysisError?.adobe).toBe('Batas kuota tercapai (429)');
    expect(api().s.frames[1].analysisStatus?.adobe).toBe('siap');
    expect(api().a.progress).toEqual({ done: 1, failed: 1, total: 2 });
    expect(api().a.notice).toBe(ANALYSIS_LIMIT_TIP_MSG);
  });

  it('regenerateAnalysisFrame: slot terisi → konfirmasi dulu, klik kedua jalan', async () => {
    addFrames(1);
    await ready();
    act(() => api().s.applyAnalysis(0, 'adobe', { verdict: 'layak', issues: [], summary: 'Lama' }));
    script = [{ analysis: { verdict: 'layak', issues: [], summary: 'Baru' } }];

    act(() => api().a.regenerateAnalysisFrame(0));
    await flush();
    expect(calls).toBe(0);
    expect(api().a.regenConfirm).toBe(0);

    act(() => api().a.regenerateAnalysisFrame(0));
    await flush();
    expect(calls).toBe(1);
    expect(api().s.frames[0].analysis?.adobe?.summary).toBe('Baru');
  });
});
