// Prompt anti-generic + parser hasil model — port setia dari legacy/js/prompt-builder.js dan
// parseJsonLoose + normalisasi di providers-gemini.js/app.js (tanpa panggilan jaringan).
import { getCategories, normCat } from './categories';
import { cleanAdobeTitle } from './metadata';
import { MAX_DESCRIPTION, MAX_KEYWORDS, MAX_KEYWORDS_ADOBE, MAX_TITLE_CSV } from './limits';
import type { Platform } from './types';

export function buildMetadataPrompt({ platform, theme }: { platform: Platform; theme?: string }): string {
  const cats = getCategories(platform);
  const jsonFormat = platform === 'adobe'
    ? `{"title": string maks ${MAX_TITLE_CSV} karakter dan TANPA koma (ganti koma dengan kata sambung atau spasi), "keywords": array 15-35 kata, "category": string — salah satu persis dari daftar kategori di atas}`
    : `{"description": string kalimat deskriptif lengkap minimal 5 kata dan maksimal sekitar ${MAX_DESCRIPTION} karakter (BUKAN daftar kata), "keywords": array 15-40 kata, "category": array 1-2 string persis dari daftar kategori di atas}`;

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
  const norm = (Array.isArray(catRaw) ? catRaw : [catRaw])
    .map((x) => normCat(x, list))
    .find(Boolean);
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
    out.title = platform === 'adobe' ? cleanAdobeTitle(t).slice(0, MAX_TITLE_CSV) : t.trim().slice(0, 200);
  }
  const d = pick(obj, 'description');
  if (typeof d === 'string' && d.trim()) out.description = d.trim().slice(0, MAX_DESCRIPTION);

  return out;
}
