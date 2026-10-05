import { describe, expect, it } from 'vitest';
import { indonesianKeywordRatio, isIndonesianKeyword, looksIndonesian } from './language';

describe('looksIndonesian', () => {
  it('kalimat Indonesia → true', () => {
    expect(looksIndonesian('Seorang pria dengan topi sedang berjalan di pasar')).toBe(true);
    expect(looksIndonesian('Kucing yang lucu itu sedang tidur')).toBe(true);
  });

  it('kalimat Inggris → false', () => {
    expect(looksIndonesian('A red fox running through autumn leaves at sunrise')).toBe(false);
    expect(looksIndonesian('Fish and chips on a table')).toBe(false);
  });

  it('campuran: dua kata fungsi Indonesia → true', () => {
    expect(looksIndonesian('A cat yang sedang tidur on the mat')).toBe(true);
  });

  it('satu kata lemah saja belum cukup', () => {
    expect(looksIndonesian('Digital art')).toBe(false);
  });
});

describe('isIndonesianKeyword / ratio', () => {
  it('keyword berisi kata fungsi → true', () => {
    expect(isIndonesianKeyword('dengan')).toBe(true);
    expect(isIndonesianKeyword('orang')).toBe(true);
  });

  it('keyword Inggris → false', () => {
    expect(isIndonesianKeyword('sunrise')).toBe(false);
    expect(isIndonesianKeyword('red fox')).toBe(false);
  });

  it('rasio >20% terhitung', () => {
    const kws = ['sunrise', 'dengan', 'lake', 'yang', 'hills', 'morning', 'water', 'calm', 'light', 'sky'];
    expect(indonesianKeywordRatio(kws)).toBe(0.2);
    expect(indonesianKeywordRatio([...kws, 'untuk'])).toBeGreaterThan(0.2);
  });
});
