// Prompt anti-generic + parser hasil model — port setia dari legacy/js/prompt-builder.js dan
// parseJsonLoose + normalisasi di providers-gemini.js/app.js (tanpa panggilan jaringan).
// Tahap B memakai builder observasi-di-bawah (teks saja, tanpa gambar); builder lama
// buildMetadataPrompt dipertahankan untuk jalur legacy (live-test).
import { getCategories, normCat } from './categories';
import { cleanAdobeTitle } from './metadata';
import {
  ADOBE_CATEGORIES,
  ADOBE_KEYWORDS_MAX,
  ADOBE_KEYWORDS_TARGET_MAX,
  ADOBE_KEYWORDS_TARGET_MIN,
  ADOBE_TITLE_SUGGEST_MAX,
  ADOBE_TITLE_WORDS_FIRST_N,
  SS_DESCRIPTION_MIN_WORDS,
  SS_DESCRIPTION_TARGET_MAX_CHARS,
  SS_DESCRIPTION_TARGET_MIN_CHARS,
  SS_KEYWORDS_MAX,
  SS_KEYWORDS_MIN,
  SS_KEYWORDS_TARGET_MAX,
  SS_KEYWORDS_TARGET_MIN
} from './platform-rules';
import { MAX_DESCRIPTION, MAX_KEYWORDS, MAX_KEYWORDS_ADOBE, MAX_TITLE_CSV } from './limits';
import type { Observation } from './observation';
import type { Platform } from './types';

export function buildMetadataPrompt({ platform, theme }: { platform: Platform; theme?: string }): string {
  const cats = getCategories(platform);
  // M24: koma di judul Adobe dibiarkan (CSV di-quote) — JANGAN suruh model menghapusnya.
  // Batas keyword/deskripsi di bawah menyampaikan angka asli dari limits.ts ke model.
  const jsonFormat = platform === 'adobe'
    ? `{"title": string maks ${MAX_TITLE_CSV} karakter, koma dibiarkan (JANGAN dihapus atau diganti), "keywords": array 15-35 kata (maksimal ${MAX_KEYWORDS_ADOBE} kata, yang paling penting dulu), "category": string — salah satu persis dari daftar kategori di atas}`
    : `{"description": string satu-dua kalimat deskriptif lengkap, minimal 5 kata dan maksimal ${MAX_DESCRIPTION} karakter (BUKAN daftar kata), "keywords": array 15-40 kata, "category": array 1-2 string persis dari daftar kategori di atas}`;

  const lines = [
    'Analisis HANYA apa yang benar-benar terlihat di gambar ini. Jangan menebak konteks, lokasi, merek, atau emosi yang tidak jelas terlihat. Jika ragu, jangan sertakan.'
  ];
  if (theme) {
    lines.push(
      'Tema utama dari kontributor: "' + theme + '".',
      'Kalau elemen visual di gambar konsisten dengan tema ini, KEMBANGKAN keyword dan title/description dengan istilah-istilah yang relevan dengan tema tersebut (misalnya untuk tema Halloween: spooky, costume, pumpkin, trick-or-treat, bat, ghost — SESUAIKAN dengan yang benar-benar cocok dengan visual gambar, jangan asal comot semua istilah generik tema itu).',
      'Kalau visual gambar TIDAK konsisten dengan tema yang disebutkan, ABAIKAN tema ini sepenuhnya dan deskripsikan apa adanya.'
    );
  }
  lines.push(
    '',
    'ATURAN PENTING UNTUK TITLE/DESCRIPTION:',
    "- JANGAN gunakan frasa generik seperti 'isolated on white background', 'stock photo', atau sejenisnya kecuali itu benar-benar bagian penting dari komposisi visual",
    '- Fokus pada SUBJEK, AKSI, GAYA VISUAL, dan MOOD yang spesifik dan bisa dicari orang',
    "- Kalau ada elemen musiman/perayaan yang terlihat jelas (kostum, dekorasi, warna khas), sebutkan secara eksplisit (contoh: 'Halloween', 'costume', 'spooky', bukan cuma 'orange and purple')",
    '',
    'Platform target: ' + platform,
    'Daftar kategori yang WAJIB dipilih (pilih PERSIS salah satu nama ini, jangan buat nama baru):',
    cats.join(', '),
    '',
    'Format JSON untuk platform ini:',
    jsonFormat,
    '',
    'Kembalikan JSON sesuai format platform seperti sebelumnya, dengan field `category` WAJIB terisi (jangan kosong dan jangan null) dan nilainya persis salah satu nama dari daftar kategori di atas (case-sensitive).',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  );
  return lines.join('\n');
}

