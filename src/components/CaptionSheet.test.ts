// @vitest-environment jsdom
// Tes CaptionSheet (perbaikan M8): meta header memakai posisi terpilih / jumlah frame sesi,
// "Saran perbaikan" hanya muncul kalau slot platform aktif berisi — tanpa testing-library.
// M13: lembar ini tidak lagi punya aksi "buat ulang" (pindah ke tile Worksheet): kotak error
// frame gagal tetap, tombol/konfirmasi "Timpa hasil yang ada?" tidak ada di sini.
// M14: tidak ada kotak kosong — struktur field selalu dirender dan nonaktif sampai ada frame.
// Audit F2: footer menghitung baris yang benar-benar diekspor.
// M18: penghitung judul/deskripsi/kata kunci sebaris dengan LABEL (di atas kotak isian),
// bukan menempel di dalam kotak (posisi M13) — ruang cadangan pb-6/pr-24 ikut dihapus.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../hooks/useSession';
import { MAX_DESCRIPTION, MAX_FRAMES, MAX_KEYWORDS } from '../lib/limits';
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
    expect(text()).not.toContain(`/ ${MAX_FRAMES}`);
  });

  it('belum ada frame terpilih → Frame -- / total sesi', () => {
    addFrames(2);
    act(() => api().s.select(null));
    expect(text()).toContain('Frame -- / 02');
  });
});

