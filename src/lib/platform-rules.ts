// SATU SUMBER KEBENARAN aturan platform — WAJIB dipakai oleh validate, prompt, csv,
// juri, dan counter UI. DILARANG menulis angka batas (4, 5, 6, 7, 49, 50, 70, 200,
// 2048, 60, 5000) sebagai literal di luar file ini (ditegakkan
// src/lib/platform-rules.test.ts).
//
// Status tiap RULE_ID: 'confirmed' (aturan pasti) | 'verify' (item [VERIFIKASI] —
// belum dipastikan dari sumber resmi → implementasikan sebagai peringatan
// non-pemblokir, JANGAN dijadikan alasan gagal tunggal).
import type { Platform } from './types';

export type RuleId =
  | 'ADOBE_TITLE_LEN'
  | 'ADOBE_TITLE_COMMA'
  | 'ADOBE_TITLE_WORDS'
  | 'ADOBE_KEYWORDS_RANGE'
  | 'ADOBE_KEYWORDS_TITLE_WORDS'
  | 'ADOBE_CATEGORY'
  | 'SS_DESC_LEN'
  | 'SS_DESC_SENTENCE'
  | 'SS_KEYWORDS_RANGE'
  | 'SS_KEYWORDS_UNIQUE'
  | 'SS_KEYWORDS_STEM'
  | 'SS_CATEGORIES'
  | 'IP_BRAND'
  | 'IP_PERSON_ARTIST_CHARACTER'
  | 'TECH_DATA'
  | 'AI_LABEL_IN_TEXT'
  | 'LANGUAGE_EN'
  | 'GROUNDING'
  | 'CATEGORY_FIT'
  | 'FILENAME_MATCH'
  | 'RELEASE_NEEDED'
  | 'IMAGE_QUALITY'
  | 'ADOBE_SIMILAR'
  | 'ADOBE_QUALITY_FOCUS'
  | 'ADOBE_QUALITY_EXPOSURE'
  | 'ADOBE_QUALITY_NOISE'
  | 'ADOBE_QUALITY_COLOR'
  | 'ADOBE_QUALITY_OVEREDIT'
  | 'ADOBE_MIN_RESOLUTION'
  | 'SS_OUTCOME'
  | 'SS_MIN_QUALITY'
  | 'SS_MIN_RESOLUTION'
  | 'SIMILARITY_BATCH'
  | 'CONCEPT_SATURATION';

export type RuleStatus = 'confirmed' | 'verify';

export interface RuleDef {
  status: RuleStatus;
  summary: string;
}

export const RULE_IDS: readonly RuleId[] = [
  'ADOBE_TITLE_LEN',
  'ADOBE_TITLE_COMMA',
  'ADOBE_TITLE_WORDS',
  'ADOBE_KEYWORDS_RANGE',
  'ADOBE_KEYWORDS_TITLE_WORDS',
  'ADOBE_CATEGORY',
  'SS_DESC_LEN',
  'SS_DESC_SENTENCE',
  'SS_KEYWORDS_RANGE',
  'SS_KEYWORDS_UNIQUE',
  'SS_KEYWORDS_STEM',
  'SS_CATEGORIES',
  'IP_BRAND',
  'IP_PERSON_ARTIST_CHARACTER',
  'TECH_DATA',
  'AI_LABEL_IN_TEXT',
  'LANGUAGE_EN',
  'GROUNDING',
  'CATEGORY_FIT',
  'FILENAME_MATCH',
  'RELEASE_NEEDED',
  'IMAGE_QUALITY',
  'ADOBE_SIMILAR',
  'ADOBE_QUALITY_FOCUS',
  'ADOBE_QUALITY_EXPOSURE',
  'ADOBE_QUALITY_NOISE',
  'ADOBE_QUALITY_COLOR',
  'ADOBE_QUALITY_OVEREDIT',
  'ADOBE_MIN_RESOLUTION',
  'SS_OUTCOME',
  'SS_MIN_QUALITY',
  'SS_MIN_RESOLUTION',
  'SIMILARITY_BATCH',
  'CONCEPT_SATURATION'
];

