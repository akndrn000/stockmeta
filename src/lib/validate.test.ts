import { describe, expect, it } from 'vitest';
import { AUTO_CATEGORY_MSG, KEYWORD_THIN_MSG, SS_COMMA_MSG, validateMetadata } from './validate';
import {
  MAX_DESCRIPTION_SHUTTER,
  MAX_FILENAME,
  MAX_KEYWORDS,
  MAX_KEYWORDS_ADOBE,
  MAX_TITLE_CSV,
  MIN_DESCRIPTION_WORDS,
  MIN_KEYWORDS_ADOBE,
  MIN_KEYWORDS_SHUTTER,
  SS_DESCRIPTION_SUGGEST,
  TARGET_KEYWORDS_MIN
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

  it('judul > 200 (batas CSV resmi) disebut; koma di judul TIDAK disarankan (M24)', () => {
    const over = validateMetadata('adobe', adobe({ title: 'x'.repeat(MAX_TITLE_CSV + 1), keywords: kws(30), category: 'Kopi' }));
    expect(over).toEqual([{ field: 'title', message: `Judul ${MAX_TITLE_CSV + 1} karakter — melebihi batas CSV ${MAX_TITLE_CSV} karakter.` }]);

    const comma = validateMetadata('adobe', adobe({ title: 'Kopi, teh', keywords: kws(30), category: 'Kopi' }));
    expect(comma).toEqual([]);
  });

  it('nama file > 30 karakter disebut untuk Adobe saja', () => {
    const long = `foto-${'x'.repeat(30)}.jpg`;
    expect(long.length).toBeGreaterThan(MAX_FILENAME);
    const adobeNotes = validateMetadata(
      'adobe', adobe({ title: 'Judul bagus', keywords: kws(30), category: 'Kopi' }), long
    );
    expect(adobeNotes).toEqual([
      { field: 'filename', message: `Nama file ${long.length} karakter — batas CSV ${MAX_FILENAME} karakter (termasuk ekstensi).` }
    ]);

    const shutterNotes = validateMetadata(
      'shutterstock',
      shutter({ description: 'A calm lake at sunrise with soft light', keywords: kws(30), categories: ['Abstract', 'Nature'] }),
      long
    );
    expect(shutterNotes).toEqual([]);
  });

  it('judul tepat 200 tidak disebut; kata kunci Adobe > 49 disebut', () => {
    const notes = validateMetadata('adobe', adobe({ title: 'x'.repeat(MAX_TITLE_CSV), keywords: kws(MAX_KEYWORDS_ADOBE + 1), category: 'Kopi' }));
    expect(fields(notes)).toEqual(['keywords']);
    expect(notes[0].message).toBe(`Kata kunci ${MAX_KEYWORDS_ADOBE + 1} — maksimal ${MAX_KEYWORDS_ADOBE}.`);
  });

  it('lengkap dan ideal → []', () => {
    expect(validateMetadata('adobe', adobe({ title: 'Judul bagus', keywords: kws(30), category: 'Kopi' }))).toEqual([]);
  });

  it('M11: kategori terisi tapi categoryAuto → saran periksa, bukan "Pilih satu kategori."', () => {
    const notes = validateMetadata('adobe', adobe({ title: 'Judul bagus', keywords: kws(30), category: 'Animals', categoryAuto: true }));
    expect(notes).toEqual([{ field: 'category', message: AUTO_CATEGORY_MSG }]);
  });
});

