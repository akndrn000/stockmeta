// Top-up keyword otomatis — JARING PENGAMAN, bukan pengganti instruksi prompt.
// Fakta dunia nyata: model vision kecil kadang mengembalikan jauh di bawah target
// (mis. 15/49) meski prompt sudah tegas — kata-kata saja tidak cukup memaksa patuh.
// Mekanisme: hasil pertama < TARGET_KEYWORDS_MIN → SATU panggilan follow-up ke
// provider YANG SAMA dengan GAMBAR yang sama + daftar yang sudah ada (anti-ulang),
// lalu merge + dedupe + cap. Follow-up gagal → hasil pertama dipakai apa adanya.
// Dipakai generateWithFallback (fallback.ts) — SATU tempat untuk Gemini, Groq,
// OpenRouter — tanpa duplikasi di 3 file provider.
import { MAX_KEYWORDS, MAX_KEYWORDS_ADOBE, TARGET_KEYWORDS_MIN } from '../limits';
import type { ParsedMetadata, SourcedKeyword } from '../prompt';
import type { Platform } from '../types';

/** Rentang total yang diminta di prompt follow-up (bukan pagar validasi). */
export const TOPUP_TARGET_MIN = 35;
export const TOPUP_TARGET_MAX = 40;
/**
 * Maksimal TOTAL panggilan API per frame: 1 awal + 2 follow-up. Setelah itu STOP
 * apa pun hasilnya (hindari biaya/waktu tak terkendali) — pakai yang ada.
 */
export const TOPUP_MAX_CALLS = 3;
/** Jeda antar percobaan dalam 1 frame (jangan tembak beruntun → rate limit). */
export const TOPUP_ATTEMPT_DELAY_MS = 1500;

export function platformKeywordMax(platform: Platform): number {
  return platform === 'adobe' ? MAX_KEYWORDS_ADOBE : MAX_KEYWORDS;
}

/** Jumlah kata kunci hasil pertama (flat + bersumber). */
export function countKeywords(meta: ParsedMetadata): number {
  return (meta.keywords ?? []).length + (meta.sourcedKeywords ?? []).length;
}

/** Kata yang sudah ada — untuk klausul "jangan ulangi" di prompt + dedupe merge. */
export function existingKeywordList(meta: ParsedMetadata): string[] {
  const out: string[] = [];
  for (const k of meta.keywords ?? []) {
    const v = k.trim();
    if (v) out.push(v);
  }
  for (const s of meta.sourcedKeywords ?? []) {
    const v = s.k.trim();
    if (v) out.push(v);
  }
  return out;
}

/** true bila hasil pertama perlu top-up (hanya jalur metadata utama). */
export function needsTopup(meta: ParsedMetadata): boolean {
  return countKeywords(meta) < TARGET_KEYWORDS_MIN;
}

/**
 * Prompt follow-up singkat + mandiri (tiap panggilan API stateless): minta TAMBAHAN
 * kata kunci dalam format objek bersumber yang SAMA dengan prompt utama supaya
 * lolos verifikasi grounding finalisasi (tanpa src yang sah = dibuang di sana).
 */
export function buildTopupPrompt(existing: string[]): string {
  const list = existing.length ? existing.join(', ') : '-';
  return [
    'Berdasarkan gambar yang sama, berikan TAMBAHAN kata kunci relevan',
    `(bukan mengulang yang sudah ada: [${list}])`,
    `sampai total mencapai sekitar ${TOPUP_TARGET_MIN}-${TOPUP_TARGET_MAX} kata kunci.`,
    'Fokus pada sudut pandang yang belum tercakup: detail visual spesifik,',
    'konteks penggunaan, istilah terkait industri/desain, variasi sinonim yang relevan.',
    'HARUS tetap akurat sesuai gambar, jangan mengarang.',
    'Tulis SELURUH keyword dalam bahasa Inggris.',
    'Kembalikan HANYA JSON valid {"keywords": [{"k": kata, "src": salah satu',
    'visible|attribute|synonym|theme|usage, "of": kata sumber bila synonym,',
    '"rel": synonym|parent|specific bila synonym,',
    '"kind": event|season|mood|activity|usage bila theme}]} tanpa teks tambahan.'
  ].join(' ');
}

/**
 * Tidur antar follow-up yang ikut terbangun saat sinyal batal (tidak pernah
 * reject — pemanggil mengecek `signal.aborted` sesudahnya, pola batch.ts).
 */
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(onEnd, ms);
    function onAbort(): void { onEnd(); }
    function onEnd(): void {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Gabung hasil follow-up ke hasil pertama: dedupe tanpa peduli huruf
 * (pola yang sama seperti addKeywords di keywords.ts), potong di
 * MAX_KEYWORDS_ADOBE / MAX_KEYWORDS sesuai platform.
 *
 * Bentuk dipertahankan dari hasil pertama (tidak pernah ada src karangan):
 * pertama bersumber → gabung daftar bersumber saja (extra flat yang tak patuh
 * format diabaikan); pertama flat → gabung semuanya sebagai string flat.
 * Kata hasil pertama TIDAK PERNAH hilang; extra hanya best-effort.
 * Tanpa tambahan → kembalikan `first` apa adanya (referensi sama).
 */
export function mergeTopupKeywords(
  first: ParsedMetadata,
  extra: ParsedMetadata,
  platform: Platform
): ParsedMetadata {
  const max = platformKeywordMax(platform);
  const firstFlat = first.keywords ?? [];
  const firstSourced = first.sourcedKeywords ?? [];
  const extraFlat = extra.keywords ?? [];
  const extraSourced = extra.sourcedKeywords ?? [];
  if (!extraFlat.length && !extraSourced.length) return first;

  if (firstSourced.length) {
    const seen = new Set(firstSourced.map((s) => s.k.toLowerCase()));
    for (const k of firstFlat) seen.add(k.toLowerCase());
    const merged: SourcedKeyword[] = [...firstSourced];
    for (const s of extraSourced) {
      const v = s.k.trim();
      if (!v || seen.has(v.toLowerCase())) continue;
      if (merged.length + firstFlat.length >= max) break;
      seen.add(v.toLowerCase());
      merged.push({ ...s, k: v });
    }
    if (merged.length === firstSourced.length) return first;
    return { ...first, sourcedKeywords: merged };
  }

  const seen = new Set(firstFlat.map((k) => k.toLowerCase()));
  const merged: string[] = [...firstFlat];
  const pushNew = (v: string): void => {
    const t = v.trim();
    if (!t || seen.has(t.toLowerCase())) return;
    if (merged.length >= max) return;
    seen.add(t.toLowerCase());
    merged.push(t);
  };
  for (const k of extraFlat) pushNew(k);
  for (const s of extraSourced) pushNew(s.k);
  if (merged.length === firstFlat.length) return first;
  return { ...first, keywords: merged };
}