export const RULES: Record<RuleId, RuleDef> = {
  ADOBE_TITLE_LEN: {
    status: 'confirmed',
    summary: 'Adobe title: 71-200 karakter = peringatan (saran dokumentasi CSV 70); >200 = error pemblokir (batas field portal 200).'
  },
  ADOBE_TITLE_COMMA: {
    status: 'confirmed',
    summary: 'Adobe title tanpa koma dan karakter khusus (kutip, titik koma, emoji); sanitasi saat ekspor dan tandai di UI.'
  },
  ADOBE_TITLE_WORDS: {
    status: 'confirmed',
    summary: 'Adobe title berupa frasa faktual, bukan daftar kata; jangan awali dengan "photo of"/"photograph of".'
  },
  ADOBE_KEYWORDS_RANGE: {
    status: 'confirmed',
    summary: 'Adobe keywords min 5, max 49 (dihitung setelah dedupe), satu sel dipisah koma, urut relevansi.'
  },
  ADOBE_KEYWORDS_TITLE_WORDS: {
    status: 'confirmed',
    summary: 'Adobe: 10 keyword pertama sebaiknya memuat kata dari judul; peringatan jika tidak.'
  },
  ADOBE_CATEGORY: {
    status: 'confirmed',
    summary: 'Adobe category berupa ANGKA 1-21 sesuai daftar resmi.'
  },
  SS_DESC_LEN: {
    status: 'confirmed',
    summary: 'Shutterstock description min 5 kata (pemblokir), maks 2048 karakter (pemblokir); target 60-200 karakter (saran).'
  },
  SS_DESC_SENTENCE: {
    status: 'confirmed',
    summary: 'Shutterstock description berupa kalimat natural bahasa Inggris, bukan daftar kata.'
  },
  SS_KEYWORDS_RANGE: {
    status: 'confirmed',
    summary: 'Shutterstock keywords min 7 UNIK (pemblokir, setelah dedupe), max 50.'
  },
  SS_KEYWORDS_UNIQUE: {
    status: 'confirmed',
    summary: 'Duplikat persis (case-insensitive) dideduplikasi dengan pemberitahuan terlihat di UI.'
  },
  SS_KEYWORDS_STEM: {
    status: 'confirmed',
    summary: 'Peringatan untuk pengulangan kata/stem (mis. forest / forest trees / forest path).'
  },
  SS_CATEGORIES: {
    status: 'confirmed',
    summary: 'Shutterstock categories: 1 wajib, 2 maksimal, satu sel dipisah koma, nama persis dari daftar resmi.'
  },
  IP_BRAND: {
    status: 'confirmed',
    summary: 'Terlarang di judul & keyword: logo, merek, nama perusahaan/produk (peringatan; lihat brands.ts).'
  },
  IP_PERSON_ARTIST_CHARACTER: {
    status: 'confirmed',
    summary: 'Terlarang di judul & keyword: nama artis, nama orang nyata, nama karakter fiksi, instansi pemerintah (peringatan).'
  },
  TECH_DATA: {
    status: 'confirmed',
    summary: 'Adobe keywords tanpa data teknis (ISO, mm, f/, megapixel, nama kamera, resolusi) — peringatan.'
  },
  AI_LABEL_IN_TEXT: {
    status: 'confirmed',
    summary: 'Jangan tulis "generative AI"/"AI generated" di judul/keyword/deskripsi (peringatan).'
  },
  LANGUAGE_EN: {
    status: 'confirmed',
    summary: 'Judul dan keyword satu bahasa (English); kata Indonesia umum memicu peringatan.'
  },
  GROUNDING: {
    status: 'confirmed',
    summary: 'Setiap keyword harus bisa ditelusuri ke isi gambar (observation); item tak didukung dihapus dan terlihat di UI.'
  },
  CATEGORY_FIT: {
    status: 'confirmed',
    summary: 'Kategori harus sesuai subjek utama gambar (peringatan "perlu ditinjau" bila tidak cocok).'
  },
  FILENAME_MATCH: {
    status: 'confirmed',
    summary: 'Kolom Filename harus SAMA PERSIS dengan nama file di portal (ekstensi dan huruf besar/kecil).'
  },
  RELEASE_NEEDED: {
    status: 'confirmed',
    summary: 'Wajah dikenali / merek terlihat / properti privat → pengingat model/property release (peringatan).'
  },
  // TODO [VERIFIKASI]: kebijakan konten AI Shutterstock, aturan release/properti, dan
  // panduan IP lengkap belum dibaca dari sumber resmi — hanya peringatan umum, jangan
  // jadikan aturan keras.
  IMAGE_QUALITY: {
    status: 'verify',
    summary: 'Kualitas gambar (fokus, noise, exposure) dinilai dari observation; peringatan umum saja.'
  },
  // TODO [VERIFIKASI]: semua ambang kualitas/risiko di bawah adalah heuristik yang bisa
  // disetel via kalibrasi — bukan ambang platform. Hanya peringatan/bukti, kecuali
  // resolusi minimum resmi (error pemblokir per platform).
  ADOBE_SIMILAR: {
    status: 'verify',
    summary: 'Adobe menolak konten terlalu mirip (sudut/pose berulang, ubahan warna/zoom kecil); sinyal internal batch saja.'
  },
  ADOBE_QUALITY_FOCUS: {
    status: 'verify',
    summary: 'Fokus lembut (varians Laplacian + fraksi tile tajam); heuristik, bukan ambang Adobe.'
  },
  ADOBE_QUALITY_EXPOSURE: {
    status: 'verify',
    summary: 'Eksposur (luminans, highlight/shadow terpotong); heuristik.'
  },
  ADOBE_QUALITY_NOISE: {
    status: 'verify',
    summary: 'Noise/artefak/debu (area datar + inspeksi crop 100%); heuristik.'
  },
  ADOBE_QUALITY_COLOR: {
    status: 'verify',
    summary: 'White balance/saturasi tidak wajar; heuristik (WB hanya photo).'
  },
  ADOBE_QUALITY_OVEREDIT: {
    status: 'verify',
    summary: 'Over-edit/penajaman berlebih/halo (blokiness JPEG + crop); heuristik.'
  },
  ADOBE_MIN_RESOLUTION: {
    status: 'verify',
    summary: 'Adobe foto min 4MP (JPEG); vektor min artboard 15MP. Di bawah minimum = error pemblokir.'
  },
  SS_OUTCOME: {
    status: 'verify',
    summary: 'Estimasi tiga arah Shutterstock (marketplace / data licensing saja / ditolak); bukan keputusan platform.'
  },
  SS_MIN_QUALITY: {
    status: 'verify',
    summary: 'Kualitas di bawah minimum menurut metrik/inspeksi → Data licensing saja (tidak masuk marketplace).'
  },
  SS_MIN_RESOLUTION: {
    status: 'verify',
    summary: 'Shutterstock foto/ilustrasi min 4MP (JPEG/TIFF). Di bawah minimum = error pemblokir.'
  },
  SIMILARITY_BATCH: {
    status: 'verify',
    summary: 'Kemiripan dalam batch + riwayat lokal (hash saja); ambang disetel via kalibrasi.'
  },
  CONCEPT_SATURATION: {
    status: 'verify',
    summary: 'Kejenuhan konsep dinilai AI; perkiraan subjektif, bukan data koleksi platform.'
  }
};

