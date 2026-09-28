import { describe, expect, it } from 'vitest';
import { ADOBE_CATEGORIES, ADOBE_CATEGORY_IDS, SHUTTERSTOCK_CATEGORIES, getCategories, normCat } from './categories';

describe('kategori resmi', () => {
  it('jumlah persis legacy (21 / 26)', () => {
    expect(ADOBE_CATEGORIES).toHaveLength(21);
    expect(SHUTTERSTOCK_CATEGORIES).toHaveLength(26);
  });

  it('ADOBE_CATEGORY_IDS: tiap nama punya nomor unik 1-21', () => {
    const ids = ADOBE_CATEGORIES.map((c) => ADOBE_CATEGORY_IDS[c]);
    expect(ids.every((n) => typeof n === 'number')).toBe(true);
    expect(new Set(ids).size).toBe(21);
    expect(Math.min(...ids)).toBe(1);
    expect(Math.max(...ids)).toBe(21);
  });

  it('getCategories mengikuti platform', () => {
    expect(getCategories('adobe')).toBe(ADOBE_CATEGORIES);
    expect(getCategories('shutterstock')).toBe(SHUTTERSTOCK_CATEGORIES);
  });
});

describe('normCat', () => {
  const adobe = getCategories('adobe');
  const shutter = getCategories('shutterstock');

  it('eksak case-insensitive', () => {
    expect(normCat('buildings and architecture', adobe)).toBe('Buildings and Architecture');
    expect(normCat('ANIMALS', adobe)).toBe('Animals');
  });

  it('irisan kata: Food & Drink → Food and Drink', () => {
    expect(normCat('Food & Drink', shutter)).toBe('Food and Drink');
  });

  it('typo menuju kategori terdekat', () => {
    expect(normCat('buidlings and architecture', adobe)).toBe('Buildings and Architecture');
    expect(normCat('aniamls', adobe)).toBe('Animals');
  });

  it('tidak ada padanan yang layak → null', () => {
    expect(normCat('zzzz qqqq', adobe)).toBeNull();
    expect(normCat('', adobe)).toBeNull();
    expect(normCat(null, adobe)).toBeNull();
  });
});
