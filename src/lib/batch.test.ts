// Tes orkestrasi batch murni: urutan, jeda antar frame, gagal-lanjut, file hilang,
// tema per frame, onWait, dan pembatalan via AbortSignal.
import { describe, expect, it } from 'vitest';
import type { WaitInfo } from './providers/retry';
import { MISSING_FILE_MSG, runBatch, type BatchOptions } from './batch';
import type { ParsedMetadata } from './prompt';

const FILE = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
const META: ParsedMetadata = { title: 't' };

// `make` menerima array events supaya override bisa mencatat ke sana tanpa TDZ
// (events baru dibuat oleh run() sebelum opsi dievaluasi).
async function run(
  make: (events: string[]) => Partial<BatchOptions> = () => ({})
): Promise<{ events: string[]; summary: Awaited<ReturnType<typeof runBatch>> }> {
  const events: string[] = [];
  const files = new Set<number>([0, 1, 2]);
  const themes: Record<number, string> = { 0: 'kopi', 1: 'teh', 2: 'susu' };
  const summary = await runBatch({
    frameIds: [0, 1, 2],
    platform: 'adobe',
    generate: (id, args) => {
      events.push(`gen:${id}:${args.theme}`);
      return Promise.resolve(META);
    },
    getImage: (id) => (files.has(id) ? FILE : undefined),
    getTheme: (id) => themes[id] ?? '',
    onStart: (id) => events.push(`start:${id}`),
    onSuccess: (id) => events.push(`ok:${id}`),
    onError: (id, msg) => events.push(`err:${id}:${msg}`),
    delayMs: 3000,
    sleep: () => {
      events.push('sleep');
      return Promise.resolve();
    },
    ...make(events)
  });
  return { events, summary };
}

describe('runBatch — urutan & jeda', () => {
  it('berurutan, jeda hanya antar frame (tidak sebelum pertama, tidak sesudah terakhir)', async () => {
    const { events, summary } = await run();
    expect(events).toEqual([
      'start:0', 'gen:0:kopi', 'ok:0',
      'sleep',
      'start:1', 'gen:1:teh', 'ok:1',
      'sleep',
      'start:2', 'gen:2:susu', 'ok:2'
    ]);
    expect(summary).toEqual({ done: 3, failed: 0, skipped: 0, cancelled: false, total: 3 });
  });

  it('delayMs 0 → tanpa tidur sama sekali', async () => {
    const { events } = await run(() => ({ delayMs: 0 }));
    expect(events.filter((e) => e === 'sleep')).toHaveLength(0);
    expect(events.filter((e) => e.startsWith('ok:'))).toHaveLength(3);
  });

  it('tema per frame diambil dari getTheme dan diteruskan ke generate', async () => {
    const { events } = await run();
    expect(events).toContain('gen:0:kopi');
    expect(events).toContain('gen:2:susu');
  });
});

describe('runBatch — gagal & file hilang', () => {
  it('frame gagal → onError dengan pesan asli, frame berikutnya tetap diproses', async () => {
    const { events, summary } = await run((events) => ({
      generate: (id, args) => {
        events.push(`gen:${id}:${args.theme}`);
        if (id === 1) return Promise.reject(new Error('Batas kuota tercapai (429)'));
        return Promise.resolve(META);
      }
    }));
    expect(events).toContain('err:1:Batas kuota tercapai (429)');
    expect(events).toContain('ok:2');
    expect(summary).toEqual({ done: 2, failed: 1, skipped: 0, cancelled: false, total: 3 });
  });

  it('frame tanpa file → onError + TANPA jeda sebelum frame berikutnya', async () => {
    const { events, summary } = await run(() => ({ getImage: (id) => (id === 1 ? undefined : FILE) }));
    expect(events).toEqual([
      'start:0', 'gen:0:kopi', 'ok:0',
      'sleep',
      'err:1:' + MISSING_FILE_MSG,
      'start:2', 'gen:2:susu', 'ok:2'
    ]);
    expect(summary.failed).toBe(1);
  });

  it('frame pertama tanpa file → langsung lanjut tanpa tidur', async () => {
    const { events } = await run(() => ({ getImage: (id) => (id === 0 ? undefined : FILE) }));
    expect(events).toEqual([
      'err:0:' + MISSING_FILE_MSG,
      'start:1', 'gen:1:teh', 'ok:1',
      'sleep',
      'start:2', 'gen:2:susu', 'ok:2'
    ]);
  });
});