describe('validateMetadata — Shutterstock', () => {
  it('metadata kosong → kata kunci < 7 dan kategori utama (pemblokir)', () => {
    const notes = validateMetadata('shutterstock', shutter());
    expect(fields(notes)).toEqual(['keywords', 'categories']);
    expect(notes[0].message).toBe(`Kata kunci minimal ${MIN_KEYWORDS_SHUTTER} (baru 0).`);
    expect(notes[1]).toEqual({ field: 'categories', message: 'Pilih kategori utama.', blocking: true });
  });

  it('deskripsi < 5 kata (tapi > 0) disarankan; kata nol tidak (diisi generate nanti)', () => {
    const cats = ['Abstract', 'Nature'];
    const few = validateMetadata('shutterstock', shutter({ description: 'One two three', keywords: kws(30), categories: cats }));
    expect(fields(few)).toEqual(['description']);
    expect(few[0].message).toBe(`Deskripsi minimal ${MIN_DESCRIPTION_WORDS} kata (baru 3).`);

    const empty = validateMetadata('shutterstock', shutter({ keywords: kws(30), categories: cats }));
    expect(empty).toEqual([]);
  });

  it('M33: deskripsi > 2048 disebut (pagar); 201–250 tanpa saran panjang', () => {
    const over = `${'A calm descriptive sentence long enough to pass the limit. '.repeat(40).trim()}x`.slice(0, MAX_DESCRIPTION_SHUTTER + 1);
    const notes = validateMetadata('shutterstock', shutter({ description: over, keywords: kws(30), categories: ['Abstract', 'Nature'] }));
    expect(notes).toEqual([
      { field: 'description', message: `Deskripsi ${MAX_DESCRIPTION_SHUTTER + 1} karakter — maksimal ${MAX_DESCRIPTION_SHUTTER}.` }
    ]);

    const ideal = 'A calm lake at sunrise with soft light over the hills and trees.';
    const ok = validateMetadata('shutterstock', shutter({ description: ideal, keywords: kws(30), categories: ['Abstract', 'Nature'] }));
    expect(ok).toEqual([]);
  });

  it('M33: deskripsi 251–2048 karakter = saran ideal 100–250 (non-pemblokir)', () => {
    const desc = `${'A calm descriptive sentence with enough words to stay natural. '.repeat(5).trim()}`.slice(0, 300);
    expect(desc.length).toBeGreaterThan(SS_DESCRIPTION_SUGGEST.MAX);
    const notes = validateMetadata('shutterstock', shutter({ description: desc, keywords: kws(30), categories: ['Abstract', 'Nature'] }));
    const hit = notes.find((n) => n.message.includes('idealnya'));
    expect(hit).toBeDefined();
    expect(hit!.blocking).toBeFalsy();
    expect(hit!.message).toContain(`${SS_DESCRIPTION_SUGGEST.MIN}–${SS_DESCRIPTION_SUGGEST.MAX}`);
  });

  it('deskripsi mirip daftar kata (banyak koma, sedikit kata) disarankan + jaring pengaman koma', () => {
    const notes = validateMetadata('shutterstock', shutter({ description: 'coffee, tea, juice, bread, water', keywords: kws(30), categories: ['Abstract', 'Nature'] }));
    expect(notes).toEqual([
      { field: 'description', message: 'Deskripsi terlihat seperti daftar kata — tulis kalimat utuh.' },
      { field: 'description', message: SS_COMMA_MSG }
    ]);
  });

  it('deskripsi berkoma (kalimat utuh tapi lolos pembersihan) → saran koma saja', () => {
    const notes = validateMetadata('shutterstock', shutter({
      description: 'A warm cup of coffee in the morning, with soft golden light and calm mood over the hills.',
      keywords: kws(30),
      categories: ['Abstract', 'Nature']
    }));
    const hit = notes.find((n) => n.message === SS_COMMA_MSG);
    expect(hit).toBeDefined();
    expect(hit!.field).toBe('description');
    expect(hit!.blocking).toBeFalsy();
  });

  it('deskripsi tanpa koma → tanpa saran koma', () => {
    const notes = validateMetadata('shutterstock', shutter({
      description: 'A warm cup of coffee in the morning with soft golden light and calm mood over the hills.',
      keywords: kws(30),
      categories: ['Abstract', 'Nature']
    }));
    expect(notes.find((n) => n.message === SS_COMMA_MSG)).toBeUndefined();
  });

  it('deskripsi kalimat utuh ≥ 5 kata tanpa daftar koma → tanpa saran deskripsi', () => {
    const notes = validateMetadata('shutterstock', shutter({
      description: 'A warm cup of coffee in the morning with soft golden light.',
      keywords: kws(30),
      categories: ['Abstract', 'Nature']
    }));
    expect(notes).toEqual([]);
  });

  it('kata kunci > 50 dan kategori kosong disebut', () => {
    const notes = validateMetadata('shutterstock', shutter({ description: 'A calm lake at sunrise with soft light', keywords: kws(MAX_KEYWORDS + 1) }));
    expect(fields(notes)).toEqual(['keywords', 'categories']);
    expect(notes[0].message).toBe(`Kata kunci ${MAX_KEYWORDS + 1} — maksimal ${MAX_KEYWORDS}.`);
    expect(notes[1].blocking).toBe(true);
  });

  it('M11: kategori terisi tapi categoryAuto → saran periksa, bukan "Pilih kategori utama."', () => {
    const notes = validateMetadata('shutterstock', shutter({
      description: 'A calm lake at sunrise with soft light over the hills and trees',
      keywords: kws(30),
      categories: ['Abstract', 'Nature'],
      categoryAuto: true
    }));
    expect(notes).toEqual([{ field: 'categories', message: AUTO_CATEGORY_MSG }]);
  });

  it('Fase 1: Shutterstock wajib 2 kategori berbeda — satu saja atau duplikat = pemblokir ekspor', () => {
    const one = validateMetadata('shutterstock', shutter({
      description: 'A calm lake at sunrise with soft light over hills',
      keywords: kws(30),
      categories: ['Abstract']
    }));
    expect(fields(one)).toEqual(['categories']);
    expect(one[0].blocking).toBe(true);
    expect(one[0].message).toContain('wajib punya 2 kategori berbeda');

    const dup = validateMetadata('shutterstock', shutter({
      description: 'A calm lake at sunrise with soft light over hills',
      keywords: kws(30),
      categories: ['Abstract', 'Abstract']
    }));
    expect(fields(dup)).toEqual(['categories']);
    expect(dup[0].blocking).toBe(true);
    expect(dup[0].message).toContain('tidak boleh sama');

    const ok = validateMetadata('shutterstock', shutter({
      description: 'A calm lake at sunrise with soft light over hills',
      keywords: kws(30),
      categories: ['Abstract', 'Nature']
    }));
    expect(ok).toEqual([]);
  });

  it('Fase 1: nama file panjang tidak menutupi error kategori (Adobe saja untuk filename)', () => {
    const long = `foto-${'x'.repeat(30)}.jpg`;
    const notes = validateMetadata(
      'shutterstock',
      shutter({ description: 'A calm lake at sunrise with soft light', keywords: kws(30), categories: ['Abstract'] }),
      long
    );
    expect(fields(notes)).toEqual(['categories']);
    expect(notes[0].blocking).toBe(true);
  });
});


