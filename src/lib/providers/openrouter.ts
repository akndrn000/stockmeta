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

function openrouterMessageDetail(data: unknown): { message: string; code: string } {
  const err: unknown = data && typeof data === 'object' && 'error' in data
    ? (data as { error?: unknown }).error
    : undefined;
  // OpenRouter memakai dua bentuk: {"error":{"message":"…","code":…}} (gaya OpenAI)
  // atau {"error":"…"} — code bisa string maupun angka.
  if (typeof err === 'string') return { message: err.trim(), code: '' };
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    const message = typeof e.message === 'string' ? e.message.trim() : '';
    const code = typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code) : '';
    if (message || code) return { message, code };
  }
  // Defensif: bentuk tak resmi {"message":"…"} di top-level — jangan hilangkan info.
  const top = data && typeof data === 'object' && 'message' in data
    ? (data as { message?: unknown }).message
    : undefined;
  if (typeof top === 'string' && top.trim()) return { message: top.trim(), code: '' };
  return { message: '', code: '' };
}

/**
 * Potongan body mentah untuk diagnostik (dibatasi 200 char, satu baris).
 * Body respons TIDAK PERNAH berisi API key (key hanya di header Authorization),
 * jadi snippet ini aman ditampilkan ke frame yang gagal.
 */
function rawSnippet(raw: string, max = 200): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function openrouterErrorMessage(status: number, data: unknown, raw: string): string {
  const { message, code } = openrouterMessageDetail(data);
  const statusPart = status ? ` (HTTP ${status})` : '';
  // 1. Pesan ASLI dari body selalu menang — plus code + status HTTP, JANGAN generik.
  if (message) {
    const codePart = code ? ` [code ${code}]` : '';
    return `${message}${codePart}${statusPart}`;
  }
  if (code) return `OpenRouter error [code ${code}]${statusPart}`;
  // 2. Status dikenal tanpa pesan asli — tetap sertakan status (bukan generik buta).
  if (status === 401 || status === 403) return 'Key salah — API key ditolak OpenRouter.' + statusPart;
  if (status === 429) return 'Batas kuota tercapai (429) — coba lagi nanti.';
  if (status === 402) return 'Kredit tidak cukup (402) — free tier OpenRouter mungkin sedang penuh.';
  // 3. Body non-JSON (mis. halaman error gateway) → status + potongan mentah.
  if (raw && !data) {
    const snippet = rawSnippet(raw);
    return `OpenRouter error${statusPart}${snippet ? `: ${snippet}` : ' — body tidak terbaca.'}`;
  }
  // 4. JSON tanpa error.message yang dikenal → tampilkan JSON ringkas + status.
  if (data) {
    let jsonSnippet = '';
    try { jsonSnippet = rawSnippet(JSON.stringify(data)); } catch { jsonSnippet = ''; }
    return `OpenRouter error${statusPart}${jsonSnippet ? `: ${jsonSnippet}` : '.'}`;
  }
  // 5. Benar-benar tanpa body.
  if (status) return `OpenRouter error${statusPart} — body kosong.`;
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
  const { apiKey, image, platform, theme, signal, onWait, languageFix, retryNote, promptOverride } = args;
  // M33 Fase 2c/5: promptOverride (Tahap D) tetap disertai gambar yang sama.
  const prompt = promptOverride ?? buildMetadataPrompt({ platform, theme, languageFix, retryNote });

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
