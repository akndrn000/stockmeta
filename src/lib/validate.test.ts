import { describe, expect, it } from 'vitest';
import { validateMetadata } from './validate';
import {
  MAX_DESCRIPTION,
  MAX_FILENAME,
  MAX_KEYWORDS,
  MAX_TITLE_CSV,
  MIN_DESCRIPTION_WORDS,
  MIN_KEYWORDS_ADOBE,
  MIN_KEYWORDS_SHUTTER
} from './limits';
import type { AdobeMetadata, ShutterstockMetadata } from './types';

const adobe = (patch: Partial<AdobeMetadata> = {}): AdobeMetadata => ({
  title: '',
  keywords: [],
  category: '',
  ...patch
});
const shutter = (patch: Partial<ShutterstockMetadata> = {}): ShutterstockMetadata => ({
  description: '',
  keywords: [],
  categories: [],
  ...patch
});
const fields = (notes: ReturnType<typeof validateMetadata>) => notes.map((n) => n.field);
const kws = (n: number) => Array.from({ length: n }, (_, i) => `kata${i}`);

describe('validateMetadata — Adobe', () => {
  it('metadata kosong → saran wajib: judul aman, kata kunci < 5, kategori', () => {
    const notes = validateMetadata('adobe', adobe());
    expect(fields(notes)).toEqual(['keywords', 'category']);
    expect(notes[0].message).toBe(`Kata kunci minimal ${MIN_KEYWORDS_ADOBE} (baru 0).`);
    expect(notes[1].message).toBe('Pilih satu kategori.');
  });

  it('judul > 70 (batas CSV) disebut; koma di judul disebut', () => {
    const over = validateMetadata('adobe', adobe({ title: 'x'.repeat(MAX_TITLE_CSV + 1), keywords: kws(5), category: 'Kopi' }));
    expect(over).toEqual([{ field: 'title', message: `Judul ${MAX_TITLE_CSV + 1} karakter — melebihi batas CSV ${MAX_TITLE_CSV} karakter.` }]);

    const comma = validateMetadata('adobe', adobe({ title: 'Kopi, teh', keywords: kws(5), category: 'Kopi' }));
    expect(comma).toEqual([{ field: 'title', message: 'Judul mengandung koma — CSV Adobe tanpa koma, ganti dengan spasi.' }]);
  });

  it('nama file > 30 karakter disebut untuk Adobe saja', () => {
    const long = `foto-${'x'.repeat(30)}.jpg`;
    expect(long.length).toBeGreaterThan(MAX_FILENAME);
    const adobeNotes = validateMetadata(
      'adobe', adobe({ title: 'Judul bagus', keywords: kws(5), category: 'Kopi' }), long
    );
    expect(adobeNotes).toEqual([
      { field: 'filename', message: `Nama file ${long.length} karakter — batas CSV ${MAX_FILENAME} karakter (termasuk ekstensi).` }
    ]);

    const shutterNotes = validateMetadata(
      'shutterstock',
      shutter({ description: 'kalimat utuh yang cukup panjang', keywords: kws(7), categories: ['Makanan'] }),
      long
    );
    expect(shutterNotes).toEqual([]);
  });

  it('judul tepat 70 tidak disebut; kata kunci > 50 disebut', () => {
    const notes = validateMetadata('adobe', adobe({ title: 'x'.repeat(MAX_TITLE_CSV), keywords: kws(MAX_KEYWORDS + 1), category: 'Kopi' }));
    expect(fields(notes)).toEqual(['keywords']);
    expect(notes[0].message).toBe(`Kata kunci ${MAX_KEYWORDS + 1} — maksimal ${MAX_KEYWORDS}.`);
  });

  it('lengkap dan ideal → []', () => {
    expect(validateMetadata('adobe', adobe({ title: 'Judul bagus', keywords: kws(5), category: 'Kopi' }))).toEqual([]);
  });
});

describe('validateMetadata — Shutterstock', () => {
  it('metadata kosong → kata kunci < 7 dan kategori utama', () => {
    const notes = validateMetadata('shutterstock', shutter());
    expect(fields(notes)).toEqual(['keywords', 'categories']);
    expect(notes[0].message).toBe(`Kata kunci minimal ${MIN_KEYWORDS_SHUTTER} (baru 0).`);
    expect(notes[1].message).toBe('Pilih kategori utama.');
  });

  it('deskripsi < 5 kata (tapi > 0) disarankan; kata nol tidak (diisi generate nanti)', () => {
    const few = validateMetadata('shutterstock', shutter({ description: 'satu dua tiga', keywords: kws(7), categories: ['Makanan'] }));
    expect(fields(few)).toEqual(['description']);
    expect(few[0].message).toBe(`Deskripsi minimal ${MIN_DESCRIPTION_WORDS} kata (baru 3).`);

    const empty = validateMetadata('shutterstock', shutter({ keywords: kws(7), categories: ['Makanan'] }));
    expect(empty).toEqual([]);
  });

  it('deskripsi > 200 karakter disebut', () => {
    const desc = `${'kalimat deskriptif yang cukup panjang untuk melewati batas. '.repeat(6).trim()}x`.slice(0, MAX_DESCRIPTION + 1);
    const notes = validateMetadata('shutterstock', shutter({ description: desc, keywords: kws(7), categories: ['Makanan'] }));
    expect(notes).toEqual([
      { field: 'description', message: `Deskripsi ${MAX_DESCRIPTION + 1} karakter — maksimal ${MAX_DESCRIPTION}.` }
    ]);
  });

  it('deskripsi mirip daftar kata (banyak koma, sedikit kata) disarankan', () => {
    const notes = validateMetadata('shutterstock', shutter({ description: 'kopi, teh, jus, roti, air', keywords: kws(7), categories: ['Makanan'] }));
    expect(notes).toEqual([
      { field: 'description', message: 'Deskripsi terlihat seperti daftar kata — tulis kalimat utuh.' }
    ]);
  });

  it('deskripsi kalimat utuh ≥ 5 kata tanpa daftar koma → tanpa saran deskripsi', () => {
    const notes = validateMetadata('shutterstock', shutter({
      description: 'Secangkir kopi hangat di pagi hari dengan aroma yang menenangkan.',
      keywords: kws(7),
      categories: ['Makanan']
    }));
    expect(notes).toEqual([]);
  });

  it('kata kunci > 50 dan kategori kosong disebut', () => {
    const notes = validateMetadata('shutterstock', shutter({ description: 'kalimat utuh yang cukup panjang', keywords: kws(MAX_KEYWORDS + 1) }));
    expect(fields(notes)).toEqual(['keywords', 'categories']);
    expect(notes[0].message).toBe(`Kata kunci ${MAX_KEYWORDS + 1} — maksimal ${MAX_KEYWORDS}.`);
  });
});
