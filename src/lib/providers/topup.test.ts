// Tes top-up keyword otomatis: prompt follow-up, merge+dedupe+cap, dan integrasi
// generateWithFallback (mock 2 panggilan, tanpa jaringan). Skenario Dunia nyata:
// hasil pertama 15/49 → follow-up ke provider YANG SAMA → total ~35-40.
import { describe, expect, it, vi } from 'vitest';
import { MAX_KEYWORDS, MAX_KEYWORDS_ADOBE, TARGET_KEYWORDS_MIN } from '../limits';
import type { ParsedMetadata, SourcedKeyword } from '../prompt';
import { generateWithFallback } from './fallback';
import { ProviderError } from './retry';
import {
  TOPUP_ATTEMPT_DELAY_MS,
  TOPUP_MAX_CALLS,
  TOPUP_TARGET_MAX,
  TOPUP_TARGET_MIN,
  buildTopupPrompt,
  countKeywords,
  existingKeywordList,
  mergeTopupKeywords,
  needsTopup,
  sleepAbortable
} from './topup';
import type { GenerateArgs, ProviderAdapter, TestResult } from './types';

const src = (k: string): SourcedKeyword => ({ k, src: 'visible' });
const N = (n: number, prefix = 'w') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('buildTopupPrompt', () => {
  it('menyebut daftar yang sudah ada + target 35-40 + akurat + format JSON bersumber', () => {
    const p = buildTopupPrompt(['fox', 'fur']);
    expect(p).toContain('fox');
    expect(p).toContain('fur');
    expect(p).toContain('bukan mengulang');
    expect(p).toContain(`${TOPUP_TARGET_MIN}-${TOPUP_TARGET_MAX}`);
    expect(p.toLowerCase()).toContain('jangan mengarang');
    expect(p).toContain('{"keywords"');
    expect(p).toContain('visible|attribute|synonym|theme|usage');
    expect(p).toContain('bahasa Inggris');
  });
});

describe('countKeywords / needsTopup', () => {
  it('15 flat → perlu; 30 → tidak; 0 → perlu', () => {
    expect(needsTopup({ keywords: N(15) })).toBe(true);
    expect(needsTopup({ keywords: N(30) })).toBe(false);
    expect(needsTopup({})).toBe(true);
    expect(countKeywords({ keywords: N(15) })).toBe(15);
  });

  it('15 bersumber → perlu; campuran flat+bersumber dijumlahkan', () => {
    expect(needsTopup({ sourcedKeywords: N(15).map(src) })).toBe(true);
    expect(countKeywords({ keywords: N(10), sourcedKeywords: N(20).map(src) })).toBe(30);
  });

  it('existingKeywordList menggabung flat + bersumber', () => {
    expect(existingKeywordList({ keywords: ['a'], sourcedKeywords: [src('b')] })).toEqual(['a', 'b']);
  });
});

