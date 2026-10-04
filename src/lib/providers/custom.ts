// Provider custom OpenAI-compatible — TANPA hardcode nama layanan, base URL, atau
// model. Pengguna mengisi baseUrl (mis. https://api.layanan-anda.com/v1), model, dan
// apiKey sendiri; semuanya tersimpan di localStorage browser. Mendukung gambar bila
// endpoint/model-nya mendukung — error vision diteruskan jelas tanpa fallback teks-saja.
// Tes koneksi = GET {base}/models (ringan, tanpa biaya token).
// Key dikirim lewat header Authorization dan TIDAK PERNAH dicetak ke log.
import { buildAnalysisPrompt, parseAnalysisResponse } from '../analysisPrompt';
import { buildObservationPrompt, parseObservationResponse } from '../observation';
import type { Observation } from '../observation';
import type { AnalysisResult } from '../types';
import { judgePromptFor, parseJudgeResponse } from '../judge';
import { buildMetadataPrompt, parseMetadataResponse } from '../prompt';
import type { ParsedMetadata } from '../prompt';
import { readBody } from './http';
import { MODEL_RETRY_MAX, ProviderError, dailyQuotaError, isDailyQuota, parseRetryAfter, withRetry } from './retry';
import type { AnalyzeArgs, GenerateArgs, ImageInput, JudgeInput, JudgeOutput, ObserveArgs, ProviderAdapter, TestOpts, TestResult, TextArgs } from './types';
import { isVisionNotSupportedError } from './types';

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function requireConfig(baseUrl?: string, model?: string): { base: string; model: string } {
  const base = normalizeBaseUrl(baseUrl ?? '');
  const m = (model ?? '').trim();
  if (!base || !m) throw new ProviderError('Isi base URL dan model provider custom dulu.', { retryable: false });
  if (!/^https?:\/\//i.test(base)) throw new ProviderError('Base URL harus diawali http:// atau https://.', { retryable: false });
  return { base, model: m };
}

function customMessage(data: unknown): string {
  const err: unknown = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: unknown }).error
    : undefined;
  // dua bentuk umum: {"error":{"message":"…"}} atau {"error":"…"}
  if (typeof err === 'string') return err.trim();
  const msg = err && typeof err === 'object' && 'message' in err
    ? (err as { message?: unknown }).message
    : undefined;
  return typeof msg === 'string' ? msg.trim() : '';
}

function customErrorMessage(status: number, data: unknown, raw: string): string {
  const msg = customMessage(data);
  if (msg) return msg;
  if (status === 401 || status === 403) return 'Key salah — API key ditolak provider custom.';
  if (status === 429) return 'Batas kuota tercapai (429) — coba lagi nanti.';
  if (status === 402) return 'Kredit tidak cukup (402) — periksa saldo provider custom.';
  // body non-JSON (mis. halaman error gateway) → pesan generik, jangan tampilkan potongan mentah
  if (raw && !data) return `Respons tidak terbaca dari provider custom${status ? ` (HTTP ${status}).` : '.'}`;
  if (status) return 'Provider custom menolak permintaan (' + status + ').';
  return 'Koneksi gagal.';
}

/** Respons gagal → ProviderError; 429 kuota harian TIDAK di-retry (pesan jelas + fallback). */
function customHttpError(status: number, data: unknown, raw: string, headers: Headers): ProviderError {
  if (isDailyQuota(status, raw)) return dailyQuotaError('Custom', 'Groq');
  return new ProviderError(customErrorMessage(status, data, raw), {
    status,
    retryAfterMs: parseRetryAfter(headers, raw)
  });
}

/** Error gambar-tak-didukung → noVision (frame berhenti, tanpa fallback teks-saja). */
function withNoVision(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : String(err);
  if (isVisionNotSupportedError(msg)) {
    return new ProviderError('Endpoint/model custom tidak mendukung gambar — frame dihentikan (tanpa mode teks-saja).', {
      retryable: false,
      noVision: true
    });
  }
  return err;
}

