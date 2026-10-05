import { describe, expect, it } from 'vitest';
import { THEME_MAX_LENGTH } from './limits';
import { effectiveTheme, normalizeTheme, validateTheme } from './theme';

describe('normalizeTheme', () => {
  it('trim + rapikan spasi ganda/newline', () => {
    expect(normalizeTheme('  Halloween   Party\n')).toBe('Halloween Party');
    expect(normalizeTheme('')).toBe('');
  });
});

describe('validateTheme — tema opsional', () => {
  it('kosong → valid (generate jalan tanpa tema)', () => {
    expect(validateTheme('')).toEqual({ ok: true, message: '' });
    expect(validateTheme('   ')).toEqual({ ok: true, message: '' });
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

  it('keduanya kosong → kosong (tetap valid karena opsional)', () => {
    expect(effectiveTheme('', '')).toBe('');
    expect(validateTheme(effectiveTheme('', ''))).toEqual({ ok: true, message: '' });
  });
});
