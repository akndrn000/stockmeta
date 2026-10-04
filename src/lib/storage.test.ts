import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BATCH_DELAY_DEFAULT_SEC } from './limits';
import { loadSession, readBatchDelay, readKey, readMode, readProvider, readProviderForMode, readTheme, removeSession, saveSession, writeBatchDelay, writeKey, writeMode, writeProvider, writeProviderForMode, writeTheme } from './storage';
import type { StoredSession } from './storage';
import type { Frame } from './types';

// fake localStorage in-memory; opts.quota = gagal saat nilai masih memuat thumbnail
function fakeStorage(opts: { quota?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (opts.quota && v.includes('"thumb":"data:')) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    removeItem: (k: string) => { map.delete(k); },
    dump: () => map
  };
}

const frame = (over: Partial<Frame> = {}): Frame => ({
  id: 1, name: 'foto.jpg', thumb: 'data:image/jpeg;base64,QQ==', tema: '',
  status: { adobe: 'siap', shutterstock: 'menunggu' },
  error: { adobe: '', shutterstock: '' },
  metadata: { adobe: { title: 'Judul', keywords: ['kucing'], category: 'Animals' } },
  ...over
});

const session = (over: Partial<StoredSession> = {}): StoredSession => ({
  v: 1, ts: 123, platform: 'adobe', sel: 1, seq: 3, tema: 'Halloween', imgs: [frame()], ...over
});

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal('localStorage', store);
});
afterEach(() => vi.unstubAllGlobals());

describe('API key', () => {
  it('roundtrip per provider, provider asing → ""', () => {
    writeKey('gemini', 'abc');
    writeKey('openrouter', 'x');
    expect(readKey('gemini')).toBe('abc');
    expect(readKey('groq')).toBe('');
    expect(readKey('openrouter')).toBe('x');
  });

  it('groq tidak mengubah key gemini', () => {
    writeKey('gemini', 'abc');
    writeKey('groq', 'def');
    expect(readKey('gemini')).toBe('abc');
    expect(readKey('groq')).toBe('def');
  });
});

describe('pilihan provider (M11)', () => {
  it('belum pernah memilih → null (pemanggil memakai default Groq)', () => {
    expect(readProvider()).toBeNull();
  });

  it('roundtrip nilai valid; nilai tak sah → null', () => {
    writeProvider('gemini');
    expect(readProvider()).toBe('gemini');
    writeProvider('groq');
    expect(readProvider()).toBe('groq');
    writeProvider('openrouter');
    expect(readProvider()).toBe('openrouter');
    store.setItem('stockmeta_provider', 'nvidia');
    expect(readProvider()).toBeNull();
  });

  it("nilai lama 'custom'/'coming-soon' yang sudah dihapus → null", () => {
    store.setItem('stockmeta_provider', 'custom');
    expect(readProvider()).toBeNull();
    store.setItem('stockmeta_provider', 'coming-soon');
    expect(readProvider()).toBeNull();
  });
});

describe('pilihan provider per mode (analisis vs metadata)', () => {
  it('belum pernah memilih per mode → null', () => {
    expect(readProviderForMode('analisis')).toBeNull();
    expect(readProviderForMode('metadata')).toBeNull();
  });

  it('roundtrip per mode, saling terpisah', () => {
    writeProviderForMode('analisis', 'gemini');
    writeProviderForMode('metadata', 'groq');
    expect(readProviderForMode('analisis')).toBe('gemini');
    expect(readProviderForMode('metadata')).toBe('groq');
    // ganti satu mode tidak menyentuh mode lain maupun kunci umum
    writeProviderForMode('analisis', 'openrouter');
    expect(readProviderForMode('analisis')).toBe('openrouter');
    expect(readProviderForMode('metadata')).toBe('groq');
    expect(readProvider()).toBeNull();
  });

  it('nilai tak sah → null', () => {
    store.setItem('stockmeta_provider_analisis', 'custom');
    expect(readProviderForMode('analisis')).toBeNull();
    store.setItem('stockmeta_provider_metadata', 'coming-soon');
    expect(readProviderForMode('metadata')).toBeNull();
  });
});

