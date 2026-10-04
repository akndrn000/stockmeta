// @vitest-environment jsdom
// Tes CompliancePanel: observasi + peringatan C + langkah manual + privasi juri.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useBatch } from '../hooks/useBatch';
import type { useJudge } from '../hooks/useJudge';
import { blankObservation } from '../lib/observation';
import { useSession } from '../hooks/useSession';
import { CompliancePanel } from './CompliancePanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const holderRef: { current?: ReturnType<typeof useSession> } = {};
function Harness() {
  const s = useSession();
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian
  holderRef.current = s;
  return createElement('div');
}
const api = () => holderRef.current as NonNullable<typeof holderRef.current>;

let root: Root;
let host: HTMLElement;
const text = () => host.textContent ?? '';

const batchFake = {
  reobserveFrame: vi.fn(),
  regenerateFrame: vi.fn(),
  busy: false
} as unknown as ReturnType<typeof useBatch>;

function judgeFake(over: Partial<ReturnType<typeof useJudge>> = {}) {
  return {
    judges: ['groq'],
    setJudges: vi.fn(),
    sendImage: true,
    setSendImage: vi.fn(),
    privacyAcked: false,
    ackPrivacy: vi.fn(),
    judgeNote: 'juri: 1 dari 3',
    disclaimer: 'Perkiraan kelolosan (saran, bukan keputusan platform)',
    judgeFrame: vi.fn(),
    judgeAll: vi.fn(),
    cancel: vi.fn(),
    busy: false,
    currentId: null,
    progress: { done: 0, failed: 0, total: 0 },
    summary: null,
    notice: '',
    entryOf: () => null,
    requestFix: vi.fn(),
    applyFix: vi.fn(),
    ...over
  } as unknown as ReturnType<typeof useJudge>;
}

let panelRoot: Root | null = null;
let panelHost: HTMLElement | null = null;

function renderPanel(judge = judgeFake()) {
  panelHost = document.createElement('div');
  document.body.appendChild(panelHost);
  const host: HTMLElement = panelHost;
  panelRoot = createRoot(host);
  act(() => {
    panelRoot?.render(createElement(CompliancePanel, { session: api(), batch: batchFake, judge }));
  });
}

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  if (panelRoot && panelHost) {
    act(() => panelRoot?.unmount());
    panelHost.remove();
    panelRoot = null;
    panelHost = null;
  }
});

function addObservedFrame(): number {
  let id = 0;
  act(() => {
    id = api().addFrame({
      name: 'f0.jpg', thumb: '', tema: '',
      status: { adobe: 'menunggu', shutterstock: 'menunggu' },
      error: { adobe: '', shutterstock: '' },
      metadata: {}
    });
    api().applyObservation(id, {
      ...blankObservation(),
      media_type: 'illustration',
      main_subject: 'red panda icon',
      visible_brands_logos: ['Nike'],
      confidence: 0.4
    });
    api().select(id);
  });
  return id;
}

describe('CompliancePanel', () => {
  it('tanpa frame terpilih → minta pilih frame', () => {
    renderPanel();
    expect(panelHost?.textContent).toContain('Pilih frame');
  });

  it('observasi tampil + peringatan C + badge perlu ditinjau + langkah manual', () => {
    addObservedFrame();
    renderPanel();
    const t = panelHost!.textContent ?? '';
    expect(t).toContain('red panda icon');
    expect(t).toContain('illustration');
    expect(t).toContain('perlu ditinjau');
    expect(t).toContain('Nike');
    expect(t).toContain('Ilustrasi');
    expect(t).toContain('Langkah manual di portal');
    expect(t).toContain('Recognizable people or property');
    expect(text()).toBeDefined();
  });

  it('kotak privasi + tombol ack memanggil ackPrivacy', () => {
    addObservedFrame();
    const ackPrivacy = vi.fn();
    renderPanel(judgeFake({ ackPrivacy }));
    const btn = Array.from(panelHost!.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Saya mengerti')
    );
    expect(btn).not.toBeNull();
    act(() => { btn?.click(); });
    expect(ackPrivacy).toHaveBeenCalledTimes(1);
  });

  it('tombol analisis ulang memanggil reobserveFrame', () => {
    addObservedFrame();
    renderPanel();
    const btn = Array.from(panelHost!.querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Analisis ulang gambar')
    );
    act(() => { btn?.click(); });
    expect(batchFake.reobserveFrame).toHaveBeenCalled();
  });

  it('badge juri + disclaimer tampil bila ada entry', () => {
    addObservedFrame();
    const entry = {
      hash: 'x',
      badge: 'LOLOS_DENGAN_CATATAN',
      consensus: {
        badge: 'LOLOS_DENGAN_CATATAN',
        checks: [{ rule_id: 'IP_BRAND', status: 'warn', evidence: ['logo'], fix: 'samarkan' }],
        unsupported: [],
        ipRisks: [],
        needsEditorialOrRelease: false,
        avgConfidence: 0.9,
        judgeCount: 1,
        judgeNote: 'juri: 1 dari 3'
      },
      judges: [],
      at: Date.now()
    };
    renderPanel(judgeFake({
      entryOf: () => entry as never
    }));
    const t = panelHost!.textContent ?? '';
    expect(t).toContain('LOLOS DENGAN CATATAN');
    expect(t).toContain('bukan keputusan platform');
    expect(t).toContain('IP_BRAND');
  });
});