/* ---------------- batas angka (jangan duplikasi di file lain) ---------------- */

// TODO [VERIFIKASI]: apakah impor CSV Adobe menolak judul >70? Bukti portal: field
// judul "max 200 characters", dokumentasi CSV menyebut 70. Sementara: 71-200 =
// peringatan non-pemblokir, >200 = error pemblokir. Uji manual dengan judul ~100 karakter.
export const ADOBE_TITLE_SUGGEST_MAX = 70;
export const ADOBE_TITLE_MAX = 200;

export const ADOBE_KEYWORDS_MIN = 5;
export const ADOBE_KEYWORDS_MAX = 49;
export const ADOBE_KEYWORDS_TARGET_MIN = 25;
export const ADOBE_KEYWORDS_TARGET_MAX = 35;
/** 10 keyword pertama sebaiknya memuat kata dari judul */
export const ADOBE_TITLE_WORDS_FIRST_N = 10;

export const SS_DESCRIPTION_MIN_WORDS = 5;
export const SS_DESCRIPTION_MAX_CHARS = 2048;
export const SS_DESCRIPTION_TARGET_MIN_CHARS = 60;
export const SS_DESCRIPTION_TARGET_MAX_CHARS = 200;

export const SS_KEYWORDS_MIN = 7;
export const SS_KEYWORDS_MAX = 50;
export const SS_KEYWORDS_TARGET_MIN = 25;
export const SS_KEYWORDS_TARGET_MAX = 45;

