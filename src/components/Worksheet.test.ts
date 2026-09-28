// @vitest-environment jsdom
// Tes Worksheet (perbaikan M8): tombol "Coba lagi frame gagal" hanya muncul saat ada frame
// gagal dan batch tidak berjalan (klik = startBatch), plus select "Jeda antar foto" yang
// menyimpan pilihannya ke localStorage. Harness React kecil + adapter provider palsu.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fileStore } from '../lib/fileStore';
import { BATCH_DELAY_DEFAULT_SEC, BATCH_DELAY_OPTIONS_SEC } from '../lib/limits';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import type { ProviderAdapter } from '../lib/providers/types';
import type { ParsedMetadata } from '../lib/prompt';
import { readBatchDelay } from '../lib/storage';
import type { Frame } from '../lib/types';
import { useBatch } from '../hooks/useBatch';
import { useProvider } from '../hooks/useProvider';
import { useSession } from '../hooks/useSession';
import { Worksheet } from './Worksheet';

// prepareImage asli butuh canvas/FileReader — tes tidak menguji itu, cukup stub.
vi.mock('../lib/image', () => ({
  prepareImage: async (file: File) => ({ base64: 'stub', mimeType: file.type || 'image/jpeg' }),
  makeThumbnail: async () => ''
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let script: { meta?: ParsedMetadata; pending?: boolean }[] = [];
let calls = 0;

const fakeAdapter: ProviderAdapter = {
  id: 'gemini',
  testConnection: async () => ({ ok: true, model: 'fake-model' }),
  generateForImage: async (args) => {
    const step = script[Math.min(calls, Math.max(script.length - 1, 0))] ?? {};
    calls++;
    if (step.pending) {
      return new Promise<ParsedMetadata>((_res, rej) => {
        args.signal?.addEventListener('abort', () => rej(new Error('Dibatalkan')), { once: true });
      });
    }
    return step.meta ?? {};
  }
};

const holderRef: {
  current?: {
    s: ReturnType<typeof useSession>;
    p: ReturnType<typeof useProvider>;
    b: ReturnType<typeof useBatch>;
  };
} = {};
function Harness() {
  const s = useSession();
  const p = useProvider();
  const b = useBatch(s, p, { delayMs: 0 });
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = { s, p, b };
  return createElement(Worksheet, { session: s, provider: p, batch: b });
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

const RETRY = 'Coba lagi frame gagal';
const findBtn = (label: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) ?? null;
const delaySelect = () => host.querySelector('#jeda-antar-foto') as HTMLSelectElement;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear();
  fileStore.clear();
  script = [];
  calls = 0;
  registry.gemini = fakeAdapter;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  registry.gemini = gemini;
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

describe('tombol "Coba lagi frame gagal"', () => {
  it('tidak tampil tanpa frame gagal; muncul setelah ada gagal; klik = jalankan batch ulang', async () => {
    const ids = addFrames(2);
    await ready();
    expect(findBtn(RETRY)).toBeNull();

    act(() => api().s.failFrame(ids[1], 'adobe', 'HTTP 500'));
    expect(findBtn(RETRY)).not.toBeNull();

    script = [{ meta: { title: 'judul ulang' } }]; // adapter palsu harus mengisi slot → status siap
    act(() => { findBtn(RETRY)!.click(); });
    await flush();

    expect(calls).toBe(2);                          // frame menunggu + frame gagal diproses
    expect(api().s.frames[1].status.adobe).toBe('siap');
    expect(api().s.frames[1].error.adobe).toBe('');
    expect(findBtn(RETRY)).toBeNull();              // tak ada gagal lagi → tombol hilang
  });

  it('saat batch berjalan → tombol tidak tampil (walau ada sisa frame gagal)', async () => {
    addFrames(2);
    await ready();
    script = [{ pending: true }];

    act(() => api().b.startBatch());
    await flush();
    expect(api().b.busy).toBe(true);
    expect(findBtn(RETRY)).toBeNull();

    act(() => api().b.cancel());
    await flush();
  });
});

describe('select "Jeda antar foto"', () => {
  it('default 6 detik; pilihan lain tersimpan ke localStorage & masuk state batch', () => {
    expect(delaySelect().value).toBe(String(BATCH_DELAY_DEFAULT_SEC));
    expect(readBatchDelay()).toBe(BATCH_DELAY_DEFAULT_SEC);
    expect(BATCH_DELAY_OPTIONS_SEC).toContain(12);

    const sel = delaySelect();
    sel.value = '12';
    act(() => { sel.dispatchEvent(new Event('change', { bubbles: true })); });

    expect(delaySelect().value).toBe('12');
    expect(readBatchDelay()).toBe(12);
    expect(api().b.delaySec).toBe(12);
  });

  it('disabled saat batch berjalan', async () => {
    addFrames(1);
    await ready();
    expect(delaySelect().disabled).toBe(false);
    script = [{ pending: true }];

    act(() => api().b.startBatch());
    await flush();
    expect(delaySelect().disabled).toBe(true);

    act(() => api().b.cancel());
    await flush();
    expect(delaySelect().disabled).toBe(false);
  });
});
