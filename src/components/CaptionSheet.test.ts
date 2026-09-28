// @vitest-environment jsdom
// Tes CaptionSheet (perbaikan M8): meta header memakai posisi terpilih / jumlah frame sesi,
// "Saran perbaikan" hanya muncul kalau slot platform aktif berisi — tanpa testing-library.
// Audit A2/F2: tombol "Buat ulang frame ini" juga tampil untuk frame siap (dengan konfirmasi
// Timpa), dan footer menghitung baris yang benar-benar diekspor.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBatch } from '../hooks/useBatch';
import { useProvider } from '../hooks/useProvider';
import { useSession } from '../hooks/useSession';
import { fileStore } from '../lib/fileStore';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import type { ProviderAdapter } from '../lib/providers/types';
import type { Frame } from '../lib/types';
import { CaptionSheet } from './CaptionSheet';

// prepareImage asli butuh canvas/FileReader — jalur "Buat ulang" di tes memakai stub.
vi.mock('../lib/image', () => ({
  prepareImage: async (file: File) => ({ base64: 'stub', mimeType: file.type || 'image/jpeg' }),
  makeThumbnail: async () => ''
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// adapter palsu untuk tes koneksi (tanpa jaringan) — cukup testConnection untuk jalur konfirmasi
const fakeAdapter: ProviderAdapter = {
  id: 'gemini',
  testConnection: async () => ({ ok: true, model: 'fake-model' }),
  generateForImage: async () => ({ title: 'hasil baru' })
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
  return createElement(CaptionSheet, { session: s, provider: p, batch: b });
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

async function ready() {
  act(() => api().p.setKey('kunci-rahasia'));
  await act(async () => { await api().p.test(); });
  expect(api().p.status).toBe('ok');
}

function addFrames(n: number): number[] {
  const ids: number[] = [];
  act(() => {
    for (let i = 0; i < n; i++) ids.push(api().s.addFrame(blank(`f${i}.jpg`)));
  });
  return ids;
}

describe('CaptionSheet — meta header', () => {
  it('Frame posisi terpilih / jumlah frame sesi, bukan MAX_FRAMES', () => {
    const [id] = addFrames(3);
    act(() => api().s.select(id));
    expect(text()).toContain('Frame 01 / 03');
    expect(text()).not.toContain('/ 10');
  });

  it('belum ada frame terpilih → Frame -- / total sesi', () => {
    addFrames(2);
    act(() => api().s.select(null));
    expect(text()).toContain('Frame -- / 02');
  });
});

describe('CaptionSheet — saran perbaikan', () => {
  it('slot kosong (menunggu) → tanpa saran', () => {
    const [id] = addFrames(1);
    act(() => api().s.select(id));
    expect(text()).not.toContain('Saran perbaikan');
  });

  it('slot berisi → saran validasi tampil + hitung baris bersaran di footer', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyGenerated(id, 'adobe', { title: 'Judul contoh' });
    });
    expect(text()).toContain('Saran perbaikan');
    expect(text()).toContain('Kata kunci minimal 5 (baru 0).');
    expect(text()).toContain('1 baris punya saran perbaikan');
  });

  it('frame gagal tanpa isi → kotak error tampil, saran tetap disembunyikan', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.failFrame(id, 'adobe', 'HTTP 500 — server error');
    });
    expect(text()).toContain('HTTP 500 — server error');
    expect(text()).toContain('Buat ulang frame ini');
    expect(text()).not.toContain('Saran perbaikan');
  });
});

describe('CaptionSheet — footer jumlah baris ekspor (F2)', () => {
  it('menampilkan jumlah slot berisi, bukan jumlah frame', () => {
    const ids = addFrames(2);
    act(() => {
      api().s.select(ids[0]);
      api().s.applyGenerated(ids[0], 'adobe', {
        title: 'Judul contoh',
        keywords: ['a', 'b', 'c', 'd', 'e'],
        category: 'Animals'
      });
    });
    expect(text()).toContain('1 baris');            // hanya 1 slot berisi yang diekspor
    expect(text()).not.toContain('2 baris');        // bukan jumlah frame
    expect(text()).not.toContain('punya saran');    // tanpa saran → hanya footer
  });
});

describe('CaptionSheet — Buat ulang frame siap (A2)', () => {
  it('frame siap → strip aksi dengan tombol; klik pertama minta konfirmasi Timpa', async () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyGenerated(id, 'adobe', { title: 'isi lama' });
      fileStore.set(id, new File(['x'], 'f0.jpg', { type: 'image/jpeg' }));
    });
    await ready();

    expect(text()).not.toContain('HTTP');           // bukan kotak error
    const btn = findBtn('Buat ulang frame ini');
    expect(btn).not.toBeNull();

    act(() => { btn!.click(); });
    expect(text()).toContain('Timpa hasil yang ada?');
    expect(findBtn('Ya, timpa')).not.toBeNull();

    act(() => { findBtn('Ya, timpa')!.click(); });  // konfirmasi → jalankan
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(api().s.frames[0].metadata.adobe?.title).toBe('hasil baru');
    expect(api().s.frames[0].status.adobe).toBe('siap');
    expect(text()).not.toContain('Timpa hasil yang ada?');   // konfirmasi selesai
  });

  it('frame siap tanpa file asli → tombol nonaktif + alasan upload ulang', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyGenerated(id, 'adobe', { title: 'isi lama' });
    });                                             // file sengaja tidak diset
    const btn = findBtn('Buat ulang frame ini');
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain('File asli hilang setelah sesi di-restore');
  });
});