describe('mode aplikasi Analisis/Metadata (M29)', () => {
  it('belum pernah memilih → null (pemanggil memakai default metadata)', () => {
    expect(readMode()).toBeNull();
  });

  it('roundtrip nilai valid; nilai tak sah → null', () => {
    writeMode('analisis');
    expect(readMode()).toBe('analisis');
    writeMode('metadata');
    expect(readMode()).toBe('metadata');
    store.setItem('stockmeta_mode', 'review');
    expect(readMode()).toBeNull();
  });
});

describe('saveSession', () => {
  it('sesi kosong → kunci dihapus', () => {
    store.setItem('stockmeta_session', 'x');
    saveSession(session({ imgs: [] }));
    expect(store.getItem('stockmeta_session')).toBeNull();
  });

  it('normal → JSON v1 dengan isi sesi', () => {
    saveSession(session());
    const raw = store.getItem('stockmeta_session');
    expect(raw).toBeTruthy();
    const d = JSON.parse(String(raw));
    expect(d.v).toBe(1);
    expect(d.platform).toBe('adobe');
    expect(d.tema).toBe('Halloween');
    expect(d.imgs).toHaveLength(1);
    expect(d.imgs[0].thumb).toBe('data:image/jpeg;base64,QQ==');
  });

  it('kuota penuh → disimpan ulang tanpa thumbnail, metadata utuh', () => {
    store = fakeStorage({ quota: true });
    vi.stubGlobal('localStorage', store);
    saveSession(session());
    const d = JSON.parse(String(store.getItem('stockmeta_session')));
    expect(d.imgs[0].thumb).toBe('');
    expect(d.imgs[0].metadata).toEqual(frame().metadata);
  });
});

