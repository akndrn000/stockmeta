import { describe, expect, it } from 'vitest';
import { cleanAdobeTitle, mergeGenerated } from './metadata';
import type { AdobeMetadata, ShutterstockMetadata } from './types';

const adobe = (patch: Partial<AdobeMetadata> = {}): AdobeMetadata => ({
  title: '', keywords: [], category: '', ...patch
});
const shutter = (patch: Partial<ShutterstockMetadata> = {}): ShutterstockMetadata => ({
  description: '', keywords: [], categories: [], ...patch
});

// M11: kategori fallback dari parser hanya dipakai kalau slot lama masih kosong
describe('mergeGenerated — kategori fallback (categoryAuto)', () => {
  it('slot kosong → kategori fallback masuk lengkap dengan benderanya', () => {
    expect(mergeGenerated('adobe', adobe(), { title: 'x', category: 'Animals', categoryAuto: true }))
      .toEqual({ title: 'x', keywords: [], category: 'Animals', categoryAuto: true });
    expect(mergeGenerated('shutterstock', shutter(), { description: 'd', category: 'Abstract', categoryAuto: true }))
      .toEqual({ description: 'd', keywords: [], categories: ['Abstract'], categoryAuto: true });
  });

  it('slot sudah terisi → fallback TIDAK menimpa pilihan yang sudah ada', () => {
    expect(mergeGenerated('adobe', adobe({ category: 'Nature' }), { title: 'x', category: 'Animals', categoryAuto: true }))
      .toEqual({ title: 'x', keywords: [], category: 'Nature' });
    expect(mergeGenerated('shutterstock', shutter({ categories: ['Nature', 'Objects'] }), { category: 'Abstract', categoryAuto: true }))
      .toEqual({ description: '', keywords: [], categories: ['Nature', 'Objects'] });
  });

  it('model mengembalikan kategori valid → bendera lama dibersihkan', () => {
    expect(mergeGenerated('adobe', adobe({ category: 'Animals', categoryAuto: true }), { category: 'Food' }))
      .toEqual({ title: '', keywords: [], category: 'Food' });
  });
});

// M24 (koreksi M9a): koma di judul Adobe dipertahankan — CSV di-quote sehingga aman;
// hanya spasi berlebih yang dirapikan, tanpa pemotongan panjang di sini.
describe('cleanAdobeTitle', () => {
  it('koma dibiarkan, spasi ganda/newline dirapikan + trim', () => {
    expect(cleanAdobeTitle('Kopi,  susu,\ndan roti ')).toBe('Kopi, susu, dan roti');
    expect(cleanAdobeTitle('  Judul bagus ')).toBe('Judul bagus');
  });
});
