// OpenRouter (OpenAI-compatible) — cadangan bila Groq/Gemini habis kuota. Free tier sangat
// terbatas (±20 request/hari tanpa isi saldo) dan modelnya SATU alias tetap 'openrouter/free'
// (lihat models.ts) — tanpa daftar model atau pemilihan model dinamis di sisi aplikasi.
// Tes koneksi = GET /api/v1/models (ringan, tanpa biaya token); generate = POST /chat/completions.
// Sebagian model gratis menolak response_format (400/422) → ulangi sekali TANPA parameter itu.
// Key dikirim lewat header Authorization dan TIDAK PERNAH dicetak ke log.
import { buildAnalysisPrompt, parseAnalysisResponse } from '../analysisPrompt';
import { buildObservationPrompt, parseObservationResponse } from '../observation';
import type { Observation } from '../observation';
import type { AnalysisResult } from '../types';
import { judgePromptFor, parseJudgeResponse } from '../judge';
import { buildMetadataPrompt, parseMetadataResponse } from '../prompt';
import type { ParsedMetadata } from '../prompt';
import { readBody } from './http';
import { OPENROUTER_MODEL } from './models';
import { MODEL_RETRY_MAX, ProviderError, dailyQuotaError, isDailyQuota, parseRetryAfter, withRetry } from './retry';
import type { AnalyzeArgs, CropInspectInput, CropInspectOutput, GenerateArgs, ImageInput, JudgeInput, JudgeOutput, ObserveArgs, ProviderAdapter, TestOpts, TestResult, TextArgs } from './types';
import { isVisionNotSupportedError } from './types';
import { buildCropPrompt, parseCropResponse } from '../quality/cropInspect';

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

/** Error gambar-tak-didukung → noVision (frame berhenti, tanpa fallback teks-saja). */
function withNoVision(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : String(err);
  if (isVisionNotSupportedError(msg)) {
    return new ProviderError('Model OpenRouter tidak mendukung gambar — frame dihentikan (tanpa mode teks-saja).', {
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

// Satu-satunya tempat HTTP POST chat — prompt & parser diinjeksikan pemanggil
// (generate metadata vs analisis reviewer) supaya request tidak diduplikasi.
// Tanpa image = panggilan teks murni (Tahap B/D, juri tanpa gambar, perbaikan).
async function postChat(opts: { apiKey: string; image?: ImageInput; prompt: string; signal?: AbortSignal }): Promise<string> {
  const { apiKey, image, prompt, signal } = opts;
  // response_format diharapkan OpenAI-compatible; sebagian model gratis menolaknya (400/422)
  // → ulangi sekali TANPA parameter itu, hasilnya tetap dibersihkan parser pemanggil.
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      const body: Record<string, unknown> = {
        model: OPENROUTER_MODEL,
        messages: [{ role: 'user', content: image ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: 'data:' + image.mimeType + ';base64,' + image.base64 } }
        ] : prompt }]
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
    return text;
  }
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

async function observeImage(args: ObserveArgs): Promise<Observation> {
  const { apiKey, image, theme, signal, onWait } = args;
  const prompt = buildObservationPrompt(theme);
  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, image, prompt, signal });
      return parseObservationResponse(text);
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
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

export const openrouter: ProviderAdapter = {
  id: 'openrouter',
  label: 'OpenRouter',
  supportsVision: true,
  testConnection,
  generateForImage,
  analyzeImage,
  observeImage,
  callText,
  callJudge,
  inspectCrop
};

async function inspectCrop(input: CropInspectInput): Promise<CropInspectOutput> {
  const prompt = buildCropPrompt(input.region);
  const text = await withRetry(async () => {
    try {
      return await postChat({ apiKey: input.apiKey, image: input.image, prompt, signal: input.signal });
    } catch (err) { throw withNoVision(err); }
  }, { onWait: input.onWait, signal: input.signal });
  const parsed = parseCropResponse(text);
  const first = parsed.crops[0];
  if (!first) throw new Error('Inspeksi crop kosong');
  return {
    visible_noise: first.visible_noise,
    blur_or_soft: first.blur_or_soft,
    artifacts_or_halos: first.artifacts_or_halos,
    dust_or_sensor_spots: first.dust_or_sensor_spots,
    ai_glitches: first.ai_glitches,
    notes: first.notes
  };
}
