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
import { groq } from '../lib/providers/groq';
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
let seenArgs: { retryNote?: string; languageFix?: boolean; promptOverride?: string }[] = [];

// M32: respons palsu memakai 30 keyword satu kata Inggris (tanpa perluasan)
// supaya tes mekanik batch tidak tercampur perilaku retry.
const KW30 = ['fox', 'wolf', 'coyote', 'jackal', 'eagle', 'hawk', 'owl', 'deer',
  'bear', 'trees', 'leaves', 'acorn', 'trail', 'pond', 'fur', 'wood', 'stone',
  'stripes', 'circle', 'calm', 'cheerful', 'red', 'orange', 'poster', 'banner',
  'vintage', 'morning', 'sunrise', 'forest', 'river'];

const fakeAdapter: ProviderAdapter = {
  id: 'gemini',
  testConnection: async () => ({ ok: true }),
  generateForImage: async (args) => {
    seenArgs.push(args);
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
  // jeda top-up 0 di tes (produksi 1,5 dtk antar percobaan dalam 1 frame)
  const b = useBatch(s, p, { delayMs: 0, topupDelayMs: 0 });
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
  seenArgs = [];
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

function addFrames(n: number) {
  act(() => {
    for (let i = 0; i < n; i++) {
      const id = api().s.addFrame(blank(`f${i}.jpg`));
      fileStore.set(id, new File(['x'], `f${i}.jpg`, { type: 'image/jpeg' }));
    }
  });
}

async function ready() {
  act(() => {
    api().p.setKey('kunci-rahasia');
    api().s.setTema('Valid Theme');
  });
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
    script = [{ meta: { title: 'baru', keywords: [...KW30] } }];

    act(() => api().b.startBatch());
    await flush();

    expect(calls).toBe(2);                                   // frame siap dilewati
    expect(api().s.frames[0].metadata.adobe?.title).toBe('sudah jadi');
    expect(api().s.frames[1].metadata.adobe).toEqual({ title: 'Baru', keywords: KW30, category: '' });
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
    script = [{ meta: { title: 'judul baru', keywords: [...KW30] } }];

    act(() => api().b.startBatch());
    await flush();

    const f = api().s.frames[0];
    expect(f.status.adobe).toBe('siap');
    expect(f.error.adobe).toBe('');
    expect(f.metadata.adobe).toEqual({ title: 'Judul baru', keywords: KW30, category: '' });
    expect(api().s.notes[0]).toBeUndefined();
  });

  it('gagal → status gagal + pesan error asli, frame berikutnya tetap jalan, saran limit tampil', async () => {
    addFrames(2);
    await ready();
    script = [
      { err: new Error('Batas kuota tercapai (429)') },
      { meta: { title: 'oke', keywords: [...KW30] } }
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
    script = [{ meta: { title: 'isi', keywords: [...KW30] } }];        // adapter palsu harus mengisi slot → status siap

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
    script = [{ meta: { title: 'hasil baru', keywords: [...KW30] } }];

    act(() => api().b.regenerateFrame(0));
    await flush();
    expect(api().b.regenConfirm).toBe(0);        // "Timpa hasil yang ada?"
    expect(calls).toBe(0);
    expect(api().s.frames[0].metadata.adobe?.title).toBe('isi lama');

    act(() => api().b.regenerateFrame(0));       // ya, timpa
    await flush();
    expect(api().b.regenConfirm).toBeNull();
    expect(calls).toBe(1);
    expect(api().s.frames[0].metadata.adobe?.title).toBe('Hasil baru');
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
    script = [{ meta: { title: 'only this frame', keywords: [...KW30] } }];

    act(() => api().b.regenerateFrame(1));
    await flush();

    expect(api().b.regenConfirm).toBeNull();
    expect(calls).toBe(1);
    expect(api().s.frames[1].metadata.adobe?.title).toBe('Only this frame');
    expect(api().s.frames[0].status.adobe).toBe('menunggu');
  });
});

