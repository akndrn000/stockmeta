// OpenRouter (OpenAI-compatible) — cadangan bila Groq/Gemini habis kuota. Free tier sangat
// terbatas (±20 request/hari tanpa isi saldo) dan modelnya SATU alias tetap 'openrouter/free'
// (lihat models.ts) — tanpa daftar model atau pemilihan model dinamis di sisi aplikasi.
// Tes koneksi = GET /api/v1/models (ringan, tanpa biaya token); generate = POST /chat/completions.
// Key dikirim lewat header Authorization dan TIDAK PERNAH dicetak ke log.
import { buildMetadataPrompt, parseMetadataResponse } from '../prompt';
import type { ParsedMetadata } from '../prompt';
import { readBody } from './http';
import { OPENROUTER_MODEL } from './models';
import { MODEL_RETRY_MAX, ProviderError, dailyQuotaError, isDailyQuota, parseRetryAfter, withRetry } from './retry';
import type { GenerateArgs, ProviderAdapter, TestResult } from './types';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function openrouterMessage(data: unknown): string {
  const err: unknown = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: unknown }).error
    : undefined;
  // OpenRouter memakai dua bentuk: {"error":{"message":"…"}} (gaya OpenAI) atau {"error":"…"}
  if (typeof err === 'string') return err.trim();
  const msg = err && typeof err === 'object' && 'message' in err
    ? (err as { message?: unknown }).message
    : undefined;
  return typeof msg === 'string' ? msg.trim() : '';
}

function openrouterErrorMessage(status: number, data: unknown, raw: string): string {
  const msg = openrouterMessage(data);
  if (msg) return msg;
  if (status === 401 || status === 403) return 'Key salah — API key ditolak OpenRouter.';
  if (status === 429) return 'Batas kuota tercapai (429) — coba lagi nanti.';
  if (status === 402) return 'Kredit tidak cukup (402) — free tier OpenRouter mungkin sedang penuh.';
  // body non-JSON (mis. halaman error gateway) → pesan generik, jangan tampilkan potongan mentah
  if (raw && !data) return `Respons tidak terbaca dari OpenRouter${status ? ` (HTTP ${status}).` : '.'}`;
  if (status) return 'OpenRouter menolak permintaan (' + status + ').';
  return 'Koneksi gagal.';
}

/** Respons gagal → ProviderError; 429 kuota harian TIDAK di-retry (pesan jelas + fallback). */
function openrouterHttpError(status: number, data: unknown, raw: string, headers: Headers): ProviderError {
  if (isDailyQuota(status, raw)) return dailyQuotaError('OpenRouter', 'Groq');
  return new ProviderError(openrouterErrorMessage(status, data, raw), {
    status,
    retryAfterMs: parseRetryAfter(headers, raw)
  });
}

async function testConnection(apiKey: string, signal?: AbortSignal): Promise<TestResult> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_BASE + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      signal
    });
  } catch {
    return { ok: false, message: 'Tidak ada koneksi ke server OpenRouter.' };
  }
  const { data, raw } = await readBody(res);
  if (!res.ok) return { ok: false, message: openrouterErrorMessage(res.status, data, raw) };
  const models = data && typeof data === 'object' ? (data as { data?: unknown }).data : undefined;
  if (!Array.isArray(models) || !models.length) {
    return { ok: false, message: 'Key diterima, tapi tidak ada model yang bisa dipakai.' };
  }
  return { ok: true };
}

async function generateForImage(args: GenerateArgs): Promise<ParsedMetadata> {
  const { apiKey, image, platform, theme, signal, onWait } = args;
  const prompt = buildMetadataPrompt({ platform, theme });

  return withRetry(async () => {
    // response_format diharapkan OpenAI-compatible; sebagian model gratis menolaknya (400/422)
    // → ulangi sekali TANPA parameter itu, hasilnya tetap dibersihkan parseMetadataResponse.
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        const body: Record<string, unknown> = {
          model: OPENROUTER_MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: 'data:' + image.mimeType + ';base64,' + image.base64 } }
          ] }]
        };
        if (attempt === 0) body.response_format = { type: 'json_object' };
        res = await fetch(OPENROUTER_BASE + '/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
          body: JSON.stringify(body),
          signal
        });
      } catch {
        const aborted = Boolean(signal?.aborted);
        throw new ProviderError(aborted ? 'Dibatalkan' : 'Tidak ada koneksi ke server OpenRouter.', { retryable: !aborted });
      }

      const { data, raw } = await readBody(res);
      if (!res.ok && attempt === 0 && (res.status === 400 || res.status === 422)) continue;

      if (!res.ok) throw openrouterHttpError(res.status, data, raw, res.headers);
      if (!data) throw new ProviderError('JSON tidak valid', { retryable: true, maxRetries: MODEL_RETRY_MAX });

      const choice = (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0];
      const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      if (!text.trim()) throw new ProviderError('Respons kosong', { retryable: true, maxRetries: MODEL_RETRY_MAX });

      return parseMetadataResponse(text, platform);   // fence ```json ikut dibersihkan parser
    }
  }, { onWait, signal });
}

export const openrouter: ProviderAdapter = { id: 'openrouter', testConnection, generateForImage };
