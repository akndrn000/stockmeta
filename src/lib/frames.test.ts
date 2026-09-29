import { describe, expect, it } from 'vitest';
import { buildLimitMessage, filterIncomingFiles } from './frames';
import { MAX_FRAMES } from './limits';

const f = (name: string, type: string) => new File(['x'], name, { type });
const jpg = (name: string) => f(name, 'image/jpeg');

describe('filterIncomingFiles', () => {
  it('menerima JPG/PNG/WEBP dan menolak tipe lain tanpa menghabiskan slot', () => {
    const files = [jpg('a.jpg'), f('b.gif', 'image/gif'), f('c.png', 'image/png'), f('d.pdf', 'application/pdf')];
    const r = filterIncomingFiles(files, 0);
    expect(r.accepted.map((x) => x.name)).toEqual(['a.jpg', 'c.png']);
    expect(r.rejectedType.map((x) => x.name)).toEqual(['b.gif', 'd.pdf']);
    expect(r.skippedOverLimit).toHaveLength(0);
  });

  it('sisa slot = MAX_FRAMES - existingCount; kelebihan dilewati dengan urutan dipertahankan', () => {
    const files = Array.from({ length: MAX_FRAMES + 5 }, (_, i) => jpg(`${i}.jpg`));
    const r = filterIncomingFiles(files, 3);
    expect(r.accepted).toHaveLength(MAX_FRAMES - 3);
    expect(r.accepted.map((x) => x.name)).toEqual(
      Array.from({ length: MAX_FRAMES - 3 }, (_, i) => `${i}.jpg`)
    );
    expect(r.skippedOverLimit).toHaveLength(8);
  });

  it('batch penuh → semua file valid dilewati, tipe salah tetap ditolak', () => {
    const r = filterIncomingFiles([jpg('a.jpg'), f('b.gif', 'image/gif')], MAX_FRAMES);
    expect(r.accepted).toHaveLength(0);
    expect(r.skippedOverLimit.map((x) => x.name)).toEqual(['a.jpg']);
    expect(r.rejectedType.map((x) => x.name)).toEqual(['b.gif']);
  });

  it('existingCount melebihi batas tidak membuat slot negatif', () => {
    const r = filterIncomingFiles([jpg('a.jpg')], MAX_FRAMES + 5);
    expect(r.accepted).toHaveLength(0);
    expect(r.skippedOverLimit).toHaveLength(1);
  });
});

describe('buildLimitMessage', () => {
  it('contoh: dilewati karena batas', () => {
    const files = Array.from({ length: MAX_FRAMES + 2 }, (_, i) => jpg(`${i}.jpg`));
    const r = filterIncomingFiles(files, 3);      // slot sisa MAX_FRAMES - 3 → 5 dilewati
    expect(buildLimitMessage(r)).toBe(
      `Dipertahankan ${MAX_FRAMES - 3}, dilewati 5 — satu batch maksimal ${MAX_FRAMES} frame.`
    );
  });

  it('contoh: tipe tidak didukung', () => {
    const r = filterIncomingFiles([f('a.gif', 'image/gif'), f('b.tiff', 'image/tiff')], 0);
    expect(buildLimitMessage(r)).toBe('2 file dilewati: hanya JPG, PNG, dan WEBP.');
  });

  it('gabungan keduanya dipisah spasi', () => {
    const files = [...Array.from({ length: 7 }, (_, i) => jpg(`${i}.jpg`)), f('x.gif', 'image/gif')];
    const r = filterIncomingFiles(files, MAX_FRAMES - 5);   // slot sisa 5 → 5 diterima, 2 kelebihan, 1 tipe salah
    expect(buildLimitMessage(r)).toBe(
      `Dipertahankan 5, dilewati 2 — satu batch maksimal ${MAX_FRAMES} frame. 1 file dilewati: hanya JPG, PNG, dan WEBP.`
    );
  });

  it('semua diterima → pesan kosong', () => {
    expect(buildLimitMessage(filterIncomingFiles([jpg('a.jpg')], 0))).toBe('');
  });
});