describe('runBatch — onWait', () => {
  it('onWait dari provider diteruskan ke callback pemanggil beserta id frame', async () => {
    const waits: Array<[number, WaitInfo]> = [];
    const info: WaitInfo = { attempt: 1, maxAttempts: 5, waitMs: 15_000, reason: 'HTTP 429' };
    await run(() => ({
      generate: (id, args) => {
        args.onWait?.(info);
        return Promise.resolve(META);
      },
      onWait: (id, w) => waits.push([id, w])
    }));
    expect(waits).toEqual([[0, info], [1, info], [2, info]]);
  });

  it('onWait tidak diteruskan lagi setelah signal dibatalkan', async () => {
    const ac = new AbortController();
    const info: WaitInfo = { attempt: 1, maxAttempts: 5, waitMs: 1000, reason: 'HTTP 429' };
    const ids: number[] = [];
    const { summary } = await run(() => ({
      signal: ac.signal,
      generate: (_id, args) => {
        args.onWait?.(info);       // sebelum batal → diteruskan
        ac.abort();
        args.onWait?.(info);       // sesudah batal → dibuang
        return Promise.resolve(META);
      },
      onWait: (id) => ids.push(id)
    }));
    expect(ids).toEqual([0]);
    expect(summary.cancelled).toBe(true);
  });
});

describe('runBatch — batal', () => {
  it('batal setelah frame pertama selesai: sisanya tak disentuh, tanpa onCancel', async () => {
    const ac = new AbortController();
    const { events, summary } = await run((events) => ({
      signal: ac.signal,
      onSuccess: (id) => {
        events.push(`ok:${id}`);
        if (id === 0) ac.abort();
      }
    }));
    expect(events).toEqual(['start:0', 'gen:0:kopi', 'ok:0']);
    expect(summary).toEqual({ done: 1, failed: 0, skipped: 2, cancelled: true, total: 3 });
  });

  it('batal saat frame berjalan: onCancel(frame itu), tidak ada error/success, sisa tak disentuh', async () => {
    const ac = new AbortController();
    const order: string[] = [];
    const summary = await runBatch({
      frameIds: [0, 1, 2],
      platform: 'adobe',
      generate: (id, args) => {
        order.push(`gen:${id}`);
        if (id === 1) {
          return new Promise<ParsedMetadata>((_res, rej) => {
            args.signal?.addEventListener('abort', () => rej(new Error('Dibatalkan')), { once: true });
            setTimeout(() => ac.abort(), 0);      // batal selagi frame 1 berjalan
          });
        }
        return Promise.resolve(META);
      },
      getImage: () => FILE,
      getTheme: () => '',
      onStart: (id) => order.push(`start:${id}`),
      onCancel: (id) => order.push(`cancel:${id}`),
      onSuccess: (id) => order.push(`ok:${id}`),
      onError: (id) => order.push(`err:${id}`),
      delayMs: 0,
      signal: ac.signal,
      sleep: async () => {}
    });
    expect(order).toEqual(['start:0', 'gen:0', 'ok:0', 'start:1', 'gen:1', 'cancel:1']);
    expect(summary).toEqual({ done: 1, failed: 0, skipped: 2, cancelled: true, total: 3 });
  });

  it('batal di tengah jeda antar frame: berhenti sebelum frame berikutnya', async () => {
    const ac = new AbortController();
    const events: string[] = [];
    const summary = await runBatch({
      frameIds: [0, 1, 2],
      platform: 'adobe',
      generate: (id) => {
        events.push(`gen:${id}`);
        return Promise.resolve(META);
      },
      getImage: () => FILE,
      getTheme: () => '',
      onStart: (id) => events.push(`start:${id}`),
      onSuccess: (id) => events.push(`ok:${id}`),
      onError: (id) => events.push(`err:${id}`),
      delayMs: 3000,
      signal: ac.signal,
      sleep: async () => {
        events.push('sleep');
        ac.abort();                               // batal selagi tidur
      }
    });
    expect(events).toEqual(['start:0', 'gen:0', 'ok:0', 'sleep']);
    expect(summary).toEqual({ done: 1, failed: 0, skipped: 2, cancelled: true, total: 3 });
  });

  it('tanpa signal → tidak pernah dianggap batal', async () => {
    const { summary } = await run();
    expect(summary.cancelled).toBe(false);
  });
});
