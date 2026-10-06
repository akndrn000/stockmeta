import { describe, expect, it } from 'vitest';
import { cleanAdobeTitle, cleanShutterstockDescription, mergeGenerated } from './metadata';
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
    expect(mergeGenerated('shutterstock', shutter(), { description: 'd', category: 'Abstract', categories: ['Abstract'], categoryAuto: true }))
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

  it('Fase 1: Shutterstock array 2 kategori dipertahankan penuh', () => {
    expect(mergeGenerated('shutterstock', shutter(), {
      description: 'd',
      category: 'Abstract',
      categories: ['Abstract', 'Nature']
    })).toEqual({ description: 'd', keywords: [], categories: ['Abstract', 'Nature'] });
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

describe('cleanShutterstockDescription', () => {
  it('menghapus semua koma + rapikan spasi ganda', () => {
    const out = cleanShutterstockDescription('A cat sitting on a table,  with soft light,  and a calm mood. ');
    expect(out).not.toContain(',');
    expect(out).not.toMatch(/ {2,}/);
    expect(out).toContain('soft light');
  });

  it('daftar berkoma digabung kata sambung, tanpa "and and"', () => {
    const out = cleanShutterstockDescription('A cat, a dog, a bird');
    expect(out).not.toContain(',');
    expect(out.toLowerCase()).not.toContain('and and');
    expect(out).toContain('cat');
    expect(out).toContain('bird');
  });

  it('koma sebelum kata sambung tidak digandakan', () => {
    const out = cleanShutterstockDescription('A fluffy cat sitting on a table, with soft morning light');
    expect(out).not.toContain(',');
    expect(out.toLowerCase()).not.toContain('and with');
    expect(out).toContain('with soft morning light');
  });

  it('tanpa koma → hanya rapikan spasi', () => {
    expect(cleanShutterstockDescription('  A calm lake at sunrise with soft light.  '))
      .toBe('A calm lake at sunrise with soft light.');
  });
});