// Hasil normalisasi: field hanya muncul kalau model mengembalikannya (judul/deskripsi lama tidak
// ditimpa oleh field kosong) — persis perilaku applyGeminiResult() di legacy.
export interface ParsedMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  category?: string;
  /** M11: true bila kategori diisi fallback (nama model tidak cocok / field kosong) */
  categoryAuto?: boolean;
}

// 'json' dipetakan UI ke pesan legacy "JSON tidak valid"
function jsonError(): Error {
  return Object.assign(new Error('JSON tidak valid'), { kind: 'json' });
}

function cleanKeywords(list: unknown[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of list) {
    const v = String(k ?? '').trim().replace(/^,+|,+$/g, '');
    if (!v) continue;
    const low = v.toLowerCase();
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function pick(o: Record<string, unknown>, k: string): unknown {
  const hit = Object.keys(o).find((x) => x.toLowerCase() === k);
  return hit ? o[hit] : undefined;
}

export function parseMetadataResponse(raw: string, platform: Platform): ParsedMetadata {
  const s = String(raw).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw jsonError();
  let json: unknown;
  try { json = JSON.parse(s.slice(a, b + 1)); }
  catch { throw jsonError(); }
  if (typeof json !== 'object' || json === null) return {};
  const obj = json as Record<string, unknown>;
  const out: ParsedMetadata = {};

  const kwRaw = pick(obj, 'keywords');
  const kw = typeof kwRaw === 'string' ? kwRaw.split(/[,;]+/) : kwRaw;
  // M24: batas keyword per platform — Adobe 49 (contoh resmi), Shutterstock 50 (tetap)
  if (Array.isArray(kw)) out.keywords = cleanKeywords(kw, platform === 'adobe' ? MAX_KEYWORDS_ADOBE : MAX_KEYWORDS);

  // M11: model kadang memakai key `categories` (Shutterstock) — terima `category` dulu, lalu aliasnya.
  const catRaw = pick(obj, 'category') ?? pick(obj, 'categories');
  const list = getCategories(platform);
  // Tahap B meminta ANGKA 1-21 untuk Adobe — petakan kembali ke label resmi.
  const asLabel = (x: unknown): string | null => {
    if (typeof x === 'number' && platform === 'adobe' && Number.isInteger(x)) {
      return ADOBE_CATEGORIES.find((c) => c.adobeNumber === x)?.label ?? null;
    }
    return normCat(x, list);
  };
  const norm = (Array.isArray(catRaw) ? catRaw : [catRaw]).map(asLabel).find(Boolean);
  if (norm) {
    out.category = norm;
  } else {
    // Tidak ada padanan sama sekali (nama dari model terlalu jauh / field kosong) → jangan
    // biarkan kategori kosong: pakai kategori resmi pertama sebagai isi sementara dan tandai
    // categoryAuto supaya validateMetadata menyarankan user memeriksa pilihannya.
    out.category = list[0];
    out.categoryAuto = true;
  }

  const t = pick(obj, 'title');
  if (typeof t === 'string' && t.trim()) {
    // Adobe: contoh CSV resmi — maks 200 karakter, koma dibiarkan (M24)
    out.title = platform === 'adobe' ? cleanAdobeTitle(t).slice(0, MAX_TITLE_CSV) : t.trim().slice(0, MAX_TITLE_CSV);
  }
  const d = pick(obj, 'description');
  if (typeof d === 'string' && d.trim()) out.description = d.trim().slice(0, MAX_DESCRIPTION);

  return out;
}

/* ---------------- Tahap B: metadata dari observation JSON (teks, tanpa gambar) ---------------- */

function obsBlock(obs: Observation): string {
  return 'OBSERVASI GAMBAR (satu-satunya sumber isi):\n' + JSON.stringify(obs);
}

const NO_GUESS = 'Jangan menebak nama orang, merek, lokasi, atau hal yang tidak ada di observasi. ' +
  'Setiap keyword harus bisa ditelusuri ke observasi di atas. Bahasa: English.';

/**
 * Adobe: title frasa faktual ≤70 ideal tanpa koma/bukan daftar kata/tanpa photo-of/AI/merek;
 * keywords 25-35 (maks 49) urut relevansi, 10 pertama memuat kata title, tanpa data teknis;
 * category angka 1-21 berdasar SUBJEK UTAMA.
 */
export function buildAdobeMetadataPrompt(obs: Observation, categoryHint: number | null): string {
  const cats = getCategories('adobe');
  return [
    'Buat metadata ADOBE STOCK dari observasi di bawah. ' + NO_GUESS,
    obsBlock(obs),
    '',
    `title = SATU frasa faktual tentang subjek utama, ideal ≤${ADOBE_TITLE_SUGGEST_MAX} karakter, TANPA koma, TANPA kutip/titik koma/emoji, BUKAN daftar kata, TANPA awalan "photo of"/"photograph of", TANPA merek/nama orang/artis/karakter, TANPA kata AI.`,
    `keywords = array ${ADOBE_KEYWORDS_TARGET_MIN}-${ADOBE_KEYWORDS_TARGET_MAX} (maksimal ${ADOBE_KEYWORDS_MAX}), urut relevansi; ${ADOBE_TITLE_WORDS_FIRST_N} pertama MEMUAT kata dari title. Urutan: subjek literal → aksi/setting → warna/komposisi (copy space, isolated) → konsep/mood yang didukung gambar. TANPA data teknis (ISO, mm, f/, megapixel, nama kamera, resolusi).`,
    'category = SATU ANGKA 1-21 berdasar SUBJEK UTAMA (bukan suasana): ' + cats.join(', ') + '.'
      + (categoryHint !== null ? ` Petunjuk: media datar ini umumnya ${categoryHint} (Graphic Resources).` : ''),
    '',
    'Format JSON: {"title": string, "keywords": array, "category": number}',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  ].join('\n');
}

/**
 * Shutterstock: description SATU kalimat natural 60-200 karakter (min 5 kata);
 * keywords 25-45 unik tanpa stem berulang tanpa merek hanya yang terlihat;
 * categories 1-2 nama persis resmi berdasar subjek utama.
 */
export function buildShutterstockMetadataPrompt(obs: Observation, categoryHint: string | null): string {
  const cats = getCategories('shutterstock');
  return [
    'Buat metadata SHUTTERSTOCK dari observasi di bawah. ' + NO_GUESS,
    obsBlock(obs),
    '',
    `description = SATU kalimat natural menjawab siapa/apa/di mana/kapan/mengapa sejauh terlihat; panjang ${SS_DESCRIPTION_TARGET_MIN_CHARS}-${SS_DESCRIPTION_TARGET_MAX_CHARS} karakter, minimal ${SS_DESCRIPTION_MIN_WORDS} kata; unik dan spesifik; TANPA emoji/karakter khusus/merek.`,
    `keywords = array ${SS_KEYWORDS_TARGET_MIN}-${SS_KEYWORDS_TARGET_MAX} UNIK (minimal ${SS_KEYWORDS_MIN}, maksimal ${SS_KEYWORDS_MAX}); TANPA pengulangan kata/stem yang sama; TANPA merek; HANYA yang terlihat di observasi.`,
    'categories = array 1-2 nama PERSIS dari: ' + cats.join(', ') + '.'
      + (categoryHint !== null ? ` Petunjuk: media ini cocok "${categoryHint}".` : ''),
    '',
    'Format JSON: {"description": string, "keywords": array, "categories": array}',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  ].join('\n');
}

export function buildStageBPrompt(platform: Platform, obs: Observation, categoryHint: string | number | null): string {
  return platform === 'adobe'
    ? buildAdobeMetadataPrompt(obs, typeof categoryHint === 'number' ? categoryHint : null)
    : buildShutterstockMetadataPrompt(obs, typeof categoryHint === 'string' ? categoryHint : null);
}

/* ---------------- Tahap D: verifikasi grounding ---------------- */

export function buildGroundingPrompt(obs: Observation, keywords: readonly string[]): string {
  return [
    'Periksa setiap keyword di bawah terhadap OBSERVASI gambar. Kembalikan HANYA keyword yang TIDAK didukung observasi (tidak terlihat/tidak tersirat kuat).',
    'Observasi: ' + JSON.stringify(obs),
    'Keywords: ' + JSON.stringify(keywords),
    '',
    'Format JSON: {"unsupported": string[]}',
    'Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.'
  ].join('\n');
}

function groundingError(message: string): Error {
  return Object.assign(new Error(message), { kind: 'json' });
}

/** Parser Tahap D — {unsupported: string[]}; rusak → error kind 'json' (di-retry). */
export function parseGroundingResponse(raw: string): string[] {
  const s = String(raw).trim()
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/\s*```$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b <= a) throw groundingError('JSON tidak valid');
  let json: unknown;
  try { json = JSON.parse(s.slice(a, b + 1)); }
  catch { throw groundingError('JSON tidak valid'); }
  if (typeof json !== 'object' || json === null) throw groundingError('JSON tidak valid');
  const list = (json as Record<string, unknown>).unsupported;
  if (!Array.isArray(list)) throw groundingError('Hasil grounding tidak valid: unsupported bukan array');
  return list.map((x) => String(x ?? '').trim()).filter(Boolean);
}