describe('useBatch — buat ulang semua (M11)', () => {
  it('konfirmasi dulu; sesudahnya SEMUA frame platform aktif diproses ulang (menimpa)', async () => {
    addFrames(2);
    await ready();
    act(() => {
      api().s.applyGenerated(0, 'adobe', { title: 'isi lama' });
      api().s.applyGenerated(1, 'adobe', { title: 'isi lama 2' });
    });
    script = [{ meta: { title: 'baru 1', keywords: [...KW30] } }, { meta: { title: 'baru 2', keywords: [...KW30] } }];

    act(() => api().b.regenerateAll());
    await flush();
    expect(api().b.regenAllConfirm).toBe('adobe');   // "Ganti semua hasil yang sudah ada?"
    expect(calls).toBe(0);
    expect(api().s.frames[0].metadata.adobe?.title).toBe('isi lama');

    act(() => api().b.regenerateAll());              // ya, ganti semua
    await flush();
    expect(api().b.regenAllConfirm).toBeNull();
    expect(calls).toBe(2);                            // frame 'siap' pun ikut diproses
    expect(api().s.frames[0].metadata.adobe?.title).toBe('Baru 1');
    expect(api().s.frames[1].metadata.adobe?.title).toBe('Baru 2');
  });

  it('konfirmasi bisa dibatalkan lewat dismissRegenAll', async () => {
    addFrames(1);
    await ready();
    act(() => api().b.regenerateAll());
    expect(api().b.regenAllConfirm).toBe('adobe');
    act(() => api().b.dismissRegenAll());
    expect(api().b.regenAllConfirm).toBeNull();
    expect(calls).toBe(0);
  });

  it('file asli hilang → frame itu gagal + pesan upload ulang, sisanya tetap diproses', async () => {
    addFrames(2);
    await ready();
    fileStore.delete(1);
    script = [{ meta: { title: 'tetap jalan', keywords: [...KW30] } }];

    act(() => api().b.regenerateAll());
    await flush();
    act(() => api().b.regenerateAll());
    await flush();

    expect(calls).toBe(1);
    expect(api().s.frames[0].status.adobe).toBe('siap');
    expect(api().s.frames[1].status.adobe).toBe('gagal');
    expect(api().s.frames[1].error.adobe).toBe(MISSING_FILE_MSG);
  });

  it('provider belum dites → tolak, konfirmasi tidak tersimpan', async () => {
    addFrames(1);
    act(() => api().b.regenerateAll());
    await flush();
    expect(api().b.notice).toBe(NEED_TEST_MSG);
    expect(api().b.regenAllConfirm).toBeNull();
    expect(calls).toBe(0);
  });
});

describe('useBatch — tema opsional', () => {
  it('tema efektif kosong → generate tetap jalan normal tanpa tema', async () => {
    addFrames(2);
    await ready();
    act(() => api().s.setTema(''));   // kosongkan lagi setelah ready
    script = [{ meta: { title: 'Unthemed result', keywords: [...KW30] } }];

    act(() => api().b.startBatch());
    await flush();

    expect(calls).toBe(2);
    expect(api().b.themeError).toBeNull();
    expect(api().b.notice).not.toContain('Tema utama');
    expect(api().s.frames[0].status.adobe).toBe('siap');
    expect(api().s.frames[1].status.adobe).toBe('siap');
  });

  it('override per frame dipakai — batch valid menutupi frame kosong, override tak valid menolak', async () => {
    addFrames(2);
    await ready();
    act(() => {
      api().s.setTema('Valid Theme');
      api().s.setFrameTema(0, 'x');   // 1 karakter → tak valid walau batch valid
    });
    script = [{ meta: { title: 'Frame result', keywords: [...KW30] } }];

    act(() => api().b.regenerateFrame(0));
    await flush();
    expect(calls).toBe(0);
    expect(api().b.notice).toContain('minimal 2 karakter');

    act(() => {
      api().s.setFrameTema(0, '');    // kosongkan override → ikut batch yang valid
      api().s.setFrameTema(1, 'Frame Theme');
    });
    act(() => api().b.regenerateFrame(1));
    await flush();
    expect(calls).toBe(1);
  });

  it('regenerateAll dengan tema kosong tetap jalan (minta konfirmasi dulu)', async () => {
    addFrames(2);
    await ready();
    act(() => api().s.setTema(''));
    script = [
      { meta: { title: 'Unthemed result', keywords: [...KW30] } },
      { meta: { title: 'Unthemed result', keywords: [...KW30] } }
    ];
    act(() => api().b.regenerateAll());
    await flush();
    expect(api().b.regenAllConfirm).toBe('adobe');   // konfirmasi dulu
    expect(calls).toBe(0);

    act(() => api().b.regenerateAll());              // ya, ganti semua
    await flush();
    expect(api().b.regenAllConfirm).toBeNull();
    expect(calls).toBe(2);
    expect(api().s.frames[0].status.adobe).toBe('siap');
    expect(api().s.frames[1].status.adobe).toBe('siap');
  });
});

