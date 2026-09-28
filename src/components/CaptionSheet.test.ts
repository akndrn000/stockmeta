// @vitest-environment jsdom
// Tes CaptionSheet (perbaikan M8): meta header memakai posisi terpilih / jumlah frame sesi,
// "Saran perbaikan" hanya muncul kalau slot platform aktif berisi — tanpa testing-library.
// M13: lembar ini tidak lagi punya aksi "buat ulang" (pindah ke tile Worksheet): kotak error
// frame gagal tetap, tombol/konfirmasi "Timpa hasil yang ada?" tidak ada di sini.
// Audit F2: footer menghitung baris yang benar-benar diekspor.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../hooks/useSession';
import type { Frame } from '../lib/types';
import { CaptionSheet } from './CaptionSheet';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const holderRef: {
  current?: {
    s: ReturnType<typeof useSession>;
  };
} = {};
function Harness() {
  const s = useSession();
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = { s };
  return createElement(CaptionSheet, { session: s });
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
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

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

describe('CaptionSheet — keadaan kosong (M13)', () => {
  it('judul terpisah dari penjelasan + ikon garis (bukan emoji)', () => {
    addFrames(1);
    act(() => api().s.select(null));
    expect(text()).toContain('Belum ada frame dipilih');
    expect(text()).toContain('Pilih frame di lembar kerja untuk mengedit caption-nya.');
    const svg = host.querySelector('#caption-body svg');
    expect(svg).not.toBeNull();
    expect(svg!.querySelector('path')).not.toBeNull();
    expect(text()).not.toContain('Belum ada frame dipilih —');   // teks lama digabung
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

  it('frame gagal tanpa isi → kotak error lengkap tampil, saran disembunyikan', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.failFrame(id, 'adobe', 'HTTP 500 — server error');
    });
    expect(text()).toContain('HTTP 500 — server error');
    expect(text()).not.toContain('Saran perbaikan');
  });
});

describe('CaptionSheet — aksi "buat ulang" pindah ke tile (M13)', () => {
  it('frame gagal: pesan error tetap, tanpa tombol & tanpa konfirmasi Timpa', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.failFrame(id, 'adobe', 'HTTP 500 — server error');
    });
    expect(text()).toContain('HTTP 500 — server error');
    expect(findBtn('Buat ulang frame ini')).toBeNull();
    expect(text()).not.toContain('Timpa hasil yang ada?');
    expect(host.querySelector('[aria-label^="Buat ulang metadata"]')).toBeNull();
  });

  it('frame siap: tidak ada strip aksi di lembar caption', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyGenerated(id, 'adobe', { title: 'isi lama' });
    });
    expect(text()).not.toContain('Timpa hasil yang ada?');
    expect(findBtn('Buat ulang frame ini')).toBeNull();
    expect(host.querySelector('[aria-label^="Buat ulang metadata"]')).toBeNull();
  });
});

describe('CaptionSheet — kotak "siap tempel" dihapus (M12)', () => {
  it('tanpa textarea mirror; salin daftar kata kunci tetap ada di label "Kata kunci"', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.updateMetadata(id, 'adobe', { title: 'Judul', keywords: ['kopi', 'teh'], category: 'Animals' });
    });
    expect(host.querySelector('#kw-plain')).toBeNull();
    expect(text()).not.toContain('siap tempel');
    expect(host.querySelector('[aria-label="Salin daftar kata kunci"]')).not.toBeNull();
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

describe('CaptionSheet — keterangan bantu menempel di dalam kotak (M13)', () => {
  it('penghitung judul & deskripsi berada di dalam textarea, bukan baris terpisah', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.updateMetadata(id, 'adobe', { title: 'Judul pendek' });
    });
    const note = host.querySelector('#caption-title + span');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('/70');
    expect(note!.className).toContain('pointer-events-none');   // tidak menutup klik textarea
    expect(text()).not.toContain('maks 70 karakter');           // baris hint lama hilang
  });
});
