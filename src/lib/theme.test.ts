import { describe, expect, it } from 'vitest';
import { THEME_MAX_LENGTH, THEME_MIN_LENGTH } from './limits';
import { effectiveTheme, normalizeTheme, validateTheme } from './theme';

describe('normalizeTheme', () => {
  it('trim + rapikan spasi ganda/newline', () => {
    expect(normalizeTheme('  Halloween   Party\n')).toBe('Halloween Party');
    expect(normalizeTheme('')).toBe('');
  });
});

describe('validateTheme — tema kini wajib', () => {
  it('kosong → tidak valid dengan pesan wajib', () => {
    expect(validateTheme('')).toEqual({
      ok: false,
      message: `Tema utama wajib diisi (${THEME_MIN_LENGTH}–${THEME_MAX_LENGTH} karakter).`
    });
    expect(validateTheme('   ')).toMatchObject({ ok: false });
  });

  it('terlalu pendek / terlalu panjang → tidak valid', () => {
    expect(validateTheme('a')).toMatchObject({ ok: false });
    expect(validateTheme('x'.repeat(THEME_MAX_LENGTH + 1))).toMatchObject({ ok: false });
  });

  it('batas 2–60 valid', () => {
    expect(validateTheme('ab')).toEqual({ ok: true, message: '' });
    expect(validateTheme('x'.repeat(THEME_MAX_LENGTH))).toEqual({ ok: true, message: '' });
    expect(validateTheme('  Halloween Party  ')).toEqual({ ok: true, message: '' });
  });
});

describe('effectiveTheme — override per frame atau tema batch', () => {
  it('override per frame dipakai bila diisi', () => {
    expect(effectiveTheme('Batch Theme', 'Frame Theme')).toBe('Frame Theme');
  });

  it('override kosong → pakai tema batch', () => {
    expect(effectiveTheme('Batch Theme', '')).toBe('Batch Theme');
    expect(effectiveTheme('Batch Theme')).toBe('Batch Theme');
  });

  it('keduanya kosong → kosong (tidak valid)', () => {
    expect(effectiveTheme('', '')).toBe('');
    expect(validateTheme(effectiveTheme('', ''))).toMatchObject({ ok: false });
  });
});
