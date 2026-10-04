// Groq live (OpenAI-compatible) — port dari legacy/js/providers-groq.js. Model tunggal
// 'qwen/qwen3.8-27b' (lihat models.ts) tanpa fallback antar model: kalau gagal, error tampil
// apa adanya dari body Groq. Catatan: limit gratis qwen di Groq = 8.000 token/menit, jadi 429
// per menit di sini NORMAL dan ditangani retry sabar (20 detik atau sesuai retry-after);
// 429 kuota harian → TIDAK di-retry, gagal cepat agar bisa fallback ke provider lain.
// Key dikirim lewat header Authorization dan TIDAK PERNAH dicetak ke log.
import { buildAnalysisPrompt, parseAnalysisResponse } from '../analysisPrompt';
import type { AnalysisResult } from '../types';
import { judgePromptFor, parseJudgeResponse } from '../judge';
import { buildMetadataPrompt, parseMetadataResponse } from '../prompt';
import type { ParsedMetadata } from '../prompt';
import { readBody } from './http';
import { GROQ_MODEL } from './models';
import { MODEL_RETRY_MAX, ProviderError, dailyQuotaError, isDailyQuota, parseRetryAfter, withRetry } from './retry';
import type { AnalyzeArgs, GenerateArgs, ImageInput, JudgeInput, JudgeOutput, ProviderAdapter, TestOpts, TestResult, TextArgs } from './types';
import { isVisionNotSupportedError } from './types';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

function groqMessage(data: unknown): string {
  const err = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: { message?: unknown } }).error
    : undefined;
  const msg = typeof err?.message === 'string' ? err.message.trim() : '';
  return msg;
}

function groqErrorMessage(status: number, data: unknown, raw: string): string {
  const msg = groqMessage(data);
  if (msg) return msg;
  if (status === 401 || status === 403) return 'Key salah — API key ditolak Groq.';
  if (status === 429) return 'Batas kuota tercapai (429) — coba lagi nanti.';
  // body non-JSON (mis. halaman error gateway) → pesan generik, jangan tampilkan potongan mentah
  if (raw && !data) return `Respons tidak terbaca dari Groq${status ? ` (HTTP ${status}).` : '.'}`;
  if (status) return 'Groq menolak permintaan (' + status + ').';
  return 'Koneksi gagal.';
}

/** Respons gagal → ProviderError; 429 kuota harian TIDAK di-retry (pesan jelas + fallback). */
function groqHttpError(status: number, data: unknown, raw: string, headers: Headers): ProviderError {
  if (isDailyQuota(status, raw)) return dailyQuotaError('Groq', 'Gemini');
  return new ProviderError(groqErrorMessage(status, data, raw), {
    status,
    retryAfterMs: parseRetryAfter(headers, raw)
  });
}

/** Error gambar-tak-didukung → noVision (frame berhenti, tanpa fallback teks-saja). */
function withNoVision(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : String(err);
  if (isVisionNotSupportedError(msg)) {
    return new ProviderError('Model Groq tidak mendukung gambar — frame dihentikan (tanpa mode teks-saja).', {
      retryable: false,
      noVision: true
    });
  }
  return err;
}

async function testConnection(apiKey: string, opts?: TestOpts): Promise<TestResult> {
  const signal = opts?.signal;
  let res: Response;
  try {
    res = await fetch(GROQ_BASE + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      signal
    });
  } catch {
    return { ok: false, message: 'Tidak ada koneksi ke server Groq.' };
  }
  const { data, raw } = await readBody(res);
  if (!res.ok) return { ok: false, message: groqErrorMessage(res.status, data, raw) };
  const models = data && typeof data === 'object' ? (data as { data?: unknown }).data : undefined;
  if (!Array.isArray(models) || !models.length) {
    return { ok: false, message: 'Key diterima, tapi tidak ada model yang bisa dipakai.' };
  }
  return { ok: true };
}

// M29: satu-satunya tempat HTTP POST chat — prompt & parser diinjeksikan pemanggil
// (generate metadata vs analisis reviewer) supaya request tidak diduplikasi.
// Tanpa image = panggilan teks murni (Tahap B/D, juri tanpa gambar, perbaikan).
async function postChat(opts: { apiKey: string; image?: ImageInput; prompt: string; signal?: AbortSignal }): Promise<string> {
  const { apiKey, image, prompt, signal } = opts;
  let res: Response;
  try {
    res = await fetch(GROQ_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: image ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: 'data:' + image.mimeType + ';base64,' + image.base64 } }
        ] : prompt }],
        response_format: { type: 'json_object' }
      }),
      signal
    });
  } catch {
    const aborted = Boolean(signal?.aborted);
    throw new ProviderError(aborted ? 'Dibatalkan' : 'Tidak ada koneksi ke server Groq.', { retryable: !aborted });
  }

  const { data, raw } = await readBody(res);
  if (!res.ok) throw groqHttpError(res.status, data, raw, res.headers);
  if (!data) throw new ProviderError('JSON tidak valid', { retryable: true, maxRetries: MODEL_RETRY_MAX });

  const choice = (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0];
  const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  if (!text.trim()) throw new ProviderError('Respons kosong', { retryable: true, maxRetries: MODEL_RETRY_MAX });
  return text;
}

async function generateForImage(args: GenerateArgs): Promise<ParsedMetadata> {
  const { apiKey, image, platform, theme, signal, onWait } = args;
  const prompt = buildMetadataPrompt({ platform, theme });

  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, image, prompt, signal });
      return parseMetadataResponse(text, platform);   // fence ```json ikut dibersihkan parser
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

async function analyzeImage(args: AnalyzeArgs): Promise<AnalysisResult> {
  const { apiKey, image, platform, signal, onWait } = args;
  const prompt = buildAnalysisPrompt({ platform });

  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, image, prompt, signal });
      return parseAnalysisResponse(text);
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

async function callText(args: TextArgs): Promise<string> {
  const { apiKey, prompt, signal, onWait } = args;
  return withRetry(async () => postChat({ apiKey, prompt, signal }), { onWait, signal });
}

async function callJudge(input: JudgeInput): Promise<JudgeOutput> {
  const { apiKey, signal, onWait } = input;
  const prompt = judgePromptFor(input);
  const image = input.sendImage ? input.image : undefined;
  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, image, prompt, signal });
      return parseJudgeResponse(text);   // rule_id asing → error kind 'json' → di-retry
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

export const groq: ProviderAdapter = {
  id: 'groq',
  label: 'Groq',
  // TODO [VERIFIKASI]: pastikan model default qwen/qwen3.8-27b benar-benar mendukung
  // gambar di endpoint Groq — bila tidak, frame berhenti dengan error jelas (noVision).
  supportsVision: true,
  testConnection,
  generateForImage,
  analyzeImage,
  callText,
  callJudge
};
