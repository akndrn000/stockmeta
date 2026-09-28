// @vitest-environment jsdom
// Tes aksi useSession via harness React kecil (react-dom/client + act) — tanpa library tes UI.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fileStore } from '../lib/fileStore';
import { loadSession } from '../lib/storage';
import type { Frame } from '../lib/types';
import { useSession } from './useSession';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Holder ala ref: nilai terbaru hook dibaca lewat fungsi, bukan reassign variabel luar saat render.
const holderRef: { current?: ReturnType<typeof useSession> } = {};
function Harness() {
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru untuk dibaca tes
  holderRef.current = useSession();
  return createElement('div');
}
const api = () => holderRef.current as ReturnType<typeof useSession>;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  fileStore.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const blank = (name: string): Omit<Frame, 'id'> => ({
  name,
  thumb: '',
  tema: '',
  status: { adobe: 'menunggu', shutterstock: 'menunggu' },
  error: { adobe: '', shutterstock: '' },
  metadata: {}
});

describe('useSession — tambah frame', () => {
  it('id diambil dari seq, frame pertama otomatis terpilih, persist langsung', () => {
    let id0 = -1;
    let id1 = -1;
    act(() => {
      id0 = api().addFrame(blank('a.jpg'));
      id1 = api().addFrame(blank('b.jpg'));
    });
    expect([id0, id1]).toEqual([0, 1]);
    expect(api().seq).toBe(2);
    expect(api().frames.map((f) => f.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(api().sel).toBe(0);                    // pilihan TIDAK ikut berpindah
    expect(loadSession()?.imgs).toHaveLength(2);  // aksi struktural → langsung tersimpan
  });

  it('updateFrame mempatch thumb tanpa menyentuh field lain', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a.jpg')); });
    act(() => api().updateFrame(id, { thumb: 'data:image/jpeg;base64,QQ==' }));
    expect(api().frames[0].thumb).toBe('data:image/jpeg;base64,QQ==');
    expect(api().frames[0].name).toBe('a.jpg');
    expect(loadSession()?.imgs[0].thumb).toBe('data:image/jpeg;base64,QQ==');
  });
});

describe('useSession — hapus frame', () => {
  const three = () => {
    act(() => { api().addFrame(blank('a')); api().addFrame(blank('b')); api().addFrame(blank('c')); });
  };

  it('menghapus frame terpilih memilih tetangganya', () => {
    three();
    act(() => api().removeFrame(0));
    expect(api().frames.map((f) => f.name)).toEqual(['b', 'c']);
    expect(api().sel).toBe(1);
    act(() => api().removeFrame(1));
    expect(api().sel).toBe(2);
  });

  it('menghapus frame terakhir yang tersisa mengosongkan pilihan', () => {
    three();
    act(() => api().removeFrame(2));   // bukan yang terpilih → pilihan tetap 0
    expect(api().sel).toBe(0);
    act(() => api().removeFrame(0));
    act(() => api().removeFrame(1));
    expect(api().frames).toHaveLength(0);
    expect(api().sel).toBeNull();
    expect(loadSession()).toBeNull();  // sesi kosong → kunci dihapus
  });

  it('id yang tidak ada diabaikan', () => {
    three();
    act(() => api().removeFrame(99));
    expect(api().frames).toHaveLength(3);
  });

  it('menghapus frame ikut melepas file asli dari fileStore', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); fileStore.set(id, new File(['x'], 'a.jpg', { type: 'image/jpeg' })); });
    expect(fileStore.has(id)).toBe(true);
    act(() => api().removeFrame(id));
    expect(fileStore.has(id)).toBe(false);
  });
});

describe('useSession — pilih frame', () => {
  it('select mengubah frame aktif; select(null) mengosongkan', () => {
    act(() => { api().addFrame(blank('a')); api().addFrame(blank('b')); });
    act(() => api().select(1));
    expect(api().sel).toBe(1);
    act(() => api().select(null));
    expect(api().sel).toBeNull();
  });
});

describe('useSession — catatan sementara', () => {
  it('setNote terisi dan dibersihkan saat frame dihapus', () => {
    let id = -1;
    act(() => {
      id = api().addFrame(blank('a'));
      api().setNote(id, 'Menunggu limit reset (2/5, ~15 dtk)');
    });
    expect(api().notes[id]).toBe('Menunggu limit reset (2/5, ~15 dtk)');
    expect(loadSession()).not.toBeNull();
    act(() => api().removeFrame(id));
    expect(api().notes[id]).toBeUndefined();
  });
});