describe('CaptionSheet — struktur field tetap ada walau belum ada frame (M14)', () => {
  it('tanpa frame: seluruh field dirender, kosong, nonaktif, placeholder tetap', () => {
    // default platform Adobe → Judul, Kata kunci, Kategori, Tema (semua tanpa frame)
    expect(text()).not.toContain('Belum ada frame dipilih');      // kotak kosong M13 dihapus
    expect(text()).toContain('Judul');
    expect(text()).toContain('Kata kunci');
    expect(text()).toContain('Kategori');
    expect(text()).toContain('Tema untuk frame ini (opsional)');

    const ta = host.querySelector('#caption-title') as HTMLTextAreaElement;
    expect(ta).not.toBeNull();
    expect(ta.disabled).toBe(true);
    expect(ta.value).toBe('');
    expect(ta.placeholder).toBe('Judul menjual, spesifik, tanpa frasa generik');

    const kw = host.querySelector('#kw-input') as HTMLInputElement;
    expect(kw.disabled).toBe(true);

    const cat = host.querySelector('#caption-category') as HTMLSelectElement;
    expect(cat.disabled).toBe(true);
    expect(cat.value).toBe('');
    expect(cat.querySelector('option[value=""]')!.textContent).toBe('— pilih kategori —');

    const tema = host.querySelector('#caption-tema') as HTMLInputElement;
    expect(tema.disabled).toBe(true);
    expect(tema.value).toBe('');

    // tombol salin tiap field ikut nonaktif
    expect(host.querySelector('[aria-label="Salin Judul"]')!.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('[aria-label="Salin Kategori"]')!.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('[aria-label="Salin daftar kata kunci"]')!.hasAttribute('disabled')).toBe(true);
    expect(text()).not.toContain('Saran perbaikan');              // relevan = slot berisi saja
  });

  it('header placeholder wajar + Export CSV nonaktif dengan alasan yang bisa diklik-balik', () => {
    expect(text()).toContain('Frame -- / --');                    // 0 frame → bukan "00"

    const createObjectURL = vi.fn(() => 'blob:mock');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true, writable: true, value: createObjectURL
    });

    let csv = findBtn('Export CSV')!;
    expect(csv.getAttribute('aria-disabled')).toBe('true');
    expect(csv.title).toContain('Belum ada frame');
    act(() => { csv.click(); });
    expect(createObjectURL).not.toHaveBeenCalled();               // di-guard

    addFrames(1);                                                 // auto terpilih, slot masih kosong
    csv = findBtn('Export CSV')!;
    expect(csv.getAttribute('aria-disabled')).toBe('true');
    expect(csv.title).toContain('Belum ada metadata');
    act(() => { csv.click(); });
    expect(createObjectURL).not.toHaveBeenCalled();               // tanpa guard ini akan mengunduh
  });

  it('begitu ada frame terpilih (otomatis setelah upload), field aktif berisi datanya', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.updateMetadata(id, 'adobe', { title: 'Judul terisi', category: 'Animals' });
    });
    expect(text()).toContain(`Frame 01 / 01`);

    const ta = host.querySelector('#caption-title') as HTMLTextAreaElement;
    expect(ta.disabled).toBe(false);
    expect(ta.value).toBe('Judul terisi');

    const cat = host.querySelector('#caption-category') as HTMLSelectElement;
    expect(cat.disabled).toBe(false);
    expect(cat.value).toBe('Animals');

    expect(host.querySelector('[aria-label="Salin Judul"]')!.hasAttribute('disabled')).toBe(false);

    const csv = findBtn('Export CSV')!;
    expect(csv.getAttribute('aria-disabled')).toBeNull();         // slot berisi → ekspor aktif
    expect(csv.title).toContain('Ekspor metadata');
  });

  it('frame terpilih tapi belum digenerate → field aktif, Export CSV tetap nonaktif', () => {
    addFrames(1);
    expect((host.querySelector('#caption-title') as HTMLTextAreaElement).disabled).toBe(false);
    const csv = findBtn('Export CSV')!;
    expect(csv.getAttribute('aria-disabled')).toBe('true');
    expect(csv.title).toContain('Belum ada metadata');
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

describe('CaptionSheet — keterangan sebaris dengan label (M18)', () => {
  it('penghitung judul pindah ke baris label (di atas textarea), ruang dalam kotak dihapus', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.updateMetadata(id, 'adobe', { title: 'Judul pendek' });
    });
    const ta = host.querySelector('#caption-title') as HTMLTextAreaElement;
    const note = host.querySelector('#caption-title-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('/70');
    // M18: keterangan berada di baris label, sebelum kotak isian — bukan menempel di dalamnya
    expect(ta.previousElementSibling!.contains(note!)).toBe(true);
    expect(note!.className).not.toContain('absolute');             // keluar dari posisi menempel
    expect(ta.className).not.toContain('pb-6');                    // ruang cadangan dihapus
    expect(text()).not.toContain('maks 70 karakter');              // baris hint lama tetap hilang
  });

  it('tombol salin tetap sebaris dengan label & penghitung', () => {
    addFrames(1);
    const row = host.querySelector('label[for="caption-title"]')!.parentElement!;
    expect(row.querySelector('#caption-title-note')).not.toBeNull();
    expect(row.querySelector('[aria-label="Salin Judul"]')).not.toBeNull();
  });

  it('deskripsi (Shutterstock): penghitung n/maks juga naik ke baris label', () => {
    const [id] = addFrames(1);
    const desc = 'Dua kalimat.';
    act(() => {
      api().s.select(id);
      api().s.setPlatform('shutterstock');
      api().s.updateMetadata(id, 'shutterstock', { description: desc });
    });
    const ta = host.querySelector('#caption-desc') as HTMLTextAreaElement;
    const note = host.querySelector('#caption-desc-note');
    expect(note).not.toBeNull();
    expect(note!.textContent).toBe(`${desc.length}/${MAX_DESCRIPTION}`);
    expect(ta.previousElementSibling!.contains(note!)).toBe(true);
    expect(ta.className).not.toContain('pb-6');
    expect(ta.getAttribute('aria-describedby')).toBe('caption-desc-note');
  });

  it('penghitung kata kunci juga keluar dari kotak input (M18)', () => {
    addFrames(1);
    const kw = host.querySelector('#kw-input') as HTMLInputElement;
    const count = host.querySelector('#kw-count');
    const labelRow = host.querySelector('label[for="kw-input"]')!.parentElement!;
    expect(count).not.toBeNull();
    expect(count!.textContent).toContain(`0/${MAX_KEYWORDS}`);
    expect(kw.getAttribute('aria-describedby')).toBe('kw-count');       // tetap terhubung utk pembaca layar
    expect(kw.className).not.toContain('pr-24');                        // ruang cadangan dihapus
    expect(labelRow.contains(count!)).toBe(true);                       // penghitung sebaris dengan label
    expect(labelRow.querySelector('[aria-label="Salin daftar kata kunci"]')).not.toBeNull();
  });
});
