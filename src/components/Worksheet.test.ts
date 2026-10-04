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
import { groq } from '../lib/providers/groq';
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
  label: 'Gemini',
  supportsVision: true,
  testConnection: async () => ({ ok: true }),
  callText: async () => '{}',
  callJudge: async () => ({
    verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
    category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
  }),
  analyzeImage: async () => ({ verdict: 'layak', issues: [], summary: '' }),
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
  metadata: {},
  // M29: frame tes dianggap sudah dianalisis supaya lolos gerbang metadata
  analysisStatus: { adobe: 'siap', shutterstock: 'siap' }
});

const RETRY = 'Coba lagi frame gagal';
const REGEN_ALL = 'Buat ulang semua';
const REGEN_PREFIX = 'Buat ulang metadata untuk';
const findBtn = (label: string) =>
  Array.from(host.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) ?? null;
const regenBtn = (name: string) =>
  Array.from(host.querySelectorAll('button')).find(
    (b) => b.getAttribute('aria-label') === `${REGEN_PREFIX} ${name}`
  ) ?? null;
const delaySelect = () => host.querySelector('#jeda-antar-foto') as HTMLSelectElement;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear();
  fileStore.clear();
  script = [];
  calls = 0;
  registry.gemini = fakeAdapter;
  registry.groq = fakeAdapter;                    // default provider kini Groq (M11)
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

  it('M11: tetap tampil setelah pindah-pindah frame & ganti platform lalu kembali', async () => {
    const ids = addFrames(2);
    await ready();
    act(() => {
      api().s.failFrame(ids[1], 'adobe', 'HTTP 500');
      api().s.select(ids[0]);
      api().s.select(ids[1]);
      api().s.select(ids[0]);
    });
    expect(findBtn(RETRY)).not.toBeNull();

    act(() => api().s.setPlatform('shutterstock'));   // platform tanpa gagal → hilang
    expect(findBtn(RETRY)).toBeNull();

    act(() => api().s.setPlatform('adobe'));          // kembali → tampil lagi
    expect(findBtn(RETRY)).not.toBeNull();
  });
});