describe('useBatch - perluasan keyword M32', () => {
  const POOR_OBS = { objects: ['fox', 'ears'], materials: ['fur'], usages: ['banner'], colors: [] as string[], media_type: 'photo' };
  const poor = (): ParsedMetadata => ({
    title: 'A fox rests',
    sourcedKeywords: [
      { k: 'fox', src: 'visible' },
      { k: 'ears', src: 'visible' },
      { k: 'fur', src: 'attribute' },
      { k: 'banner', src: 'usage' }
    ],
    observation: POOR_OBS
  });
  const rich = (): ParsedMetadata => ({
    title: 'A fox rests among trees',
    sourcedKeywords: KW30.slice(0, 30).map((k) => ({ k, src: 'visible' as const })),
    observation: { objects: [...KW30], media_type: 'photo' }
  });
  // Extra top-up yang lolos grounding POOR_OBS (sinonim terverifikasi + usage
  // non-media-only) tapi tetap tipis → gabungan 8, perluasan tetap jalan.
  const poorExtra = (): ParsedMetadata => ({
    sourcedKeywords: [
      { k: 'vulpine', src: 'synonym', of: 'fox', rel: 'synonym' },
      { k: 'cub', src: 'synonym', of: 'fox', rel: 'specific' },
      { k: 'den', src: 'usage' },
      { k: 'wallpaper', src: 'usage' }
    ]
  });

  it('kolam miskin -> 2x top-up (finalisasi grounding menipiskan lagi) lalu perluasan, total 4 panggilan', async () => {
    addFrames(1);
    await ready();
    script = [{ meta: poor() }, { meta: poorExtra() }, { meta: rich() }];

    act(() => api().b.regenerateFrame(0));
    await flush();

    // utama (1) + top-up 8 kata (2) + top-up 35 kata mentah (3) + perluasan rich (4)
    expect(calls).toBe(4);
    expect(seenArgs[1].promptOverride).toContain('TAMBAHAN');
    // follow-up ke-2 mencantumkan kata dari follow-up ke-1 (daftar sejauh itu)
    expect(seenArgs[2].promptOverride).toContain('TAMBAHAN');
    expect(seenArgs[2].promptOverride).toContain('vulpine');
    expect(seenArgs[3].retryNote).toContain('fox');
    expect(seenArgs[3].retryNote).toContain('Faset yang belum terwakili');
    expect(api().s.frames[0].metadata.adobe?.keywords).toHaveLength(30);
  });

  it('tetap miskin setelah 3x top-up + perluasan -> Tahap D jalan, catatan tampil, disimpan apa adanya', async () => {
    addFrames(1);
    await ready();
    script = [{ meta: poor() }];

    act(() => api().b.regenerateFrame(0));
    await flush();

    // utama (1) + top-up duplikat-nous (2, 3) + perluasan (4) + Tahap D (5, usage = berisiko)
    expect(calls).toBe(5);
    expect(seenArgs[1].promptOverride).toContain('TAMBAHAN');
    expect(seenArgs[2].promptOverride).toContain('TAMBAHAN');
    expect(seenArgs[4].promptOverride).toContain('"remove"');
    expect(api().s.frames[0].metadata.adobe?.keywords).toEqual(['fox', 'ears', 'fur', 'banner']);
    // user tahu dari UI: sudah upaya maksimal 3x tapi tetap di bawah target
    expect(api().s.notes[0]).toContain('Keyword di bawah target (4/30) meski sudah 3 percobaan');
  });

  it('Indonesia + miskin -> 2x top-up dulu, lalu koreksi bahasa', async () => {
    addFrames(1);
    await ready();
    const indonesian = (): ParsedMetadata => ({ ...poor(), title: 'Seorang pria dengan topi di pasar' });
    script = [{ meta: indonesian() }, { meta: poor() }, { meta: rich() }];

    act(() => api().b.regenerateFrame(0));
    await flush();

    // utama (1) + top-up duplikat-nous (2) + top-up rich (3) + koreksi bahasa rich (4)
    expect(calls).toBe(4);
    expect(seenArgs[1].promptOverride).toContain('TAMBAHAN');
    expect(seenArgs[2].promptOverride).toContain('TAMBAHAN');
    expect(seenArgs[3].languageFix).toBe(true);
    expect(api().s.frames[0].metadata.adobe?.keywords).toHaveLength(30);
  });
});

