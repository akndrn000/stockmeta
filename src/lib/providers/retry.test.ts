import { describe, expect, it } from 'vitest';
import { parseMetadataResponse } from '../prompt';
import { BATCH_DELAY_MS, MAX_ATTEMPTS_DEFAULT, ProviderError, dailyQuotaError, isDailyQuota, parseRetryAfter, withRetry } from './retry';
import type { WaitInfo } from './retry';

function fakeSleep() {
  const calls: number[] = [];
  return { calls, sleep: async (ms: number) => { calls.push(ms); } };
}

describe('withRetry', () => {
  it('sukses di percobaan ke-3 (503 → backoff 5 detik lalu 10 detik + jitter)', async () => {
    const { calls, sleep } = fakeSleep();
    let n = 0;
    const out = await withRetry(async () => {
      n++;
      if (n < 3) throw new ProviderError('API 503', { status: 503 });
      return 'ok';
    }, { sleep });
    expect(out).toBe('ok');
    expect(n).toBe(3);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBeGreaterThanOrEqual(5000);
    expect(calls[0]).toBeLessThan(6000);
    expect(calls[1]).toBeGreaterThanOrEqual(10000);
    expect(calls[1]).toBeLessThan(11000);
  });

  it('429 memakai retryAfterMs dari header + onWait dipanggil sebelum tunggu', async () => {
    const retryAfterMs = parseRetryAfter(new Headers({ 'retry-after': '7' }));
    expect(retryAfterMs).toBe(7000);
    const { calls, sleep } = fakeSleep();
    const waits: WaitInfo[] = [];
    let n = 0;
    await withRetry(async () => {
      n++;
      if (n < 2) throw new ProviderError('Batas kuota tercapai (429) — coba lagi nanti.', { status: 429, retryAfterMs });
      return 'ok';
    }, { sleep, onWait: (i) => waits.push(i) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBeGreaterThanOrEqual(7000);
    expect(calls[0]).toBeLessThan(8000);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toMatchObject({ attempt: 1, maxAttempts: 3, reason: 'HTTP 429', waitMs: calls[0] });
  });

  it('retry-after > 120 detik → gagal cepat, tanpa menunggu', async () => {
    const { calls, sleep } = fakeSleep();
    const err = await withRetry(async () => {
      throw new ProviderError('Batas kuota tercapai (429) — coba lagi nanti.', { status: 429, retryAfterMs: 180000 });
    }, { sleep }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as Error).message).toBe('Kuota harian/limit panjang tercapai, coba lagi nanti (~3 menit)');
    expect(calls).toHaveLength(0);
  });

  it('400 tidak di-retry', async () => {
    const { calls, sleep } = fakeSleep();
    let n = 0;
    await expect(withRetry(async () => {
      n++;
      throw new ProviderError('Key salah — API key ditolak Gemini.', { status: 400 });
    }, { sleep })).rejects.toThrow('Key salah — API key ditolak Gemini.');
    expect(n).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('JSON tidak valid → maksimal 2 retry (3 panggilan)', async () => {
    const { calls, sleep } = fakeSleep();
    let n = 0;
    await expect(withRetry(async () => {
      n++;
      parseMetadataResponse('bukan json', 'adobe');
      return 'tidak sampai';
    }, { sleep })).rejects.toThrow('JSON tidak valid');
    expect(n).toBe(3);
    expect(calls).toHaveLength(2);
  });

  it('error retryable berhenti di maxAttempts (3 panggilan, 2 tunggu)', async () => {
    const { calls, sleep } = fakeSleep();
    let n = 0;
    await expect(withRetry(async () => {
      n++;
      throw new ProviderError('API 503', { status: 503 });
    }, { sleep })).rejects.toThrow('API 503');
    expect(n).toBe(MAX_ATTEMPTS_DEFAULT);
    expect(n).toBe(3);
    expect(calls).toHaveLength(2);
  });

  it('BATCH_DELAY_MS = 3000 (dipakai jeda antar gambar di M8)', () => {
    expect(BATCH_DELAY_MS).toBe(3000);
  });
});

describe('klasifikasi 429 — menit vs harian', () => {
  const DAILY_BODIES = [
    '{"error":{"code":429,"message":"Quota exceeded for quota metric and limit","status":"RESOURCE_EXHAUSTED"}}',
    '{"error":{"message":"You have exceeded your usage limit for today. Please try again tomorrow"}}',
    'Kuota harian untuk endpoint ini habis',
    'limit reached per day, try tomorrow'
  ];
  const MINUTE_BODIES = [
    '{"error":{"message":"Rate limit reached, please try again in 7.5s"}}',
    'Too many requests — slow down',
    ''
  ];

  it('RESOURCE_EXHAUSTED / pesan kuota per hari → kuota HARIAN', () => {
    for (const body of DAILY_BODIES) expect(isDailyQuota(429, body), body).toBe(true);
  });

  it('limit per menit (tanpa kata harian) → bukan kuota harian', () => {
    for (const body of MINUTE_BODIES) expect(isDailyQuota(429, body), body).toBe(false);
  });

  it('status bukan 429 → bukan kuota harian', () => {
    expect(isDailyQuota(503, 'RESOURCE_EXHAUSTED per day')).toBe(false);
    expect(isDailyQuota(403, 'kuota harian')).toBe(false);
  });

  it('429 kuota harian → TIDAK di-retry (1 panggilan, tanpa tunggu), pesan jelas', async () => {
    const { calls, sleep } = fakeSleep();
    let n = 0;
    await expect(withRetry(async () => {
      n++;
      throw dailyQuotaError('Gemini', 'Groq');
    }, { sleep })).rejects.toThrow('Kuota harian Gemini habis, coba lagi besok atau pakai Groq.');
    expect(n).toBe(1);
    expect(calls).toHaveLength(0);
  });

  it('429 per menit → tetap di-retry sampai batas 3 percobaan', async () => {
    const { calls, sleep } = fakeSleep();
    let n = 0;
    await expect(withRetry(async () => {
      n++;
      throw new ProviderError('Batas kuota tercapai (429) — coba lagi nanti.', { status: 429 });
    }, { sleep })).rejects.toThrow('Batas kuota tercapai (429)');
    expect(n).toBe(3);
    expect(calls).toHaveLength(2);
  });
});

describe('parseRetryAfter', () => {
  it('header detik', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': '7' }))).toBe(7000);
  });

  it('header HTTP-date', () => {
    const when = new Date(Date.now() + 10000).toUTCString();
    const ms = parseRetryAfter(new Headers({ 'retry-after': when }));
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThanOrEqual(10000);
  });

  it('gaya Groq: "try again in 7.5s"', () => {
    const body = JSON.stringify({ error: { message: 'Rate limit reached, please try again in 7.5s' } });
    expect(parseRetryAfter(new Headers(), body)).toBe(7500);
  });

  it('gaya Groq: "retry in 1m30s" dan "in 2m"', () => {
    expect(parseRetryAfter(new Headers(), 'slow down, retry in 1m30s')).toBe(90000);
    expect(parseRetryAfter(new Headers(), 'please retry in 2m')).toBe(120000);
  });

  it('retryDelay gaya Google RetryInfo', () => {
    const body = '{"error":{"details":[{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay":"34s"}]}}';
    expect(parseRetryAfter(new Headers(), body)).toBe(34000);
  });

  it('tanpa info waktu → undefined', () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined();
    expect(parseRetryAfter(new Headers(), 'ada error tapi tanpa waktu')).toBeUndefined();
  });
});