describe('tombol "Buat ulang semua" (M11)', () => {
  it('tampil hanya bila ada frame siap/gagal; konfirmasi inline sebelum menimpa', async () => {
    const ids = addFrames(2);
    await ready();
    expect(findBtn(REGEN_ALL)).toBeNull();            // semua menunggu → tercakup "Buat metadata"

    act(() => api().s.applyGenerated(ids[0], 'adobe', { title: 'isi lama' }));
    expect(findBtn(REGEN_ALL)).not.toBeNull();

    script = [{ meta: { title: 'baru 1' } }, { meta: { title: 'baru 2' } }];
    act(() => { findBtn(REGEN_ALL)!.click(); });
    await flush();
    expect(calls).toBe(0);                            // klik pertama = konfirmasi saja
    expect(host.textContent).toContain('Ganti semua hasil yang sudah ada?');
    expect(api().s.frames[0].metadata.adobe?.title).toBe('isi lama');

    act(() => { findBtn('Ya, ganti semua')!.click(); });
    await flush();
    expect(calls).toBe(2);                            // SEMUA frame, termasuk yang sudah siap
    expect(api().s.frames[0].metadata.adobe?.title).toBe('baru 1');
    expect(api().s.frames[1].metadata.adobe?.title).toBe('baru 2');
    expect(host.textContent).not.toContain('Ganti semua hasil yang sudah ada?');
  });

  it('batal dari konfirmasi → tidak ada panggilan API', async () => {
    const ids = addFrames(1);
    await ready();
    act(() => api().s.applyGenerated(ids[0], 'adobe', { title: 'isi lama' }));

    act(() => { findBtn(REGEN_ALL)!.click(); });
    await flush();
    act(() => { findBtn('Batal')!.click(); });
    await flush();

    expect(calls).toBe(0);
    expect(host.textContent).not.toContain('Ganti semua hasil yang sudah ada?');
    expect(findBtn(REGEN_ALL)).not.toBeNull();
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

describe('keterangan bantu dihapus (M14)', () => {
  it('Tema utama & Jeda antar foto tidak lagi punya baris penjelasan di bawahnya', () => {
    expect(host.textContent).toContain('Tema utama (opsional)');
    expect(host.textContent).toContain('Jeda antar foto');
    expect(host.textContent).not.toContain('Berlaku untuk seluruh batch');
    expect(host.textContent).not.toContain('Naikkan jika sering muncul');
  });

  it('grid thumbnail: auto-fill minmax intrinsik, tanpa kolom per breakpoint (M19)', () => {
    addFrames(2);
    const grid = host.querySelector('ul.grid');
    expect(grid).not.toBeNull();
    expect(grid!.className).toContain('minmax(7.5rem,1fr)');   // 120px — aman dari tabrakan badge
    expect(grid!.className).not.toContain('grid-cols-5');        // kolom kini ikut lebar kartu
    expect(grid!.className).not.toContain('lg:grid-cols-5');
  });
});

describe('ikon "buat ulang" di tile (M13)', () => {
  it('setiap tile punya ikon ber-aria-label, termasuk frame menunggu', () => {
    const ids = addFrames(2);
    expect(regenBtn('f0.jpg')).not.toBeNull();
    expect(regenBtn('f1.jpg')).not.toBeNull();
    expect(regenBtn('f0.jpg')!.getAttribute('aria-label')).toBe('Buat ulang metadata untuk f0.jpg');
    expect(api().s.frames.find((f) => f.id === ids[0])!.status.adobe).toBe('menunggu');
    expect(regenBtn('f0.jpg')!.className).not.toContain('text-error');  // netral, bukan status gagal
  });

  it('frame gagal → ikon memakai aksen merah (aksi yang disarankan)', () => {
    const ids = addFrames(1);
    act(() => api().s.failFrame(ids[0], 'adobe', 'HTTP 500'));
    expect(regenBtn('f0.jpg')!.className).toContain('text-error');
  });

  it('aria-disabled + alasan di title: provider belum siap, file hilang, batch berjalan', async () => {
    addFrames(1);
    expect(regenBtn('f0.jpg')!.getAttribute('aria-disabled')).toBe('true');  // status masih 'idle'
    expect(regenBtn('f0.jpg')!.title).toBe('Tes koneksi provider dulu.');

    await ready();
    expect(regenBtn('f0.jpg')!.getAttribute('aria-disabled')).toBeNull();    // ada file + provider ok

    act(() => api().s.addFrame(blank('tanpa-file.jpg')));      // file sengaja tidak diset
    expect(regenBtn('tanpa-file.jpg')!.getAttribute('aria-disabled')).toBe('true');
    expect(regenBtn('tanpa-file.jpg')!.title).toContain('File asli hilang');

    act(() => { regenBtn('tanpa-file.jpg')!.click(); });       // guard: aria-disabled ≠ klik jalan
    await flush();
    expect(api().b.summary).toBeNull();                        // tidak ada batch yang dijalankan
    expect(api().s.frames[1].status.adobe).toBe('menunggu');

    script = [{ pending: true }];
    act(() => api().b.startBatch());
    await flush();
    expect(regenBtn('f0.jpg')!.title).toBe('Batch sedang berjalan — tunggu selesai.');
    act(() => api().b.cancel());
    await flush();
  });

  it('frame siap: klik → konfirmasi "Timpa hasil yang ada?" di dekat tile, lalu jalankan', async () => {
    const ids = addFrames(1);
    await ready();
    act(() => api().s.applyGenerated(ids[0], 'adobe', { title: 'isi lama' }));

    act(() => { regenBtn('f0.jpg')!.click(); });
    expect(host.textContent).toContain('Timpa hasil yang ada?');
    expect(calls).toBe(0);                                   // klik pertama = konfirmasi saja

    act(() => { findBtn('Batal')!.click(); });               // batal → popover hilang
    expect(host.textContent).not.toContain('Timpa hasil yang ada?');
    expect(calls).toBe(0);

    script = [{ meta: { title: 'baru' } }];
    act(() => { regenBtn('f0.jpg')!.click(); });             // buka lagi
    act(() => { findBtn('Ya, timpa')!.click(); });
    await flush();
    expect(calls).toBe(1);
    expect(api().s.frames[0].metadata.adobe?.title).toBe('baru');
    expect(host.textContent).not.toContain('Timpa hasil yang ada?');
  });

  it('frame tanpa isi (menunggu) → langsung generate, tanpa konfirmasi', async () => {
    addFrames(1);
    await ready();
    script = [{ meta: { title: 'hasil pertama' } }];

    act(() => { regenBtn('f0.jpg')!.click(); });
    await flush();
    expect(calls).toBe(1);
    expect(host.textContent).not.toContain('Timpa hasil yang ada?');
    expect(api().s.frames[0].metadata.adobe?.title).toBe('hasil pertama');
  });
});