export const CSV_MAX_BYTES = 1048576; // 1 MB
export const CSV_MAX_ROWS = 5000; // baris data (di luar header)

/** default BOM aktif; bisa dimatikan pengguna */
export const CSV_BOM_DEFAULT = true;

/** juri ideal 3, minimal 1 */
export const JUDGE_IDEAL_COUNT = 3;
export const JUDGE_MIN_COUNT = 1;

/** rata-rata confidence di bawah ini → PERLU DITINJAU */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** toggle "Verifikasi ketat" (grounding Tahap D), default aktif */
export const STRICT_VERIFY_DEFAULT = true;

/** toggle "kirim gambar ke juri", default aktif */
export const JUDGE_SEND_IMAGE_DEFAULT = true;

/* ---------------- kategori: { id, adobeNumber | ssName, label } ---------------- */

export interface CategoryEntry {
  id: string;
  label: string;
  adobeNumber?: number;
  ssName?: string;
}

/** Adobe memakai ANGKA 1-21 di CSV; label untuk tampilan. */
export const ADOBE_CATEGORIES: readonly CategoryEntry[] = [
  { id: 'adobe-animals', label: 'Animals', adobeNumber: 1 },
  { id: 'adobe-buildings', label: 'Buildings and Architecture', adobeNumber: 2 },
  { id: 'adobe-business', label: 'Business', adobeNumber: 3 },
  { id: 'adobe-drinks', label: 'Drinks', adobeNumber: 4 },
  { id: 'adobe-environment', label: 'The Environment', adobeNumber: 5 },
  { id: 'adobe-states-of-mind', label: 'States of Mind', adobeNumber: 6 },
  { id: 'adobe-food', label: 'Food', adobeNumber: 7 },
  { id: 'adobe-graphic-resources', label: 'Graphic Resources', adobeNumber: 8 },
  { id: 'adobe-hobbies', label: 'Hobbies and Leisure', adobeNumber: 9 },
  { id: 'adobe-industry', label: 'Industry', adobeNumber: 10 },
  { id: 'adobe-landscapes', label: 'Landscapes', adobeNumber: 11 },
  { id: 'adobe-lifestyle', label: 'Lifestyle', adobeNumber: 12 },
  { id: 'adobe-people', label: 'People', adobeNumber: 13 },
  { id: 'adobe-plants', label: 'Plants and Flowers', adobeNumber: 14 },
  { id: 'adobe-culture', label: 'Culture and Religion', adobeNumber: 15 },
  { id: 'adobe-science', label: 'Science', adobeNumber: 16 },
  { id: 'adobe-social-issues', label: 'Social Issues', adobeNumber: 17 },
  { id: 'adobe-sports', label: 'Sports', adobeNumber: 18 },
  { id: 'adobe-technology', label: 'Technology', adobeNumber: 19 },
  { id: 'adobe-transport', label: 'Transport', adobeNumber: 20 },
  { id: 'adobe-travel', label: 'Travel', adobeNumber: 21 }
];

// TODO [VERIFIKASI]: "Arts" vs "The Arts"; apakah "Celebrities" tersedia — cocokkan
// dengan dropdown Kategori di portal Submit Shutterstock sebelum batch besar.
export const SHUTTERSTOCK_CATEGORIES: readonly CategoryEntry[] = [
  'Abstract', 'Animals/Wildlife', 'Arts', 'Backgrounds/Textures', 'Beauty/Fashion',
  'Buildings/Landmarks', 'Business/Finance', 'Celebrities', 'Education',
  'Food and Drink', 'Healthcare/Medical', 'Holidays', 'Industrial', 'Interiors',
  'Miscellaneous', 'Nature', 'Objects', 'Parks/Outdoor', 'People', 'Religion',
  'Science', 'Signs/Symbols', 'Sports/Recreation', 'Technology', 'Transportation',
  'Vintage'
].map((label) => ({
  id: 'ss-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  label,
  ssName: label
}));

export function adobeCategoryLabels(): string[] {
  return ADOBE_CATEGORIES.map((c) => c.label);
}

export function adobeNumberByLabel(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of ADOBE_CATEGORIES) {
    if (c.adobeNumber !== undefined) out[c.label] = c.adobeNumber;
  }
  return out;
}

