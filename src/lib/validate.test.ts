import { describe, expect, it } from 'vitest';
import {
  ADOBE_KEYWORDS_MAX,
  ADOBE_KEYWORDS_MIN,
  ADOBE_TITLE_MAX,
  ADOBE_TITLE_SUGGEST_MAX,
  SS_DESCRIPTION_MAX_CHARS,
  SS_DESCRIPTION_MIN_WORDS,
  SS_KEYWORDS_MAX,
  SS_KEYWORDS_MIN
} from './platform-rules';
import { AUTO_CATEGORY_MSG, countUniqueKeywords, findStemRepeats, validateMetadata } from './validate';
import type { AdobeMetadata, ShutterstockMetadata } from './types';

const adobe = (patch: Partial<AdobeMetadata> = {}): AdobeMetadata => ({
  title: 'Red panda eating bamboo in forest',
  keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife'],
  category: 'Animals',
  ...patch
});
const shutter = (patch: Partial<ShutterstockMetadata> = {}): ShutterstockMetadata => ({
  description: 'A red panda eats bamboo in a green mountain forest during daylight.',
  keywords: ['red panda', 'bamboo', 'forest', 'wildlife', 'mammal', 'nature', 'eating'],
  categories: ['Animals/Wildlife'],
  ...patch
});
const kws = (n: number) => Array.from({ length: n }, (_, i) => `keyword${i}`);
/** 25 keyword mencakup kata judul (lolos target 25-35 + title-words) */
const goodKws = (): string[] => ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', ...kws(20)];
const goodAdobe = (patch: Partial<AdobeMetadata> = {}): AdobeMetadata =>
  adobe({ keywords: goodKws(), ...patch });
/** judul sepanjang n yang tetap memuat kata keyword (overlap title-words lolos) */
const titleOf = (n: number): string => ('red panda bamboo forest eating wildlife '.repeat(30)).slice(0, n);
const rules = (issues: { rule: string }[]) => issues.map((i) => i.rule);

describe('validateMetadata — Adobe title', () => {
  it('70 ok; 71 peringatan; 200 peringatan; 201 error pemblokir', () => {
    expect(validateMetadata('adobe', goodAdobe({ title: titleOf(ADOBE_TITLE_SUGGEST_MAX) }))).toEqual({ errors: [], warnings: [] });
    const w71 = validateMetadata('adobe', goodAdobe({ title: titleOf(ADOBE_TITLE_SUGGEST_MAX + 1) }));
    expect(w71.errors).toEqual([]);
    expect(rules(w71.warnings)).toContain('ADOBE_TITLE_LEN');
    const w200 = validateMetadata('adobe', goodAdobe({ title: titleOf(ADOBE_TITLE_MAX) }));
    expect(rules(w200.errors)).not.toContain('ADOBE_TITLE_LEN');
    expect(rules(w200.warnings)).toContain('ADOBE_TITLE_LEN');
    const e201 = validateMetadata('adobe', goodAdobe({ title: titleOf(ADOBE_TITLE_MAX + 1) }));
    expect(rules(e201.errors)).toContain('ADOBE_TITLE_LEN');
  });

  it('koma/kutip di judul → peringatan berisi hasil sanitasi, data tidak dipotong', () => {
    const r = validateMetadata('adobe', adobe({ title: 'Kucing, "merah" di meja' }));
    expect(rules(r.warnings)).toContain('ADOBE_TITLE_COMMA');
    expect(r.warnings.find((w) => w.rule === 'ADOBE_TITLE_COMMA')?.message).toContain('Kucing merah di meja');
    expect(r.errors).toEqual([]);
  });

  it('"photo of" di awal judul → peringatan; daftar kata → peringatan', () => {
    const photo = validateMetadata('adobe', adobe({ title: 'Photo of a red panda' }));
    expect(rules(photo.warnings)).toContain('ADOBE_TITLE_WORDS');
    const list = validateMetadata('adobe', adobe({ title: 'panda, bamboo, forest, cute' }));
    expect(rules(list.warnings)).toContain('ADOBE_TITLE_WORDS');
  });

  it('judul kosong → error', () => {
    const r = validateMetadata('adobe', adobe({ title: '' }));
    expect(rules(r.errors)).toContain('ADOBE_TITLE_LEN');
  });
});

