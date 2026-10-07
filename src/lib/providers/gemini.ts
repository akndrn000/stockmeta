// Gemini live — port dari legacy/js/providers-gemini.js (endpoint, format request,
// pemetaan error dari BODY respons). SATU model tetap (lihat gemini-config.ts):
// tanpa deteksi otomatis, tanpa daftar model. 429 dibedakan: limit per menit →
// di-retry, kuota harian / kuota GRATIS habis (RESOURCE_EXHAUSTED / free_tier) →
// gagal cepat tanpa retry.
// Key hanya dikirim sebagai query param ke API resmi Google dan TIDAK PERNAH dicetak ke log.
import { buildMetadataPrompt, parseMetadataResponse } from '../prompt';
import type { ParsedMetadata } from '../prompt';
import { GENERATION_MAX_TOKENS, GENERATION_TEMPERATURE } from '../limits';
import { readBody } from './http';
import { GEMINI_MODEL } from './models';
import { MODEL_RETRY_MAX, ProviderError, dailyQuotaError, isDailyQuota, parseRetryAfter, withRetry } from './retry';
import type { GenerateArgs, ProviderAdapter, TestResult } from './types';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** 429 kuota GRATIS habis / model tak tersedia di free tier: tanpa retry, boleh fallback. */
export const GEMINI_FREE_TIER_EXHAUSTED_MESSAGE =
  'Kuota gratis Gemini habis atau model ini tidak gratis untuk key ini. Tunggu reset atau pakai provider lain. Jangan mengaktifkan billing jika ingin tetap gratis.';

/**
 * Heuristik defensif kuota gratis habis (format error asli BELUM terverifikasi live):
 * body memuat "free_tier" (termasuk varian ejaan "freetier"/"free-tier" ala pesan
 * kuota Google seperti "...PerModel-FreeTier...") atau "limit: 0".
 */
function isFreeTierExhausted(bodyText: string): boolean {
  return /free[_-]?tier/i.test(bodyText) || /limit:\s*0/i.test(bodyText);
}

function geminiError(data: unknown): { message: string; blob: string } {
  const err = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: { message?: unknown; details?: unknown } }).error
    : undefined;
  const message = typeof err?.message === 'string' ? err.message : '';
  const details = err?.details !== undefined ? JSON.stringify(err.details) : '';
  return { message, blob: message + ' ' + details };
}

// Gemini melaporkan key salah sebagai HTTP 400 API_KEY_INVALID (bukan 401) — baca body-nya.
function geminiErrorMessage(status: number, data: unknown): string {
  const { message, blob } = geminiError(data);
  if (status === 401 || status === 403 || /api[_ ]key/i.test(blob)) return 'Key salah — API key ditolak Gemini.';
  if (status === 429) return 'Batas kuota tercapai (429) — coba lagi nanti.';
  if (message) return message;
  if (status) return 'Gemini menolak permintaan (' + status + ').';
  return 'Koneksi gagal.';
}

/** Respons gagal → ProviderError; 429 kuota harian/gratis TIDAK di-retry (pesan jelas + fallback). */
function geminiHttpError(status: number, data: unknown, raw: string, headers: Headers): ProviderError {
  if (status === 429 && isFreeTierExhausted(raw)) {
    return new ProviderError(GEMINI_FREE_TIER_EXHAUSTED_MESSAGE, { status, retryable: false, dailyQuota: true });
  }
  if (isDailyQuota(status, raw)) return dailyQuotaError('Gemini', 'Groq');
  return new ProviderError(geminiErrorMessage(status, data), {
    status,
    retryAfterMs: parseRetryAfter(headers, raw)
  });
}

async function testConnection(apiKey: string, signal?: AbortSignal): Promise<TestResult> {
  // GET /models/{model}: sekalian membuktikan key valid DAN model tunggal tersedia.
  let res: Response;
  try {
    res = await fetch(GEMINI_BASE + '/models/' + GEMINI_MODEL + '?key=' + encodeURIComponent(apiKey), { signal });
  } catch {
    return { ok: false, message: 'Tidak ada koneksi ke server Gemini.' };
  }
  const { data } = await readBody(res);
  if (res.status === 404) {
    // nama model ditolak API → JANGAN diam-diam pindah model; laporkan apa adanya
    return { ok: false, message: `Model ${GEMINI_MODEL} ditolak Gemini (404) — laporkan ke pengembang nama model yang valid.` };
  }
  if (!res.ok) return { ok: false, message: geminiErrorMessage(res.status, data) };
  return { ok: true };
}

async function generateForImage(args: GenerateArgs): Promise<ParsedMetadata> {
  const { apiKey, image, platform, theme, signal, onWait, languageFix, retryNote, promptOverride } = args;
  // M33 Fase 2c/5: promptOverride (Tahap D) tetap disertai gambar yang sama.
  const prompt = promptOverride ?? buildMetadataPrompt({ platform, theme, languageFix, retryNote });

  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(GEMINI_BASE + '/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: GENERATION_TEMPERATURE,
            maxOutputTokens: GENERATION_MAX_TOKENS
          }
        }),
        signal
      });
    } catch {
      const aborted = Boolean(signal?.aborted);
      throw new ProviderError(aborted ? 'Dibatalkan' : 'Tidak ada koneksi ke server Gemini.', { retryable: !aborted });
    }

    const { data, raw } = await readBody(res);
    if (!res.ok) throw geminiHttpError(res.status, data, raw, res.headers);

    const body = data && typeof data === 'object' ? data as {
      promptFeedback?: { blockReason?: string };
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } : null;
    const block = body?.promptFeedback?.blockReason;
    if (block) throw new ProviderError('Konten diblokir: ' + block, { retryable: false });

    const parts = body?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p) => p?.text ?? '').join('') : '';
    if (!text.trim()) throw new ProviderError('Respons kosong', { retryable: true, maxRetries: MODEL_RETRY_MAX });

    return parseMetadataResponse(text, platform);   // JSON rusak → Error kind 'json' → di-retry ≤2x
  }, { onWait, signal });
}

export const gemini: ProviderAdapter = { id: 'gemini', testConnection, generateForImage };