describe('loadSession — format baru (slot per platform)', () => {
  it('roundtrip: sesi tersimpan terbaca utuh', () => {
    saveSession(session());
    expect(loadSession()).toEqual(session());
  });

  it('ganti platform (simpan ulang dengan platform berbeda) tidak menghapus data slot lain', () => {
    const duaSlot = frame({
      status: { adobe: 'siap', shutterstock: 'siap' },
      metadata: {
        adobe: { title: 'Judul', keywords: ['kucing'], category: 'Animals' },
        shutterstock: { description: 'Deskripsi', keywords: ['kucing'], categories: ['Animals/Wildlife'] }
      }
    });
    saveSession(session({ imgs: [duaSlot] }));
    const sebelum = loadSession();
    saveSession({ ...sebelum!, platform: 'shutterstock' });
    const sesudah = loadSession();
    expect(sesudah?.platform).toBe('shutterstock');
    expect(sesudah?.imgs[0].metadata.adobe).toEqual(duaSlot.metadata.adobe);
    expect(sesudah?.imgs[0].metadata.shutterstock).toEqual(duaSlot.metadata.shutterstock);
    expect(sesudah?.imgs[0].status).toEqual(duaSlot.status);
  });

  it('JSON rusak / imgs kosong / semua entri tak terbaca → kunci dibuang, null', () => {
    store.setItem('stockmeta_session', '{rusak');
    expect(loadSession()).toBeNull();
    expect(store.getItem('stockmeta_session')).toBeNull();

    store.setItem('stockmeta_session', JSON.stringify({ v: 1, imgs: [] }));
    expect(loadSession()).toBeNull();
    expect(store.getItem('stockmeta_session')).toBeNull();

    store.setItem('stockmeta_session', JSON.stringify({ v: 1, platform: 'adobe', imgs: [null, 'bukan-objek'] }));
    expect(loadSession()).toBeNull();
    expect(store.getItem('stockmeta_session')).toBeNull();
  });

  it('normalisasi: platform asing → adobe, sel hilang → null, memproses → menunggu/siap', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, ts: 9, platform: 'nvidia', sel: 99, seq: 1, tema: '',
      imgs: [{ id: 5, name: 'a.png', status: 'memproses', thumb: '', metadata: { keywords: ['a'] } }]
    }));
    const s = loadSession();
    expect(s).toMatchObject({ platform: 'adobe', sel: null, seq: 5 });
    expect(s?.imgs[0]).toMatchObject({ id: 5, name: 'a.png', thumb: '' });
    // status sinkron dengan slot: ada isi + memproses → 'siap'; platform lain default
    expect(s?.imgs[0].status).toEqual({ adobe: 'siap', shutterstock: 'menunggu' });
    expect(s?.imgs[0].error).toEqual({ adobe: '', shutterstock: '' });
    expect(s?.imgs[0].metadata.adobe?.keywords).toEqual(['a']);
    expect(s?.imgs[0].metadata.shutterstock).toBeUndefined();
  });

  it('id kosong → diberi id baru dari seq', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, platform: 'adobe', sel: null, seq: 7, tema: '',
      imgs: [{ name: 'x.jpg', metadata: { keywords: [] } }]
    }));
    expect(loadSession()?.imgs[0].id).toBe(8);
  });

  it('M11: bendera categoryAuto ikut tersimpan dan terbaca lagi setelah reload', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, platform: 'adobe', sel: null, seq: 1, tema: '',
      imgs: [{
        id: 1, name: 'a.jpg', thumb: '',
        metadata: { adobe: { title: 'T', keywords: ['a'], category: 'Animals', categoryAuto: true } }
      }]
    }));
    expect(loadSession()?.imgs[0].metadata.adobe?.categoryAuto).toBe(true);
  });

  it('M29: slot analisis valid terbaca utuh; sesi lama tanpa slot → undefined', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, platform: 'adobe', sel: null, seq: 2, tema: '',
      imgs: [
        {
          id: 1, name: 'a.jpg', thumb: '',
          analysis: { adobe: { verdict: 'layak', issues: [], summary: 'OK' } },
          analysisStatus: { adobe: 'siap' },
          analysisError: { adobe: '' }
        },
        { id: 2, name: 'b.jpg', thumb: '' }
      ]
    }));
    const s = loadSession();
    expect(s?.imgs[0].analysis?.adobe).toEqual({ verdict: 'layak', issues: [], summary: 'OK' });
    expect(s?.imgs[0].analysisStatus?.adobe).toBe('siap');
    expect(s?.imgs[1].analysis).toBeUndefined();
    expect(s?.imgs[1].analysisStatus).toBeUndefined();
  });

  it('M29: slot analisis rusak dibuang (bukan sesi dibuang); memproses → menunggu', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, platform: 'adobe', sel: null, seq: 1, tema: '',
      imgs: [{
        id: 1, name: 'a.jpg', thumb: '',
        analysis: { adobe: { verdict: 'bagus-sekali', issues: 'bukan-array' } },
        analysisStatus: { adobe: 'memproses' }
      }]
    }));
    const s = loadSession();
    expect(s).not.toBeNull();
    expect(s?.imgs[0].analysis).toBeUndefined();
    expect(s?.imgs[0].analysisStatus?.adobe).toBe('menunggu');
  });

  it('slot ada tapi kosong isinya + status siap → dinormalkan ke menunggu (audit A1)', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, platform: 'adobe', sel: null, seq: 1, tema: '',
      imgs: [{
        id: 1, name: 'kosong.jpg', thumb: '',
        status: { adobe: 'siap', shutterstock: 'menunggu' }, error: { adobe: '', shutterstock: '' },
        metadata: { adobe: { title: '', keywords: [], category: '' } }
      }]
    }));
    const s = loadSession();
    expect(s?.imgs[0].status).toEqual({ adobe: 'menunggu', shutterstock: 'menunggu' });
  });
});