export function shutterstockCategoryNames(): string[] {
  return SHUTTERSTOCK_CATEGORIES.map((c) => c.ssName as string);
}

/* ---------------- header & nama file CSV ---------------- */

export const ADOBE_CSV_HEADER: readonly string[] = ['Filename', 'Title', 'Keywords', 'Category', 'Releases'];

export const SHUTTERSTOCK_CSV_HEADER_BASE: readonly string[] = ['Filename', 'Description', 'Keywords', 'Categories'];

/** kolom opsional E-G Shutterstock, urutan tetap, nilai Yes/No */
export const SHUTTERSTOCK_CSV_OPTIONAL: readonly string[] = ['Illustration', 'Mature content', 'Editorial'];

export const SHUTTERSTOCK_OPTIONAL_YES = 'Yes';
export const SHUTTERSTOCK_OPTIONAL_NO = 'No';

/** nama file CSV tanpa spasi, mis. StockMeta_Adobe_2026-10-04.csv */
export function csvFileName(platform: Platform, date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  const slug = platform === 'adobe' ? 'Adobe' : 'Shutterstock';
  return 'StockMeta_' + slug + '_' + stamp + '.csv';
}

/** ekstensi yang tidak memicu peringatan (huruf kecil, termasuk titik) */
export const ALLOWED_PORTAL_EXTENSIONS: readonly string[] = ['.jpg', '.jpeg', '.eps', '.svg', '.ai', '.tif', '.tiff'];

/* ---------------- pola deteksi (cek keras, tanpa AI) ---------------- */

/** data teknis yang dilarang di keyword Adobe */
export const TECH_DATA_PATTERNS: readonly RegExp[] = [
  /\biso\s*\d+/i,
  /\b\d+\s*mm\b/i,
  /\bf\/\s*\d/i,
  /\bmegapixels?\b/i,
  /\b\d+(\.\d+)?\s*mp\b/i,
  /\b\d+\s*x\s*\d+\s*(px|pixels?)?\b/i,
  /\b(4k|8k|uhd|hd|full\s*hd)\b/i,
  /\b(dslr|mirrorless|canon|nikon|sony|fujifilm|lumix|leica|hasselblad|olympus|pentax)\b/i
];

/** kata Indonesia umum — kemunculannya memicu peringatan LANGUAGE_EN */
export const INDONESIAN_COMMON_WORDS: readonly string[] = [
  'yang', 'dan', 'atau', 'dengan', 'untuk', 'dari', 'dalam', 'pada', 'kepada',
  'adalah', 'sebagai', 'karena', 'tetapi', 'namun', 'jika', 'kalau', 'agar',
  'supaya', 'ini', 'itu', 'tersebut', 'tidak', 'bukan', 'belum', 'sudah',
  'telah', 'akan', 'sedang', 'sangat', 'lebih', 'paling', 'sebuah', 'seorang',
  'para', 'kami', 'kita', 'mereka', 'anda', 'saya', 'aku', 'dia', 'oleh',
  'tentang', 'antara', 'setiap', 'semua', 'juga', 'hanya', 'saja', 'dapat',
  'bisa', 'harus', 'perlu', 'ada', 'ialah', 'di', 'ke', 'gambar', 'foto',
  'terlihat', 'tampak', 'menampilkan', 'seperti', 'bagai', 'latar', 'belakang'
];

export const AI_LABEL_PATTERN = /generative\s*ai|ai[\s-]*generated/i;

/** awalan judul yang dilarang ("photo of …" / "photograph of …") */
export const TITLE_PHOTO_OF_PATTERN = /^\s*(photos?\s+of|photographs?\s+of)\b/i;

export const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;

/* ---------------- sanitasi judul Adobe ---------------- */

export interface SanitizeResult {
  text: string;
  /** true bila ada karakter yang diganti/dihapus (wajib ditandai di UI) */
  changed: boolean;
}

/**
 * Sanitasi judul Adobe untuk CSV: koma, titik koma, semua bentuk kutip, dan emoji
 * diganti spasi (lalu spasi dirapikan). TIDAK memotong panjang — kelebihan
 * ADOBE_TITLE_MAX ditangani validasi sebagai error pemblokir, bukan diam-diam.
 */