describe('validateMetadata — Adobe keywords', () => {
  it('4 error; 5 lolos; 49 lolos; 50 error (dihitung setelah dedupe)', () => {
    expect(rules(validateMetadata('adobe', adobe({ keywords: kws(4) })).errors)).toContain('ADOBE_KEYWORDS_RANGE');
    expect(validateMetadata('adobe', adobe({ keywords: kws(5) })).errors).toEqual([]);
    expect(validateMetadata('adobe', adobe({ keywords: kws(ADOBE_KEYWORDS_MAX) })).errors).toEqual([]);
    expect(rules(validateMetadata('adobe', adobe({ keywords: kws(ADOBE_KEYWORDS_MAX + 1) })).errors)).toContain('ADOBE_KEYWORDS_RANGE');
    expect(ADOBE_KEYWORDS_MIN).toBe(5);
    expect(ADOBE_KEYWORDS_MAX).toBe(49);
  });

  it('duplikat case-insensitive dihitung sekali (terlihat via jumlah unik)', () => {
    expect(countUniqueKeywords(['Kucing', 'kucing', 'KUCING', 'meja'])).toBe(2);
    const r = validateMetadata('adobe', adobe({ keywords: ['Kucing', 'kucing', 'KUCING', 'meja', 'panda'] }));
    expect(rules(r.errors)).toContain('ADOBE_KEYWORDS_RANGE');
  });

  it('10 pertama tanpa kata judul → peringatan', () => {
    const ok = validateMetadata('adobe', adobe({ title: 'Red panda eating bamboo' }));
    expect(rules(ok.warnings)).not.toContain('ADOBE_KEYWORDS_TITLE_WORDS');
    const bad = validateMetadata('adobe', adobe({ title: 'Red panda eating bamboo', keywords: kws(10) }));
    expect(rules(bad.warnings)).toContain('ADOBE_KEYWORDS_TITLE_WORDS');
  });

  it('data teknis → peringatan TECH_DATA', () => {
    const r = validateMetadata('adobe', adobe({ keywords: ['sunset', 'beach', 'iso 100', 'sky', 'sea'] }));
    expect(rules(r.warnings)).toContain('TECH_DATA');
  });
});

describe('validateMetadata — Adobe kategori & merek & bahasa', () => {
  it('kategori kosong/invalid → error; categoryAuto → warning', () => {
    expect(rules(validateMetadata('adobe', adobe({ category: '' })).errors)).toContain('ADOBE_CATEGORY');
    expect(rules(validateMetadata('adobe', adobe({ category: 'Kopi' })).errors)).toContain('ADOBE_CATEGORY');
    const auto = validateMetadata('adobe', goodAdobe({ category: 'Animals', categoryAuto: true }));
    expect(auto.errors).toEqual([]);
    expect(auto.warnings.map((w) => w.message)).toContain(AUTO_CATEGORY_MSG);
  });

  it('merek, nama berkapital, label AI, kata Indonesia → peringatan', () => {
    const brand = validateMetadata('adobe', adobe({ title: 'Nike shoes on track field' }));
    expect(rules(brand.warnings)).toContain('IP_BRAND');
    const person = validateMetadata('adobe', adobe({ keywords: ['sunset', 'beach', 'John Smith', 'sky', 'sea'] }));
    expect(rules(person.warnings)).toContain('IP_PERSON_ARTIST_CHARACTER');
    const ai = validateMetadata('adobe', adobe({ title: 'AI generated red panda' }));
    expect(rules(ai.warnings)).toContain('AI_LABEL_IN_TEXT');
    const id = validateMetadata('adobe', adobe({ title: 'Kucing yang lucu di taman' }));
    expect(rules(id.warnings)).toContain('LANGUAGE_EN');
  });

  it('ekstensi tak umum → peringatan filename', () => {
    const r = validateMetadata('adobe', adobe(), 'foto.bmp');
    expect(rules(r.warnings)).toContain('FILENAME_MATCH');
    expect(rules(validateMetadata('adobe', adobe(), 'foto.jpeg').warnings)).not.toContain('FILENAME_MATCH');
  });
});

