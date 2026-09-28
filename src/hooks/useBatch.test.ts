// @vitest-environment jsdom
// Tes useBatch lewat harness React kecil (react-dom/client + act) dengan adapter provider
// palsu di registry — tanpa jaringan, tanpa library tes UI.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MISSING_FILE_MSG } from '../lib/batch';
import { fileStore } from '../lib/fileStore';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import type { ProviderAdapter } from '../lib/providers/types';
import type { ParsedMetadata } from '../lib/prompt';
import type { WaitInfo } from '../lib/providers/retry';
import type { Frame } from '../lib/types';
import { ALL_DONE_MSG, LIMIT_TIP_MSG, NEED_TEST_MSG, useBatch } from './useBatch';
import { useProvider } from './useProvider';
import { useSession } from './useSession';

// prepareImage asli butuh canvas/FileReader — tes tidak menguji itu, cukup stub.
vi.mock('../lib/image', () => ({
  prepareImage: async (file: File) => ({ base64: 'stub', mimeType: file.type || 'image/jpeg' }),
  makeThumbnail: async () => ''
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Step = { meta?: ParsedMetadata; err?: Error; pending?: boolean; wait?: WaitInfo };
let script: Step[] = [];
let calls = 0;

const fakeAdapter: ProviderAdapter = {
  id: 'gemini',
  testConnection: async () => ({ ok: true, model: 'fake-model' }),
  generateForImage: async (args) => {
    const step = script[Math.min(calls, Math.max(script.length - 1, 0))] ?? {};
    calls++;
    if (step.wait) args.onWait?.(step.wait);
    if (step.pending) {
      return new Promise<ParsedMetadata>((_res, rej) => {
        args.signal?.addEventListener('abort', () => rej(new Error('Dibatalkan')), { once: true });
      });
    }
    if (step.err) throw step.err;
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

describe('useBatch — startBatch', () => {
  it('memproses menunggu/gagal saja, melewati siap, slot platform lain tak tersentuh', async () => {
    addFrames(3);
    await ready();
    act(() => {
      api().s.applyGenerated(0, 'adobe', { title: 'sudah jadi' });
      api().s.failFrame(1, 'adobe', 'HTTP 500');
      api().s.applyGenerated(1, 'shutterstock', { description: 'deskripsi lama' });
    });
    script = [{ meta: { title: 'baru' } }];

    act(() => api().b.startBatch());
    await flush();

    expect(calls).toBe(2);                                   // frame siap dilewati
    expect(api().s.frames[0].metadata.adobe?.title).toBe('sudah jadi');
    expect(api().s.frames[1].metadata.adobe).toEqual({ title: 'baru', keywords: [], category: '' });
    expect(api().s.frames[1].status.adobe).toBe('siap');
    expect(api().s.frames[2].status.adobe).toBe('siap');
    expect(api().s.frames[1].metadata.shutterstock?.description).toBe('deskripsi lama'); // tak tersentuh
    expect(api().s.frames[2].status.shutterstock).toBe('menunggu');
    expect(api().b.progress).toEqual({ done: 2, failed: 0, total: 2 });
    expect(api().b.summary).toMatchObject({ done: 2, failed: 0, cancelled: false });
    expect(api().b.busy).toBe(false);
  });

  it('semua frame sudah siap → pesan "Semua frame sudah selesai.", tanpa panggilan', async () => {
    addFrames(1);
    await ready();
    act(() => api().s.applyGenerated(0, 'adobe', { title: 'siap' }));

    act(() => api().b.startBatch());
    await flush();

    expect(api().b.notice).toBe(ALL_DONE_MSG);
    expect(calls).toBe(0);
    expect(api().b.busy).toBe(false);
  });

  it('provider belum dites → tolak dengan "Tes koneksi dulu.", tanpa panggilan', async () => {
    addFrames(1);

    act(() => api().b.startBatch());
    await flush();

    expect(api().b.notice).toBe(NEED_TEST_MSG);
    expect(calls).toBe(0);
  });

  it('sukses → slot terisi, status siap, error & catatan dibersihkan', async () => {
    addFrames(1);
    await ready();
    act(() => {
      api().s.failFrame(0, 'adobe', 'Batas kuota tercapai (429)');
      api().s.setNote(0, 'Menunggu limit reset (percobaan 2/5, ~15 dtk)');
    });
    script = [{ meta: { title: 'judul baru', keywords: ['kopi'] } }];

    act(() => api().b.startBatch());
    await flush();

    const f = api().s.frames[0];
    expect(f.status.adobe).toBe('siap');
    expect(f.error.adobe).toBe('');
    expect(f.metadata.adobe).toEqual({ title: 'judul baru', keywords: ['kopi'], category: '' });
    expect(api().s.notes[0]).toBeUndefined();
  });

  it('gagal → status gagal + pesan error asli, frame berikutnya tetap jalan, saran limit tampil', async () => {
    addFrames(2);
    await ready();
    script = [
      { err: new Error('Batas kuota tercapai (429)') },
      { meta: { title: 'oke' } }
    ];

    act(() => api().b.startBatch());
    await flush();

    expect(api().s.frames[0].status.adobe).toBe('gagal');
    expect(api().s.frames[0].error.adobe).toBe('Batas kuota tercapai (429)');
    expect(api().s.frames[1].status.adobe).toBe('siap');
    expect(api().b.progress).toEqual({ done: 1, failed: 1, total: 2 });
    expect(api().b.notice).toBe(LIMIT_TIP_MSG);
  });

  it('frame tanpa file asli → gagal dengan pesan upload ulang, batch tetap lanjut', async () => {
    addFrames(2);
    await ready();
    fileStore.delete(1);
    script = [{ meta: { title: 'isi' } }];        // adapter palsu harus mengisi slot → status siap

    act(() => api().b.startBatch());
    await flush();

    expect(api().s.frames[0].status.adobe).toBe('siap');
    expect(api().s.frames[1].status.adobe).toBe('gagal');
    expect(api().s.frames[1].error.adobe).toBe(MISSING_FILE_MSG);
    expect(api().b.summary).toMatchObject({ done: 1, failed: 1 });
  });

  it('batch berjalan → busy; startBatch kedua diabaikan (tak ada panggilan dobel)', async () => {
    addFrames(2);
    await ready();
    script = [{ pending: true }];

    act(() => api().b.startBatch());
    await flush();
    expect(api().b.busy).toBe(true);
    expect(api().s.frames[0].status.adobe).toBe('memproses');
    expect(api().b.currentId).toBe(0);

    act(() => api().b.startBatch());
    await flush();
    expect(calls).toBe(1);

    act(() => api().b.cancel());
    await flush();
    expect(api().b.busy).toBe(false);
  });
});

describe('useBatch — batalkan', () => {
  it('batal di tengah frame → frame aktif kembali menunggu, sisa tak disentuh', async () => {
    addFrames(2);
    await ready();
    script = [{ pending: true }, { meta: { title: 'x' } }];

    act(() => api().b.startBatch());
    await flush();
    expect(api().s.frames[0].status.adobe).toBe('memproses');

    act(() => api().b.cancel());
    await flush();

    expect(api().b.busy).toBe(false);
    expect(api().b.currentId).toBeNull();
    expect(api().s.frames[0].status.adobe).toBe('menunggu');
    expect(api().s.frames[0].error.adobe).toBe('');
    expect(api().s.frames[1].status.adobe).toBe('menunggu');
    expect(calls).toBe(1);                       // frame 2 tak pernah dipanggil
    expect(api().b.summary).toMatchObject({ cancelled: true, done: 0, skipped: 2, total: 2 });
    expect(api().b.progress).toEqual({ done: 0, failed: 0, total: 2 });
  });

  it('catatan limit dibersihkan saat frame dibatalkan', async () => {
    addFrames(1);
    await ready();
    script = [{ wait: { attempt: 1, maxAttempts: 5, waitMs: 15_000, reason: 'HTTP 429' }, pending: true }];

    act(() => api().b.startBatch());
    await flush();
    expect(api().s.notes[0]).toBe('Menunggu limit reset (percobaan 2/5, ~15 dtk)');

    act(() => api().b.cancel());
    await flush();
    expect(api().s.notes[0]).toBeUndefined();
  });
});

describe('useBatch — generate ulang satu frame', () => {
  it('slot berisi → minta konfirmasi dulu; konfirmasi kedua baru jalan', async () => {
    addFrames(1);
    await ready();
    act(() => api().s.applyGenerated(0, 'adobe', { title: 'isi lama' }));
    script = [{ meta: { title: 'hasil baru' } }];

    act(() => api().b.regenerateFrame(0));
    await flush();
    expect(api().b.regenConfirm).toBe(0);        // "Timpa hasil yang ada?"
    expect(calls).toBe(0);
    expect(api().s.frames[0].metadata.adobe?.title).toBe('isi lama');

    act(() => api().b.regenerateFrame(0));       // ya, timpa
    await flush();
    expect(api().b.regenConfirm).toBeNull();
    expect(calls).toBe(1);
    expect(api().s.frames[0].metadata.adobe?.title).toBe('hasil baru');
    expect(api().s.frames[0].status.adobe).toBe('siap');
  });

  it('konfirmasi bisa dibatalkan lewat dismissRegen', async () => {
    addFrames(1);
    await ready();
    act(() => api().s.applyGenerated(0, 'adobe', { title: 'isi lama' }));

    act(() => api().b.regenerateFrame(0));
    expect(api().b.regenConfirm).toBe(0);
    act(() => api().b.dismissRegen());
    expect(api().b.regenConfirm).toBeNull();
    expect(calls).toBe(0);
  });

  it('slot kosong → langsung jalan tanpa konfirmasi, hanya satu frame itu', async () => {
    addFrames(2);
    await ready();
    script = [{ meta: { title: 'hanya ini' } }];

    act(() => api().b.regenerateFrame(1));
    await flush();

    expect(api().b.regenConfirm).toBeNull();
    expect(calls).toBe(1);
    expect(api().s.frames[1].metadata.adobe?.title).toBe('hanya ini');
    expect(api().s.frames[0].status.adobe).toBe('menunggu');
  });
});