describe('loadSession — migrasi format lama', () => {
  it('M4 awal (metadata flat + status/error string) → masuk slot platform sesi', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, ts: 9, platform: 'adobe', sel: 1, seq: 1, tema: '',
      imgs: [{
        id: 1, name: 'lama.jpg', thumb: 'x', status: 'gagal', error: 'Batas kuota tercapai (429) — coba lagi nanti.', tema: '',
        metadata: { title: 'Judul lama', keywords: ['lama'], category: 'Food' }
      }]
    }));
    const s = loadSession();
    expect(s?.imgs[0].metadata).toEqual({
      adobe: { title: 'Judul lama', keywords: ['lama'], category: 'Food' }
    });
    expect(s?.imgs[0].status).toEqual({ adobe: 'gagal', shutterstock: 'menunggu' });
    expect(s?.imgs[0].error.adobe).toBe('Batas kuota tercapai (429) — coba lagi nanti.');
    expect(s?.imgs[0].error.shutterstock).toBe('');
  });

  it('legacy lama (title/desc/cat/done/failed/err tanpa metadata) → slot platform sesi', () => {
    store.setItem('stockmeta_session', JSON.stringify({
      v: 1, ts: 9, platform: 'shutterstock', sel: null, seq: 2, tema: 'Halloween',
      imgs: [
        { id: 1, name: 'gagal.jpg', url: 'blob:x', thumb: 't', title: 'T', desc: 'Deskripsi lama',
          keywords: ['a', 'b'], cat: 'Food', done: false, failed: true, err: 'Gagal diproses' },
        { id: 2, name: 'ok.jpg', thumb: '', title: 'Bagus', desc: '', keywords: ['c'], cat: 'Nature',
          done: true, failed: false, err: '' }
      ]
    }));
    const s = loadSession();
    expect(s?.platform).toBe('shutterstock');
    expect(s?.imgs[0].metadata.shutterstock).toEqual({
      description: 'Deskripsi lama', keywords: ['a', 'b'], categories: ['Food']
    });
    expect(s?.imgs[0].metadata.adobe).toBeUndefined();
    expect(s?.imgs[0].status).toEqual({ adobe: 'menunggu', shutterstock: 'gagal' });
    expect(s?.imgs[0].error.shutterstock).toBe('Gagal diproses');
    expect(s?.imgs[1].metadata.shutterstock).toEqual({
      description: '', keywords: ['c'], categories: ['Nature']
    });
    expect(s?.imgs[1].status.shutterstock).toBe('siap');
    expect(s?.tema).toBe('Halloween');
  });
});

describe('tema', () => {
  it('roundtrip dan nilai tak sah → null', () => {
    expect(readTheme()).toBeNull();
    writeTheme('light');
    expect(readTheme()).toBe('light');
    writeTheme('dark');
    expect(readTheme()).toBe('dark');
    store.setItem('stockmeta_theme', 'biru');
    expect(readTheme()).toBeNull();
  });
});

describe('jeda antar foto', () => {
  it('kunci kosong / nilai tak sah → default', () => {
    expect(readBatchDelay()).toBe(BATCH_DELAY_DEFAULT_SEC);
    store.setItem('stockmeta_batch_delay', '7');       // bukan opsi
    expect(readBatchDelay()).toBe(BATCH_DELAY_DEFAULT_SEC);
    store.setItem('stockmeta_batch_delay', 'bukan-angka');
    expect(readBatchDelay()).toBe(BATCH_DELAY_DEFAULT_SEC);
  });

  it('roundtrip nilai valid; write tak sah → default tersimpan', () => {
    writeBatchDelay(12);
    expect(readBatchDelay()).toBe(12);
    writeBatchDelay(3);
    expect(readBatchDelay()).toBe(3);
    writeBatchDelay(99);
    expect(store.getItem('stockmeta_batch_delay')).toBe(String(BATCH_DELAY_DEFAULT_SEC));
    expect(readBatchDelay()).toBe(BATCH_DELAY_DEFAULT_SEC);
  });
});

describe('removeSession', () => {
  it('menghapus kunci sesi', () => {
    saveSession(session());
    removeSession();
    expect(store.getItem('stockmeta_session')).toBeNull();
    expect(loadSession()).toBeNull();
  });
});