describe('useSession — edit metadata (M7)', () => {
  it('membuat slot default per platform saat pertama diisi', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().updateMetadata(id, 'adobe', { title: 'Kopi pagi' }));
    expect(api().frames[0].metadata.adobe).toEqual({ title: 'Kopi pagi', keywords: [], category: '' });

    act(() => api().updateMetadata(id, 'shutterstock', { description: 'Secangkir kopi hangat.' }));
    expect(api().frames[0].metadata.shutterstock).toEqual({ description: 'Secangkir kopi hangat.', keywords: [], categories: [] });
    expect(api().frames[0].metadata.adobe).toEqual({ title: 'Kopi pagi', keywords: [], category: '' }); // tak tersentuh
  });

  it('status platform lain tidak ikut berubah', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().updateMetadata(id, 'adobe', { title: 'Judul' }));
    expect(api().frames[0].status).toEqual({ adobe: 'siap', shutterstock: 'menunggu' });
    act(() => api().updateMetadata(id, 'shutterstock', { keywords: ['kopi'] }));
    expect(api().frames[0].status).toEqual({ adobe: 'siap', shutterstock: 'siap' });
    expect(api().frames[0].metadata.adobe?.title).toBe('Judul');
  });

  it('ada isi → status siap + error dibersihkan; dikosongkan → kembali menunggu', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().updateFrame(id, { status: { ...api().frames[0].status, adobe: 'gagal' }, error: { ...api().frames[0].error, adobe: 'Galat' } }));
    act(() => api().updateMetadata(id, 'adobe', { title: 'X' }));
    expect(api().frames[0].status.adobe).toBe('siap');
    expect(api().frames[0].error.adobe).toBe('');

    act(() => api().updateMetadata(id, 'adobe', { title: '' }));
    expect(api().frames[0].status.adobe).toBe('menunggu');   // slot kosong → kontrak 'menunggu'
    expect(api().frames[0].metadata.adobe).toEqual({ title: '', keywords: [], category: '' });
  });

  it('dikosongkan saat status gagal → tetap gagal (pesan error dipertahankan)', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().updateMetadata(id, 'adobe', { title: 'Isi', keywords: ['x'] }));
    act(() => api().failFrame(id, 'adobe', 'HTTP 500'));
    expect(api().frames[0].status.adobe).toBe('gagal');

    act(() => api().updateMetadata(id, 'adobe', { title: '', keywords: [] }));
    expect(api().frames[0].status.adobe).toBe('gagal');
    expect(api().frames[0].error.adobe).toBe('HTTP 500');
  });

  it('edit metadata persist dengan debounce (bukan langsung)', async () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().updateMetadata(id, 'adobe', { title: 'Tertunda' }));
    expect(loadSession()?.imgs[0].metadata?.adobe).toBeUndefined();   // belum tersimpan
    await new Promise((r) => setTimeout(r, 550));
    expect(loadSession()?.imgs[0].metadata?.adobe).toEqual({ title: 'Tertunda', keywords: [], category: '' });
  });
});

describe('useSession — tema per frame (M7)', () => {
  it('setFrameTema override per frame; undefined menghapus kembali', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().setFrameTema(id, 'warna hangat'));
    expect(api().frames[0].tema).toBe('warna hangat');
    expect(api().frames[0].tema).not.toBe(api().tema);
    act(() => api().setFrameTema(id, undefined));
    expect(api().frames[0].tema).toBe('');
    act(() => api().setFrameTema(99, 'abaikan'));   // id tak ada → tak berubah
    expect(api().frames[0].tema).toBe('');
  });
});

describe('useSession — sesi baru', () => {
  it('mengosongkan frame/tema dan menghapus kunci sesi, TANPA menyentuh API key', () => {
    localStorage.setItem('stockmeta_gemini_key', 'kunci-rahasia');
    localStorage.setItem('stockmeta_groq_key', 'groq-rahasia');
    act(() => { api().addFrame(blank('a')); api().select(0); });
    expect(loadSession()).not.toBeNull();

    act(() => api().newSession());

    expect(api().frames).toHaveLength(0);
    expect(api().sel).toBeNull();
    expect(api().seq).toBe(0);
    expect(api().notes).toEqual({});
    expect(loadSession()).toBeNull();
    expect(localStorage.getItem('stockmeta_gemini_key')).toBe('kunci-rahasia');
    expect(localStorage.getItem('stockmeta_groq_key')).toBe('groq-rahasia');
  });
});