describe('useBatch - Tahap D verifikasi M33', () => {  it('kaya berisiko -> Tahap D menghapus yang salah, total 2 panggilan', async () => {
    const OBS = {
      objects: ['cat'],
      parts: ['wings', 'collar', 'stars', 'moon', 'branch', 'trunk'],
      patterns: ['stripes'],
      materials: ['wood', 'fur', 'stone'],
      shapes: ['circle'],
      styles: ['cartoon'],
      moods: ['cute', 'playful'],
      usages: ['sticker', 'banner', 'wallpaper', 'merchandise'],
      colors: ['orange'],
      media_type: 'vector illustration'
    };
    const dirty = (): ParsedMetadata => ({
      title: 'Orange cat with bat wings in soft light',
      themeCanonical: 'Halloween',
      themeFit: true,
      themeEvidence: 'costume ears in frame',
      observation: OBS,
      sourcedKeywords: [
        { k: 'cat', src: 'visible' }, { k: 'wings', src: 'visible' },
        { k: 'stars', src: 'visible' }, { k: 'moon', src: 'visible' },
        { k: 'collar', src: 'visible' }, { k: 'branch', src: 'visible' },
        { k: 'trunk', src: 'visible' },
        { k: 'kitten', src: 'synonym', of: 'cat', rel: 'synonym' },
        { k: 'feline', src: 'synonym', of: 'cat', rel: 'parent' },
        { k: 'puppy', src: 'synonym', of: 'cat', rel: 'synonym' },
        { k: 'cartoon', src: 'attribute' }, { k: 'cute', src: 'attribute' },
        { k: 'stripes', src: 'attribute' }, { k: 'wood', src: 'attribute' },
        { k: 'circle', src: 'attribute' }, { k: 'fur', src: 'attribute' },
        { k: 'stone', src: 'attribute' }, { k: 'playful', src: 'attribute' },
        { k: 'halloween', src: 'theme', kind: 'event' },
        { k: 'celebration', src: 'theme', kind: 'event' },
        { k: 'party', src: 'theme', kind: 'activity' },
        { k: 'october', src: 'theme', kind: 'season' },
        { k: 'holiday', src: 'theme', kind: 'event' },
        { k: 'spooky', src: 'theme', kind: 'mood' },
        { k: 'ghost', src: 'theme', kind: 'event' },
        { k: 'sticker', src: 'usage' }, { k: 'banner', src: 'usage' },
        { k: 'wallpaper', src: 'usage' }, { k: 'merchandise', src: 'usage' },
        { k: 'orange', src: 'attribute' }
      ]
    });
    addFrames(1);
    await ready();
    script = [{ meta: dirty() }, { meta: { stageRemove: ['puppy', 'ghost'] } }];

    act(() => api().b.regenerateFrame(0));
    await flush();

    expect(calls).toBe(2);
    expect(seenArgs[1].promptOverride).toContain('remove');
    const kws = api().s.frames[0].metadata.adobe?.keywords ?? [];
    expect(kws).toHaveLength(28);
    expect(kws).not.toContain('puppy');
    expect(kws).not.toContain('ghost');
    expect(kws[0]).toBe('cat');
    expect(kws.slice(0, 5)).toContain('halloween');
  });
});

describe('useBatch - warna judul tanpa dasar visual: tepat satu retry lalu strip', () => {
  // 30 keyword berdasar penuh (tanpa perluasan) supaya retry HANYA untuk warna.
  const RICH30 = ['fox', 'wolf', 'coyote', 'jackal', 'eagle', 'hawk', 'owl', 'deer',
    'bear', 'trees', 'leaves', 'acorn', 'trail', 'pond', 'fur', 'wood', 'stone',
    'stripes', 'circle', 'calm', 'cheerful', 'orange', 'poster', 'banner',
    'vintage', 'morning', 'sunrise', 'forest', 'river', 'moss'];
  const facts = {
    objects: [...RICH30],
    colors: ['orange'],
    media_type: 'photo'
  };
  const rich = (title: string): ParsedMetadata => ({
    title,
    sourcedKeywords: RICH30.map((k) => ({ k, src: 'visible' as const })),
    observation: facts,
    visible_facts: ['orange fox in forest at sunrise']
  });

  it('judul memuat Black tanpa dasar → tepat 1 retry, lalu Black hilang + peringatan tersimpan', async () => {
    addFrames(1);
    await ready();
    const richKitten = (): ParsedMetadata => ({
      ...rich('Cute Orange Fox with Wings'),
      sourcedKeywords: [
        ...RICH30.map((k) => ({ k, src: 'visible' as const })),
        { k: 'kitten', src: 'visible' as const }
      ]
    });
    script = [
      { meta: rich('Cute Black Fox with Wings') },
      { meta: richKitten() }
    ];

    act(() => api().b.regenerateFrame(0));
    await flush();

    expect(calls).toBe(2);
    expect(seenArgs[1].retryNote).toContain('black');
    const f = api().s.frames[0];
    expect(f.status.adobe).toBe('siap');
    expect(f.metadata.adobe?.title ?? '').not.toMatch(/black/i);
    expect(f.metadata.adobe?.keywords ?? []).not.toContain('kitten');
    expect(f.metadata.adobe?.warnings?.some((w) => w.includes('kitten'))).toBe(true);
  });

  it('tetap salah setelah retry → warna dihapus deterministik tanpa retry kedua', async () => {
    addFrames(1);
    await ready();
    script = [{ meta: rich('Cute Black Fox with Wings') }];

    act(() => api().b.regenerateFrame(0));
    await flush();

    expect(calls).toBe(2);
    const f = api().s.frames[0];
    expect(f.status.adobe).toBe('siap');
    expect(f.metadata.adobe?.title ?? '').not.toMatch(/black/i);
    expect(f.metadata.adobe?.warnings?.some((w) => w.includes('dihapus dari judul'))).toBe(true);
  });
});