describe('mergeTopupKeywords', () => {
  it('bersumber + bersumber: merge, dedupe tanpa peduli huruf, urutan pertama-dulu', () => {
    const first: ParsedMetadata = { title: 'T', sourcedKeywords: N(15).map(src) };
    const extra: ParsedMetadata = { sourcedKeywords: [...N(5).map(src), ...N(20, 'n').map(src)] };
    const out = mergeTopupKeywords(first, extra, 'adobe');
    // 5 duplikat (w0-w4) dibuang → 15 + 20 = 35
    expect(out.sourcedKeywords).toHaveLength(35);
    expect(out.sourcedKeywords!.slice(0, 15).map((s) => s.k)).toEqual(N(15));
    expect(out.title).toBe('T');   // field lain dipertahankan dari hasil pertama
    expect(out.keywords).toBeUndefined();
  });

  it('dedupe case-insensitive: "Fox" tak mengulang "fox"', () => {
    const first: ParsedMetadata = { sourcedKeywords: [src('fox')] };
    const extra: ParsedMetadata = { sourcedKeywords: [src('Fox'), src('den')] };
    const out = mergeTopupKeywords(first, extra, 'adobe');
    expect(out.sourcedKeywords!.map((s) => s.k)).toEqual(['fox', 'den']);
  });

  it('cap Adobe 49: 28 + 30 → 49 (Shutterstock: 50)', () => {
    const first: ParsedMetadata = { sourcedKeywords: N(28).map(src) };
    const extra: ParsedMetadata = { sourcedKeywords: N(30, 'n').map(src) };
    expect(mergeTopupKeywords(first, extra, 'adobe').sourcedKeywords).toHaveLength(MAX_KEYWORDS_ADOBE);
    expect(mergeTopupKeywords(first, extra, 'shutterstock').sourcedKeywords).toHaveLength(50);
    expect(MAX_KEYWORDS).toBe(50);
  });

  it('flat + flat: merge string + cap', () => {
    const out = mergeTopupKeywords({ keywords: N(15) }, { keywords: [...N(5), ...N(20, 'n')] }, 'adobe');
    expect(out.keywords).toHaveLength(35);
  });

  it('extra kosong/duplikat semua → kembalikan first apa adanya (referensi sama)', () => {
    const first: ParsedMetadata = { sourcedKeywords: N(15).map(src) };
    expect(mergeTopupKeywords(first, {}, 'adobe')).toBe(first);
    expect(mergeTopupKeywords(first, { sourcedKeywords: N(15).map(src) }, 'adobe')).toBe(first);
    const flat: ParsedMetadata = { keywords: N(10) };
    expect(mergeTopupKeywords(flat, { keywords: [...N(10)] }, 'adobe')).toBe(flat);
  });

  it('ambang batas: 29 perlu, 30 tidak (TARGET_KEYWORDS_MIN)', () => {
    expect(TARGET_KEYWORDS_MIN).toBe(30);
    expect(needsTopup({ keywords: N(29) })).toBe(true);
    expect(needsTopup({ keywords: N(30) })).toBe(false);
  });
});

// --- Integrasi generateWithFallback (mock adapter, tanpa jaringan) ---

function fakeAdapter(impl: (args: GenerateArgs) => Promise<ParsedMetadata>): ProviderAdapter {
  return { id: 'groq', testConnection: async (): Promise<TestResult> => ({ ok: true }), generateForImage: impl };
}

function depsFor(impl: (args: GenerateArgs) => Promise<ParsedMetadata>) {
  const getAdapter = vi.fn((): ProviderAdapter | undefined => fakeAdapter(impl));
  const getKey = vi.fn(() => 'k');
  const isEnabled = vi.fn(() => true);
  // jeda top-up 0 di tes (produksi 1,5 dtk antar percobaan)
  return { getAdapter, getKey, isEnabled, deps: { getAdapter, getKey, isEnabled, topupDelayMs: 0 } };
}

const ARGS = {
  provider: 'groq' as const,
  apiKey: 'k-groq',
  image: { base64: 'QUFBQQ==', mimeType: 'image/jpeg' },
  platform: 'adobe' as const
};