describe('useSession — hasil generate (M8)', () => {
  it('applyGenerated: merge field terisi, status siap, error dibersihkan, persist langsung', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().failFrame(id, 'adobe', 'HTTP 429'));
    expect(api().frames[0].status.adobe).toBe('gagal');

    act(() => api().applyGenerated(id, 'adobe', { title: 'Judul baru', keywords: ['kopi', 'pagi'] }));
    const f = api().frames[0];
    expect(f.metadata.adobe).toEqual({ title: 'Judul baru', keywords: ['kopi', 'pagi'], category: '' });
    expect(f.status.adobe).toBe('siap');
    expect(f.error.adobe).toBe('');
    expect(loadSession()?.imgs[0].metadata?.adobe?.title).toBe('Judul baru');   // tanpa debounce
  });

  it('applyGenerated: judul/deskripsi manual TIDAK ditimpa hasil kosong', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().updateMetadata(id, 'adobe', { title: 'Hasil manual', keywords: ['satu'] }));
    act(() => api().applyGenerated(id, 'adobe', { keywords: [] }));
    expect(api().frames[0].metadata.adobe).toEqual({ title: 'Hasil manual', keywords: [], category: '' });

    act(() => api().updateMetadata(id, 'shutterstock', { description: 'Deskripsi manual' }));
    act(() => api().applyGenerated(id, 'shutterstock', { description: '' }));
    expect(api().frames[0].metadata.shutterstock?.description).toBe('Deskripsi manual');
  });

  it('applyGenerated: hasil kosong ke slot kosong → status menunggu (bukan siap)', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().applyGenerated(id, 'adobe', {}));           // model tak mengembalikan apa pun
    const f = api().frames[0];
    expect(f.status.adobe).toBe('menunggu');                    // kontrak: slot kosong → menunggu
    expect(f.error.adobe).toBe('');
    expect(f.metadata.adobe).toEqual({ title: '', keywords: [], category: '' });

    act(() => api().applyGenerated(id, 'adobe', { title: 'Baru' }));
    expect(api().frames[0].status.adobe).toBe('siap');          // ada isi → siap lagi
  });

  it('applyGenerated: category Shutterstock → [nama]; platform lain tak tersentuh', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().applyGenerated(id, 'adobe', { title: 'Adobe punya', category: 'Makanan' }));
    act(() => api().applyGenerated(id, 'shutterstock', { description: 'Kalimat.', category: 'Fashion' }));

    const f = api().frames[0];
    expect(f.metadata.shutterstock).toEqual({ description: 'Kalimat.', keywords: [], categories: ['Fashion'] });
    expect(f.metadata.adobe).toEqual({ title: 'Adobe punya', keywords: [], category: 'Makanan' });
    expect(f.status).toEqual({ adobe: 'siap', shutterstock: 'siap' });
  });

  it('failFrame: status gagal + pesan untuk platform itu saja, slot tidak diubah', () => {
    let id = -1;
    act(() => { id = api().addFrame(blank('a')); });
    act(() => api().applyGenerated(id, 'adobe', { title: 'Aman' }));

    act(() => api().failFrame(id, 'shutterstock', 'Tidak ada koneksi ke server Groq.'));
    const f = api().frames[0];
    expect(f.status).toEqual({ adobe: 'siap', shutterstock: 'gagal' });
    expect(f.error.shutterstock).toBe('Tidak ada koneksi ke server Groq.');
    expect(f.error.adobe).toBe('');
    expect(f.metadata.adobe?.title).toBe('Aman');

    act(() => api().failFrame(99, 'adobe', 'id tak ada'));   // id tak ada → diabaikan
    expect(api().frames[0].status.adobe).toBe('siap');
  });

  it('snapshot: membaca frame terbaru setelah aksi beruntun (tidak basi)', () => {
    act(() => { api().addFrame(blank('a')); api().addFrame(blank('b')); });
    expect(api().snapshot().frames.map((f) => f.name)).toEqual(['a', 'b']);
    act(() => api().removeFrame(0));
    expect(api().snapshot().frames.map((f) => f.name)).toEqual(['b']);
    expect(api().snapshot().sel).toBe(1);     // frame terpilih (0) dihapus → pindah ke tetangganya
  });
});
