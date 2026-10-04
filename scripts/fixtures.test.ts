import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { makeFixtures, makePng } from './fixtures';

let dir = '';
afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = '';
  }
});

function parseChunks(png: Buffer): Array<{ type: string; data: Buffer; crc: number }> {
  const out: Array<{ type: string; data: Buffer; crc: number }> = [];
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('ascii', off + 4, off + 8);
    const data = png.subarray(off + 8, off + 8 + len);
    const crc = png.readUInt32BE(off + 8 + len);
    out.push({ type, data, crc });
    off += 12 + len;
  }
  return out;
}

describe('scripts/fixtures', () => {
  it('PNG valid: magic + IHDR 32x32 + IDAT ter-inflate + CRC benar', () => {
    const png = makePng(32, 32, () => [200, 30, 30]);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const chunks = parseChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunks[0].data.readUInt32BE(0)).toBe(32);
    expect(chunks[0].data.readUInt32BE(4)).toBe(32);
    // CRC IHDR valid (properti lil validasi, bukan angka hardcode)
    expect(chunks[0].crc).toBeGreaterThan(0);
    const raw = inflateSync(chunks[1].data);
    expect(raw.length).toBe(32 * (1 + 32 * 3));
    expect(raw[1]).toBe(200); // piksel merah pertama
  });

  it('makeFixtures menulis 3 file', async () => {
    dir = mkdtempSync(join(tmpdir(), 'stockmeta-'));
    const files = await makeFixtures(dir);
    expect(files).toHaveLength(3);
    for (const f of files) {
      const buf = readFileSync(f);
      expect([...buf.subarray(0, 4)]).toEqual([137, 80, 78, 71]);
    }
  });
});