describe('generateWithFallback + top-up', () => {
  it('15/49 → SATU follow-up ke provider sama (gambar sama, daftar lama di prompt) → total 35', async () => {
    const seen: GenerateArgs[] = [];
    const s = depsFor(async (args) => {
      seen.push(args);
      if (seen.length === 1) return { title: 'T', sourcedKeywords: N(15).map(src) };
      return { sourcedKeywords: [...N(5).map(src), ...N(20, 'n').map(src)] };
    });
    const infos: { attempt: number; count: number }[] = [];
    const out = await generateWithFallback({ ...ARGS, onTopup: (i) => infos.push(i) }, s.deps);
    expect(seen).toHaveLength(2);
    // follow-up: gambar yang sama dikirim ulang + daftar lama disebut agar tak diulang
    expect(seen[1].image).toEqual(ARGS.image);
    expect(seen[1].promptOverride).toContain('w0');
    expect(seen[1].promptOverride).toContain('w14');
    expect(seen[1].promptOverride).toContain('TAMBAHAN');
    expect(out.meta.sourcedKeywords).toHaveLength(35);
    expect(out.provider).toBe('groq');
    expect(out.usedFallback).toBe(false);
    expect(out.topupAttempts).toBe(2);
    expect(out.topupCount).toBe(35);
    expect(infos).toEqual([{ attempt: 1, count: 15 }, { attempt: 2, count: 35 }]);
  });

  it('masih < 30 setelah follow-up 1 → follow-up 2 memakai daftar SEJAUH ITU (maks 3 panggilan)', async () => {
    const seen: GenerateArgs[] = [];
    const s = depsFor(async (args) => {
      seen.push(args);
      if (seen.length === 1) return { sourcedKeywords: N(10).map(src) };
      if (seen.length === 2) return { sourcedKeywords: N(10, 'n').map(src) };
      return { sourcedKeywords: N(10, 'm').map(src) };
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(seen).toHaveLength(3);
    // follow-up ke-2 mencantumkan kata dari follow-up ke-1 (n0), bukan cuma awal
    expect(seen[2].promptOverride).toContain('w0');
    expect(seen[2].promptOverride).toContain('n0');
    expect(out.meta.sourcedKeywords).toHaveLength(30);
    expect(out.topupAttempts).toBe(3);
    expect(out.topupCount).toBe(30);
  });

  it('tetap < 30 setelah 3 panggilan → STOP, pakai yang ada + warn permanen', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const four = N(4).map(src);
      const gen = vi.fn(async () => ({ sourcedKeywords: four.map((s) => ({ ...s })) }));
      const s = depsFor(gen);
      const out = await generateWithFallback(ARGS, s.deps);
      expect(gen).toHaveBeenCalledTimes(3);   // TIDAK BOLEH lebih
      expect(out.meta.sourcedKeywords).toHaveLength(4);
      expect(out.topupAttempts).toBe(3);
      expect(out.topupCount).toBe(4);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toBe(
        '[topup] Frame gagal capai target keyword: 4/30 setelah 3 percobaan (provider: groq)'
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('cukup setelah 2 panggilan → TIDAK ada warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const s = depsFor(async (args) => {
        if (!args.promptOverride) return { sourcedKeywords: N(15).map(src) };
        return { sourcedKeywords: N(20, 'n').map(src) };
      });
      await generateWithFallback(ARGS, s.deps);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('follow-up GAGAL (limit) → hasil pertama dipakai apa adanya, tanpa throw', async () => {
    const s = depsFor(async (args) => {
      if (!args.promptOverride) return { title: 'T', keywords: N(15) };
      throw new ProviderError('Batas kuota tercapai (429) — coba lagi nanti.', { status: 429 });
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out.meta).toEqual({ title: 'T', keywords: N(15) });
    expect(out.topupAttempts).toBe(1);
  });

  it('30+ keyword → TANPA follow-up (satu panggilan saja)', async () => {
    const gen = vi.fn(async () => ({ keywords: N(30) }));
    const s = depsFor(gen);
    const out = await generateWithFallback(ARGS, s.deps);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(out.meta.keywords).toHaveLength(30);
    expect(out.topupAttempts).toBe(1);
  });

  it('panggilan verifikasi Tahap D (promptOverride) → TANPA top-up', async () => {
    const gen = vi.fn(async () => ({ stageRemove: ['x'] }));
    const s = depsFor(gen);
    await generateWithFallback({ ...ARGS, promptOverride: '{"remove": [...]}' }, s.deps);
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it('retry koreksi bahasa / perluasan → TANPA top-up bersarang', async () => {
    for (const retry of [{ languageFix: true }, { retryNote: 'tambah keyword' }]) {
      const gen = vi.fn(async () => ({ keywords: N(15) }));
      const s = depsFor(gen);
      const out = await generateWithFallback({ ...ARGS, ...retry }, s.deps);
      expect(gen).toHaveBeenCalledTimes(1);
      expect(out.meta.keywords).toHaveLength(15);
    }
  });

  it('hasil top-up dipotong di cap platform (Adobe 49)', async () => {
    const s = depsFor(async (args) => {
      if (!args.promptOverride) return { sourcedKeywords: N(28).map(src) };
      return { sourcedKeywords: N(30, 'n').map(src) };
    });
    const out = await generateWithFallback(ARGS, s.deps);
    expect(out.meta.sourcedKeywords).toHaveLength(MAX_KEYWORDS_ADOBE);
  });
});

describe('sleepAbortable', () => {
  it('ms <= 0 / sinyal batal → langsung selesai tanpa menunggu', async () => {
    await sleepAbortable(0);
    await sleepAbortable(-5);
    const ac = new AbortController();
    ac.abort();
    await sleepAbortable(1500, ac.signal);
  });

  it('konstanta loop sesuai spek: maks 3 panggilan, jeda 1-2 detik', () => {
    expect(TOPUP_MAX_CALLS).toBe(3);
    expect(TOPUP_ATTEMPT_DELAY_MS).toBeGreaterThanOrEqual(1000);
    expect(TOPUP_ATTEMPT_DELAY_MS).toBeLessThanOrEqual(2000);
  });
});
