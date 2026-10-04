// Fixture PNG kecil untuk smoke teknis live-test (BUKAN foto uji portal).
// Murni Node (zlib) — tanpa dependency baru.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const td = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([td, data])));
  return Buffer.concat([len, td, data, crc]);
}

/** PNG truecolor: pixel(x,y) → [r,g,b] */
export function makePng(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      raw[y * (1 + w * 3) + 1 + x * 3] = r;
      raw[y * (1 + w * 3) + 1 + x * 3 + 1] = g;
      raw[y * (1 + w * 3) + 1 + x * 3 + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/** 3 fixture: polos merah, polos hijau, pola papan catur (mewakili pattern_texture). */
export async function makeFixtures(dir: string): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const files: Array<[string, Buffer]> = [
    ['polos-merah.png', makePng(32, 32, () => [200, 30, 30])],
    ['polos-hijau.png', makePng(32, 32, () => [30, 160, 60])],
    ['pola-catur.png', makePng(32, 32, (x, y) =>
      ((x >> 2) + (y >> 2)) % 2 ? [240, 240, 240] : [20, 20, 20])]
  ];
  for (const [name, buf] of files) await writeFile(join(dir, name), buf);
  return files.map(([name]) => join(dir, name));
}
