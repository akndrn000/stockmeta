// @vitest-environment jsdom
// Tes Worksheet dalam MODE ANALISIS (M29): tombol utama "Jalankan Analisis", batch jalan
// via analyzeImage, tile menampilkan badge analisis, "Buat ulang semua" disembunyikan.
// Harness sendiri (mode='analisis') — perilaku mode metadata diuji Worksheet.test.ts.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnalysisBatch } from '../hooks/useAnalysisBatch';
import { useBatch } from '../hooks/useBatch';
import { useProvider } from '../hooks/useProvider';
import { useSession } from '../hooks/useSession';
import { fileStore } from '../lib/fileStore';
import { blankObservation } from '../lib/observation';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import { groq } from '../lib/providers/groq';
import type { ProviderAdapter } from '../lib/providers/types';
import type { AnalysisResult } from '../lib/types';
import type { Frame } from '../lib/types';
import { Worksheet } from './Worksheet';

// prepareImage asli butuh canvas/FileReader — cukup stub.
vi.mock('../lib/image', () => ({
  prepareImage: async (file: File) => ({ base64: 'stub', mimeType: file.type || 'image/jpeg' }),
  makeThumbnail: async () => ''
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let script: { analysis?: AnalysisResult; err?: Error }[] = [];
let calls = 0;

const fakeAdapter: ProviderAdapter = {
  id: 'gemini',
  label: 'Gemini',
  supportsVision: true,
  testConnection: async () => ({ ok: true }),
  observeImage: async () => blankObservation(),
  callText: async () => '{}',
  callJudge: async () => ({
    verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
    category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
  }),
  generateForImage: async () => ({}),
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
    b: ReturnType<typeof useBatch>;
    a: ReturnType<typeof useAnalysisBatch>;
  };
} = {};
function Harness() {
  const s = useSession();
  const p = useProvider();
  const b = useBatch(s, p, { delayMs: 0 });
  const a = useAnalysisBatch(s, p, { delayMs: 0 });
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = { s, p, b, a };
  return createElement(Worksheet, { session: s, provider: p, batch: b, mode: 'analisis', analysis: a });
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

const text = () => host.textContent ?? '';
const findBtn = (label: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) ?? null;

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

function addFrames(n: number): number[] {
  const ids: number[] = [];
  act(() => {
    for (let i = 0; i < n; i++) {
      const id = api().s.addFrame(blank(`f${i}.jpg`));
      fileStore.set(id, new File(['x'], `f${i}.jpg`, { type: 'image/jpeg' }));
      ids.push(id);
    }
  });
  return ids;
}

async function ready() {
  act(() => api().p.setKey('kunci-rahasia'));
  await act(async () => { await api().p.test(); });
  expect(api().p.status).toBe('ok');
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('Worksheet mode analisis (M29)', () => {
  it('tombol utama "Jalankan Analisis" (bukan "Buat metadata"); tanpa "Buat ulang semua"', async () => {
    addFrames(1);
    await ready();
    expect(findBtn('Jalankan Analisis')).not.toBeNull();
    expect(findBtn('Buat metadata')).toBeNull();
    expect(findBtn('Buat ulang semua')).toBeNull();
  });

  it('klik → analisis jalan via analyzeImage; tile SIAP; metadata tak tersentuh', async () => {
    addFrames(1);
    await ready();
    script = [{ analysis: { verdict: 'layak', issues: [], summary: 'OK' } }];

    act(() => { findBtn('Jalankan Analisis')!.click(); });
    await flush();

    expect(calls).toBe(1);
    const f = api().s.frames[0];
    expect(f.analysisStatus?.adobe).toBe('siap');
    expect(f.analysis?.adobe?.verdict).toBe('layak');
    expect(f.metadata.adobe).toBeUndefined();   // slot metadata tak tersentuh
    expect(f.status.adobe).toBe('menunggu');
    // badge tile mengikuti STATUS ANALISIS di mode ini (bukan status metadata):
    // status metadata 'menunggu' (badge MENUNGGU) justru TIDAK tampil.
    expect(text()).toContain('SIAP');
    expect(text()).not.toContain('MENUNGGU');
  });

  it('ikon tile ber-label analisis ("Analisis ulang untuk …")', () => {
    addFrames(1);
    const btn = host.querySelector('[aria-label="Analisis ulang untuk f0.jpg"]');
    expect(btn).not.toBeNull();
    expect(host.querySelector('[aria-label^="Buat ulang metadata"]')).toBeNull();
  });

  it('analisis gagal → tile GAGAL + tombol "Coba lagi frame gagal" memproses ulang', async () => {
    addFrames(1);
    await ready();
    script = [{ err: new Error('HTTP 500') }];

    act(() => { findBtn('Jalankan Analisis')!.click(); });
    await flush();

    expect(api().s.frames[0].analysisStatus?.adobe).toBe('gagal');
    expect(text()).toContain('GAGAL');
    expect(findBtn('Coba lagi frame gagal')).not.toBeNull();

    script = [{ analysis: { verdict: 'layak', issues: [], summary: 'OK' } }];
    act(() => { findBtn('Coba lagi frame gagal')!.click(); });
    await flush();
    expect(api().s.frames[0].analysisStatus?.adobe).toBe('siap');
  });
});
