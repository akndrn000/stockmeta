import { describe, expect, it, vi } from 'vitest';
import { generateWithEnglishRetry, needsEnglishRetry } from './englishRetry';

describe('needsEnglishRetry', () => {
  it('deskripsi Indonesia → true; Inggris → false', () => {
    expect(
      needsEnglishRetry({ description: 'Seorang pria dengan topi sedang berjalan di pasar' }, 'shutterstock')
    ).toBe(true);
    expect(
      needsEnglishRetry({ description: 'A man wearing a hat walking through a morning market' }, 'shutterstock')
    ).toBe(false);
  });

  it('>20% keyword Indonesia → true', () => {
    const kws = ['sunrise', 'dengan', 'lake', 'yang', 'hills', 'morning', 'water', 'calm', 'light', 'sky', 'untuk'];
    expect(needsEnglishRetry({ keywords: kws }, 'adobe')).toBe(true);
  });
});

describe('generateWithEnglishRetry — tepat satu kali', () => {
  it('hasil Inggris langsung → 1 panggilan', async () => {
    const gen = vi.fn(async (_fix: boolean) => {
      void _fix;
      return { title: 'A red fox at sunrise' };
    });
    const r = await generateWithEnglishRetry(gen, 'adobe');
    expect(r.calls).toBe(1);
    expect(r.retried).toBe(false);
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith(false);
  });

  it('hasil Indonesia → retry sekali dengan languageFix, lalu berhenti walau masih Indonesia', async () => {
    const gen = vi.fn(async (fix: boolean) =>
      fix
        ? { title: 'Seorang pria dengan topi yang berjalan' }
        : { title: 'Seorang pria dengan topi yang berjalan di pasar' }
    );
    const r = await generateWithEnglishRetry(gen, 'adobe');
    expect(r.calls).toBe(2);
    expect(r.retried).toBe(true);
    expect(gen).toHaveBeenCalledTimes(2);
    expect(gen.mock.calls[1][0]).toBe(true);
  });
});
