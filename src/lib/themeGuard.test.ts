// Penjaga Fase 4: gagal bila ada nama tema hardcode di src non-tes.
// Tema adalah input bebas pengguna — kode produksi dilarang memuat daftar tema
// (perayaan/musim) sebagai logika. Contoh netral di placeholder ("pasar pagi")
// dan kategori resmi ("Food", "Holidays") BUKAN pelanggaran.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Denylist: perayaan/musim spesifik + typo umum. Cocok whole-word, case-insensitive.
// Sengaja TIDAK memuat kata generik (business, food, market, festival umum tidak
// diblokir karena "festival" adalah kata konsep, bukan nama tema spesifik).
const BANNED = [
  'halloween', 'hallowen', 'christmas', 'natal', 'xmas',
  'easter', 'paskah', 'ramadan', 'ramadhan', 'lebaran', 'idul fitri', 'idulfitri',
  'imlek', 'valentine', 'thanksgiving', 'hanukkah', 'diwali',
  'winter', 'summer', 'autumn', 'spring', 'musim dingin', 'musim panas',
  'musim gugur', 'musim semi', 'tahun baru', 'st\\. patrick'
];

function srcFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      srcFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

describe('themeGuard — tanpa nama tema hardcode di produksi', () => {
  it('src/** non-tes bebas daftar perayaan/musim', () => {
    const repo = process.cwd();
    const files = srcFiles(join(repo, 'src'));
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8').toLowerCase();
      for (const b of BANNED) {
        const re = new RegExp(`\\b${b}\\b`);
        if (re.test(text)) hits.push(`${f}: ${b}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('prompt untuk tema acak tidak memuat contoh tema hardcode', async () => {
    const { buildMetadataPrompt } = await import('./prompt');
    const p = buildMetadataPrompt({ platform: 'adobe', theme: 'XyzQwerty123' });
    const l = p.toLowerCase();
    for (const b of ['halloween', 'christmas', 'pumpkin', 'spooky', 'ghost', 'bat']) {
      expect(l).not.toContain(b);
    }
  });
});