export function sanitizeAdobeTitle(title: string): SanitizeResult {
  const cleaned = title
    .replace(/[,;"'“”‘’`]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return { text: cleaned, changed: cleaned !== title.trim().replace(/\s+/g, ' ').trim() };
}

/* ---------------- langkah manual di portal ---------------- */

export const ADOBE_MANUAL_STEPS: readonly string[] = [
  'Centang "Created using generative AI tools" bila konten dibuat/dibantu AI (keputusan Anda sendiri; jangan tulis di judul/keyword).',
  'Jawab "People and Property are fictional" bila berlaku.',
  'Centang "This is an icon" untuk ikon.',
  'Jawab "Recognizable people or property? Yes/No" sesuai isi gambar (butuh release bila Yes).',
  'Pilih tipe aset: Photos / Illustrations / Vectors.',
  'Centang "This is Illustrative Editorial content" bila konten editorial ilustratif.'
];

export const SHUTTERSTOCK_MANUAL_STEPS: readonly string[] = [
  'Atur "Jenis gambar" (contoh: Foto) di portal.',
  'Atur "Penggunaan": Komersial atau Editorial.',
  'Periksa panel "Rilis" (model/property release) bila ada wajah dikenali atau properti privat.',
  // TODO [VERIFIKASI]: apakah impor CSV menimpa deskripsi bawaan dari metadata file
  // (contoh portal: "Opened ingredient" sudah terisi sebelum CSV diimpor) — cek manual
  // saat uji impor pertama.
  'Periksa deskripsi bawaan dari metadata file — pastikan impor CSV menghasilkan deskripsi yang diinginkan.'
];

/* ---------------- blok ATURAN untuk prompt juri ---------------- */

/**
 * Render blok aturan platform untuk prompt juri — SELALU dari RULES di file ini
 * (bukan teks hardcode di modul juri). Item 'verify' ditandai eksplisit agar juri
 * TIDAK menjadikannya satu-satunya alasan gagal.
 */
export function renderRulesBlock(platform: Platform): string {
  const ids: readonly RuleId[] = platform === 'adobe'
    ? ['ADOBE_TITLE_LEN', 'ADOBE_TITLE_COMMA', 'ADOBE_TITLE_WORDS', 'ADOBE_KEYWORDS_RANGE', 'ADOBE_KEYWORDS_TITLE_WORDS', 'ADOBE_CATEGORY', 'IP_BRAND', 'IP_PERSON_ARTIST_CHARACTER', 'TECH_DATA', 'AI_LABEL_IN_TEXT', 'LANGUAGE_EN', 'GROUNDING', 'CATEGORY_FIT', 'FILENAME_MATCH', 'RELEASE_NEEDED', 'IMAGE_QUALITY', 'ADOBE_SIMILAR', 'ADOBE_QUALITY_FOCUS', 'ADOBE_QUALITY_EXPOSURE', 'ADOBE_QUALITY_NOISE', 'ADOBE_QUALITY_COLOR', 'ADOBE_QUALITY_OVEREDIT', 'ADOBE_MIN_RESOLUTION', 'SIMILARITY_BATCH', 'CONCEPT_SATURATION']
    : ['SS_DESC_LEN', 'SS_DESC_SENTENCE', 'SS_KEYWORDS_RANGE', 'SS_KEYWORDS_UNIQUE', 'SS_KEYWORDS_STEM', 'SS_CATEGORIES', 'IP_BRAND', 'IP_PERSON_ARTIST_CHARACTER', 'AI_LABEL_IN_TEXT', 'LANGUAGE_EN', 'GROUNDING', 'CATEGORY_FIT', 'FILENAME_MATCH', 'RELEASE_NEEDED', 'IMAGE_QUALITY', 'SS_OUTCOME', 'SS_MIN_QUALITY', 'SS_MIN_RESOLUTION', 'SIMILARITY_BATCH', 'CONCEPT_SATURATION'];
  const lines = ids.map((id) => {
    const rule = RULES[id];
    const tag = rule.status === 'verify' ? ' [belum pasti — JANGAN jadikan satu-satunya alasan gagal]' : '';
    return '- ' + id + ': ' + rule.summary + tag;
  });
  return 'ATURAN ' + (platform === 'adobe' ? 'ADOBE STOCK' : 'SHUTTERSTOCK') + ' (nilai HANYA berdasar daftar ini):\n' + lines.join('\n');
}
