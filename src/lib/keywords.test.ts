import { describe, expect, it } from 'vitest';
import { addKeywords, keywordsToPlain, parseKeywordInput, removeKeyword } from './keywords';
import { MAX_KEYWORDS } from './limits';

describe('parseKeywordInput', () => {
  it('memecah koma / baris baru, trim, buang kosong', () => {
    expect(parseKeywordInput('kopi, teh\njus ,  ,\tair')).toEqual(['kopi', 'teh', 'jus', 'air']);
  });

  it('teks kosong / pemisah saja → []', () => {
    expect(parseKeywordInput('')).toEqual([]);
    expect(parseKeywordInput(' , \n ,')).toEqual([]);
  });
});

describe('addKeywords', () => {
  it('menambah, dedupe case-insensitive (kata pertama menang)', () => {
    const r = addKeywords(['Kopi'], ['kopi', 'KOPI', 'teh']);
    expect(r.list).toEqual(['Kopi', 'teh']);
    expect(r.addedCount).toBe(1);
    expect(r.skippedDuplicate).toBe(2);
    expect(r.skippedOverLimit).toBe(0);
  });

  it('memotong di max, sisa dihitung skippedOverLimit', () => {
    const current = Array.from({ length: MAX_KEYWORDS - 1 }, (_, i) => `k${i}`);
    const r = addKeywords(current, ['baru1', 'baru2', 'baru3']);
    expect(r.list).toHaveLength(MAX_KEYWORDS);
    expect(r.list[MAX_KEYWORDS - 1]).toBe('baru1');
    expect(r.addedCount).toBe(1);
    expect(r.skippedOverLimit).toBe(2);
  });

  it('kata kosong setelah trim diabaikan tanpa dihitung apa pun', () => {
    const r = addKeywords([], ['  ', '']);
    expect(r.list).toEqual([]);
    expect(r.addedCount + r.skippedDuplicate + r.skippedOverLimit).toBe(0);
  });

  it('duplikat saat sudah penuh dihitung duplikat, bukan over limit', () => {
    const full = Array.from({ length: MAX_KEYWORDS }, (_, i) => `k${i}`);
    const r = addKeywords(full, ['K0', 'k99']);
    expect(r.skippedDuplicate).toBe(1);
    expect(r.skippedOverLimit).toBe(1);
    expect(r.list).toHaveLength(MAX_KEYWORDS);
  });
});

describe('removeKeyword / keywordsToPlain', () => {
  it('menghapus berdasarkan indeks tanpa memutasi input', () => {
    const list = ['a', 'b', 'c'];
    expect(removeKeyword(list, 1)).toEqual(['a', 'c']);
    expect(removeKeyword(list, 99)).toEqual(['a', 'b', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('menyambung dengan ", " untuk tempel ke platform', () => {
    expect(keywordsToPlain(['kopi', 'teh'])).toBe('kopi, teh');
    expect(keywordsToPlain([])).toBe('');
  });
});