describe('validateMetadata - bahasa Inggris (Fase 3)', () => {
  it('judul Adobe Indonesia memblokir ekspor', () => {
    const notes = validateMetadata('adobe', adobe({ title: 'Seorang pria dengan topi yang berjalan di pasar', keywords: kws(30), category: 'People' }));
    const hit = notes.find((x) => x.field === 'title' && x.message.includes('Tulis dalam bahasa Inggris'));
    expect(hit).toBeDefined();
    expect(hit!.blocking).toBe(true);
  });

  it('deskripsi Shutterstock Indonesia memblokir ekspor', () => {
    const notes = validateMetadata('shutterstock', shutter({ description: 'Seorang pria dengan topi yang berjalan di pasar pagi', keywords: kws(30), categories: ['People', 'Nature'] }));
    const hit = notes.find((x) => x.field === 'description' && x.message.includes('Tulis dalam bahasa Inggris'));
    expect(hit).toBeDefined();
    expect(hit!.blocking).toBe(true);
  });

  it('keyword >20% Indonesia = peringatan non-pemblokir', () => {
    const bad = ['sunrise', 'dengan', 'lake', 'yang', 'hills', 'morning', 'water', 'calm', 'light', 'sky', 'untuk'];
    const notes = validateMetadata('shutterstock', shutter({ description: 'A calm lake at sunrise with soft light over the hills and trees', keywords: bad, categories: ['Nature', 'Parks/Outdoor'] }));
    const hit = notes.find((x) => x.field === 'keywords' && x.message.includes('Tulis dalam bahasa Inggris'));
    expect(hit).toBeDefined();
    expect(hit!.blocking).toBeFalsy();
  });
});