describe('validateMetadata — Shutterstock', () => {
  it('deskripsi 4 kata error; 5 kata lolos; 2048 ok; 2049 error', () => {
    expect(rules(validateMetadata('shutterstock', shutter({ description: 'satu dua tiga empat' })).errors)).toContain('SS_DESC_LEN');
    expect(validateMetadata('shutterstock', shutter()).errors).toEqual([]);
    const ok = 'kata '.repeat(400).trim(); // 400 kata, < 2048 karakter
    expect(ok.length).toBeLessThanOrEqual(SS_DESCRIPTION_MAX_CHARS);
    expect(rules(validateMetadata('shutterstock', shutter({ description: ok })).errors)).not.toContain('SS_DESC_LEN');
    const over = 'x'.repeat(SS_DESCRIPTION_MAX_CHARS + 1);
    expect(rules(validateMetadata('shutterstock', shutter({ description: over })).errors)).toContain('SS_DESC_LEN');
    expect(SS_DESCRIPTION_MIN_WORDS).toBe(5);
    expect(SS_DESCRIPTION_MAX_CHARS).toBe(2048);
  });

  it('daftar kata sebagai deskripsi → error kalimat', () => {
    const r = validateMetadata('shutterstock', shutter({ description: 'kopi, teh, jus, roti, air' }));
    expect(rules(r.errors)).toContain('SS_DESC_SENTENCE');
  });

  it('target 60-200 karakter di luar itu → peringatan', () => {
    const short = validateMetadata('shutterstock', shutter({ description: 'A red panda eats bamboo shoots daily here.' }));
    expect(rules(short.warnings)).toContain('SS_DESC_LEN');
  });

  it('keyword 6 error; 7 lolos; 50 lolos; 51 error', () => {
    expect(rules(validateMetadata('shutterstock', shutter({ keywords: kws(6) })).errors)).toContain('SS_KEYWORDS_RANGE');
    expect(validateMetadata('shutterstock', shutter()).errors).toEqual([]);
    expect(validateMetadata('shutterstock', shutter({ keywords: kws(SS_KEYWORDS_MAX) })).errors).toEqual([]);
    expect(rules(validateMetadata('shutterstock', shutter({ keywords: kws(SS_KEYWORDS_MAX + 1) })).errors)).toContain('SS_KEYWORDS_RANGE');
    expect(SS_KEYWORDS_MIN).toBe(7);
    expect(SS_KEYWORDS_MAX).toBe(50);
  });

  it('stem berulang → peringatan', () => {
    expect(findStemRepeats(['forest', 'forest trees', 'sunset'])).toHaveLength(1);
    const r = validateMetadata('shutterstock', shutter({ keywords: ['forest', 'forest trees', 'forest path', 'sunset', 'trees', 'nature', 'wild'] }));
    expect(rules(r.warnings)).toContain('SS_KEYWORDS_STEM');
  });

  it('kategori: kosong error; 2 ok; 3 error; nama asing error', () => {
    expect(rules(validateMetadata('shutterstock', shutter({ categories: [] })).errors)).toContain('SS_CATEGORIES');
    expect(validateMetadata('shutterstock', shutter({ categories: ['Nature', 'People'] })).errors).toEqual([]);
    expect(rules(validateMetadata('shutterstock', shutter({ categories: ['Nature', 'People', 'Objects'] })).errors)).toContain('SS_CATEGORIES');
    expect(rules(validateMetadata('shutterstock', shutter({ categories: ['Makanan'] })).errors)).toContain('SS_CATEGORIES');
  });
});
