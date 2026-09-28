// Gemini live — port dari legacy/js/providers-gemini.js (endpoint, format request,
// pickGeminiModel, pemetaan error dari BODY respons). Key hanya dikirim sebagai query param ke
// API resmi Google dan TIDAK PERNAH dicetak ke log.
import { buildMetadataPrompt, parseMetadataResponse } from '../prompt';
import type { ParsedMetadata } from '../prompt';
import { readBody } from './http';
import { MODEL_RETRY_MAX, ProviderError, parseRetryAfter, withRetry } from './retry';
import type { GenerateArgs, ProviderAdapter, TestResult } from './types';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// model pertama di daftar ini yang tersedia di /models key-nya menang
export const GEMINI_MODEL_PREFS = ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash',
  'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite',
  'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] as const;

const FALLBACK_MODEL = 'gemini-2.5-flash';

export interface GeminiModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

export function pickGeminiModel(models?: readonly GeminiModel[]): string {
  const ok = (models ?? [])
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => String(m.name ?? '').replace(/^models\//, ''));
  for (const p of GEMINI_MODEL_PREFS) if (ok.includes(p)) return p;
  const flash = ok.find((id) => /flash/.test(id) && !/image|audio|live|tts|transcribe|robotics/i.test(id));
  return flash || FALLBACK_MODEL;
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

async function testConnection(apiKey: string, signal?: AbortSignal): Promise<TestResult> {
  let res: Response;
  try {
    res = await fetch(GEMINI_BASE + '/models?key=' + encodeURIComponent(apiKey), { signal });
  } catch {
    return { ok: false, message: 'Tidak ada koneksi ke server Gemini.' };
  }
  const { data } = await readBody(res);
  if (!res.ok) return { ok: false, message: geminiErrorMessage(res.status, data) };
  const models = data && typeof data === 'object' && Array.isArray((data as { models?: unknown }).models)
    ? (data as { models: GeminiModel[] }).models
    : [];
  if (!models.length) return { ok: false, message: 'Key diterima, tapi tidak ada model yang bisa dipakai.' };
  return { ok: true, model: pickGeminiModel(models) };
}

async function generateForImage(args: GenerateArgs): Promise<ParsedMetadata> {
  const { apiKey, image, platform, theme, signal, onWait } = args;
  const model = args.model ?? FALLBACK_MODEL;
  const prompt = buildMetadataPrompt({ platform, theme });

  return withRetry(async () => {
    let res: Response;
    try {
      res = await fetch(GEMINI_BASE + '/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }),
        signal
      });
    } catch {
      const aborted = Boolean(signal?.aborted);
      throw new ProviderError(aborted ? 'Dibatalkan' : 'Tidak ada koneksi ke server Gemini.', { retryable: !aborted });
    }

    const { data, raw } = await readBody(res);
    if (!res.ok) {
      throw new ProviderError(geminiErrorMessage(res.status, data), {
        status: res.status,
        retryAfterMs: parseRetryAfter(res.headers, raw)
      });
    }

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