describe('validateMetadata - kebijakan 30 (M32)', () => {
  it('di bawah minimum platform = pemblokir ekspor', () => {
    const a = validateMetadata('adobe', adobe({ title: 'A fox rests', keywords: kws(4), category: 'Animals' }));
    const hitA = a.find((x) => x.field === 'keywords' && x.message.includes('minimal 5'));
    expect(hitA).toBeDefined();
    expect(hitA!.blocking).toBe(true);
    const s = validateMetadata('shutterstock', shutter({ description: 'A fox rests in soft light.', keywords: kws(6), categories: ['Nature', 'Parks/Outdoor'] }));
    const hitS = s.find((x) => x.field === 'keywords' && x.message.includes('minimal 7'));
    expect(hitS).toBeDefined();
    expect(hitS!.blocking).toBe(true);
  });

  it('di bawah target 30 = saran non-pemblokir visibilitas (bukan error keras)', () => {
    const notes = validateMetadata('shutterstock', shutter({ description: 'A calm lake at sunrise with soft light over hills.', keywords: kws(12), categories: ['Nature', 'Parks/Outdoor'] }));
    const thin = notes.find((x) => x.message === KEYWORD_THIN_MSG(12));
    expect(thin).toBeDefined();
    expect(thin!.blocking).toBeFalsy();
    expect(thin!.field).toBe('keywords');
    expect(thin!.message).toBe(`Kata kunci kurang dari ${TARGET_KEYWORDS_MIN} — pertimbangkan menambah kata kunci relevan untuk visibilitas pencarian lebih baik.`);
    // Batas keras minimum tetap ada terpisah (bukan pengganti).
    const hard = validateMetadata('shutterstock', shutter({ description: 'A calm lake at sunrise with soft light over hills.', keywords: kws(6), categories: ['Nature', 'Parks/Outdoor'] }));
    expect(hard.find((x) => x.message.includes('minimal 7'))?.blocking).toBe(true);
    expect(hard.find((x) => x.message === KEYWORD_THIN_MSG(6))).toBeDefined();
  });

  it('30+ keyword = tanpa saran tipis', () => {
    const notes = validateMetadata('adobe', adobe({ title: 'A fox rests', keywords: kws(30), category: 'Animals' }));
    expect(notes).toEqual([]);
  });

  it('warnings validator tampil sebagai saran non-pemblokir di keywords', () => {
    const w = "Kata kunci 'black cat' dibuang: warna 'black' tidak ada di fakta visual.";
    const notes = validateMetadata('adobe', adobe({
      title: 'Orange cat', keywords: kws(30), category: 'Animals', warnings: [w]
    }));
    const hit = notes.find((x) => x.field === 'keywords' && x.message === w);
    expect(hit).toBeDefined();
    expect(hit!.blocking).toBeFalsy();
  });

  it('kata generik lolos = saran non-pemblokir (kedua platform)', () => {
    const a = validateMetadata('adobe', adobe({ title: 'A fox rests', keywords: [...kws(30), 'beautiful', 'nice'], category: 'Animals' }));
    const hitA = a.find((x) => x.field === 'keywords' && x.message.includes('beautiful'));
    expect(hitA).toBeDefined();
    expect(hitA!.blocking).toBeFalsy();
    const s = validateMetadata('shutterstock', shutter({ description: 'A calm lake at sunrise with soft light over hills.', keywords: [...kws(30), 'concept'], categories: ['Nature', 'Parks/Outdoor'] }));
    const hitS = s.find((x) => x.field === 'keywords' && x.message.includes('concept'));
    expect(hitS).toBeDefined();
    expect(hitS!.blocking).toBeFalsy();
  });

  it('tanpa kata generik = tanpa saran generik', () => {
    const notes = validateMetadata('adobe', adobe({ title: 'A fox rests', keywords: kws(30), category: 'Animals' }));
    expect(notes).toEqual([]);
  });
});