async function testConnection(apiKey: string, opts?: TestOpts): Promise<TestResult> {
  const signal = opts?.signal;
  let base = '';
  try {
    base = requireConfig(opts?.baseUrl, opts?.model).base;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Isi base URL dan model dulu.' };
  }
  let res: Response;
  try {
    res = await fetch(base + '/models', {
      headers: { 'Authorization': 'Bearer ' + apiKey },
      signal
    });
  } catch {
    return { ok: false, message: 'Tidak ada koneksi ke server custom.' };
  }
  const { data, raw } = await readBody(res);
  if (!res.ok) return { ok: false, message: customErrorMessage(res.status, data, raw) };
  return { ok: true };
}

// Satu-satunya tempat HTTP chat — tanpa image = teks murni. Sebagian endpoint menolak
// response_format (400/422) → ulangi sekali TANPA parameter itu.
async function postChat(opts: { apiKey: string; base: string; model: string; image?: ImageInput; prompt: string; signal?: AbortSignal }): Promise<string> {
  const { apiKey, base, model, image, prompt, signal } = opts;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      const body: Record<string, unknown> = {
        model,
        messages: [{ role: 'user', content: image ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: 'data:' + image.mimeType + ';base64,' + image.base64 } }
        ] : prompt }]
      };
      if (attempt === 0) body.response_format = { type: 'json_object' };
      res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body),
        signal
      });
    } catch {
      const aborted = Boolean(signal?.aborted);
      throw new ProviderError(aborted ? 'Dibatalkan' : 'Tidak ada koneksi ke server custom.', { retryable: !aborted });
    }

    const { data, raw } = await readBody(res);
    if (!res.ok && attempt === 0 && (res.status === 400 || res.status === 422)) continue;

    if (!res.ok) throw customHttpError(res.status, data, raw, res.headers);
    if (!data) throw new ProviderError('JSON tidak valid', { retryable: true, maxRetries: MODEL_RETRY_MAX });

    const choice = (data as { choices?: { message?: { content?: unknown } }[] }).choices?.[0];
    const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    if (!text.trim()) throw new ProviderError('Respons kosong', { retryable: true, maxRetries: MODEL_RETRY_MAX });
    return text;
  }
}

async function generateForImage(args: GenerateArgs): Promise<ParsedMetadata> {
  const { apiKey, image, platform, theme, signal, onWait } = args;
  const { base, model } = requireConfig(args.baseUrl, args.model);
  const prompt = buildMetadataPrompt({ platform, theme });

  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, base, model, image, prompt, signal });
      return parseMetadataResponse(text, platform);   // fence ```json ikut dibersihkan parser
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

async function analyzeImage(args: AnalyzeArgs): Promise<AnalysisResult> {
  const { apiKey, image, platform, signal, onWait } = args;
  const { base, model } = requireConfig(args.baseUrl, args.model);
  const prompt = buildAnalysisPrompt({ platform });

  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, base, model, image, prompt, signal });
      return parseAnalysisResponse(text);
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

async function callText(args: TextArgs): Promise<string> {
  const { apiKey, prompt, signal, onWait } = args;
  const { base, model } = requireConfig(args.baseUrl, args.model);
  return withRetry(async () => postChat({ apiKey, base, model, prompt, signal }), { onWait, signal });
}

async function observeImage(args: ObserveArgs): Promise<Observation> {
  const { apiKey, image, theme, signal, onWait } = args;
  const { base, model } = requireConfig(args.baseUrl, args.model);
  const prompt = buildObservationPrompt(theme);
  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, base, model, image, prompt, signal });
      return parseObservationResponse(text);
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

async function callJudge(input: JudgeInput): Promise<JudgeOutput> {
  const { apiKey, signal, onWait } = input;
  const { base, model } = requireConfig(input.baseUrl, input.model);
  const prompt = judgePromptFor(input);
  const image = input.sendImage ? input.image : undefined;
  return withRetry(async () => {
    try {
      const text = await postChat({ apiKey, base, model, image, prompt, signal });
      return parseJudgeResponse(text);   // rule_id asing → error kind 'json' → di-retry
    } catch (err) { throw withNoVision(err); }
  }, { onWait, signal });
}

export const custom: ProviderAdapter = {
  id: 'custom',
  label: 'Custom',
  supportsVision: true,
  testConnection,
  generateForImage,
  analyzeImage,
  observeImage,
  callText,
  callJudge
};
