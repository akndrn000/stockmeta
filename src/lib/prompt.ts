// Prompt anti-generic + parser hasil model — port setia dari legacy/js/prompt-builder.js dan
// parseJsonLoose + normalisasi di providers-gemini.js/app.js (tanpa panggilan jaringan).
import { getCategories, normCat, SS_CATEGORIES_REQUIRED } from './categories';
import { cleanAdobeTitle, cleanShutterstockDescription } from './metadata';
import {
  GENERIC_BAN_WORDS,
  KEYWORD_PHRASE_MAX,
  KEYWORD_USAGE_MAX,
  MAX_DESCRIPTION_SHUTTER,
  MAX_KEYWORDS,
  MAX_KEYWORDS_ADOBE,
  MAX_TITLE_CSV,
  PLATFORM_TOP_KEYWORDS,
  PROMPT_TARGET_ADOBE_MIN,
  PROMPT_TARGET_SHUTTER_MIN,
  SS_DESCRIPTION_SUGGEST,
  TARGET_KEYWORDS_MAX
} from './limits';
import { STAGE_B_WITH_IMAGE } from './providers/models';
import type { Platform } from './types';

// Instruksi bahasa Inggris — WAJIB ada paling atas dan diulang di akhir prompt.
export const ENGLISH_INSTRUCTION =
  'Tulis SELURUH output (title/description, keywords) dalam bahasa Inggris. Jika tema diberikan dalam bahasa lain, terjemahkan ke istilah Inggris baku.';

// Instruksi koreksi untuk regenerasi bahasa (dipakai tepat satu kali oleh pipeline).
export const LANGUAGE_FIX_INSTRUCTION =
  'Koreksi bahasa: tulis ULANG seluruh output dalam bahasa Inggris baku (title/description satu kalimat Inggris natural, semua keywords Inggris). Jangan sisakan kata Indonesia.';

export function buildMetadataPrompt({ platform, theme, languageFix, retryNote }: { platform: Platform; theme?: string; languageFix?: boolean; retryNote?: string }): string {
  const cats = getCategories(platform);
  // Target jumlah per platform: Adobe 35–49 (maksimal 49), Shutterstock 25–50.
  // Lantai validasi keras (5/7) dan saran kualitas (<30) tetap di validate.ts.
  const targetMin = platform === 'adobe' ? PROMPT_TARGET_ADOBE_MIN : PROMPT_TARGET_SHUTTER_MIN;
  const targetMax = platform === 'adobe' ? TARGET_KEYWORDS_MAX : MAX_KEYWORDS;
  const platformMax = platform === 'adobe' ? MAX_KEYWORDS_ADOBE : MAX_KEYWORDS;
  // Urutan field: visible_facts DULU (menentukan keyword), baru title/description,
  // keywords, category. Tanpa field confidence/notes (tak ada konsumennya).
  const jsonFormat = platform === 'adobe'
    ? `{"visible_facts": array string pendek fakta visual — SATU fakta per butir (objek utama, jumlah, bagian/kostum, warna SETIAP bagian menempel bagiannya, bentuk, motif, bahan, aksi/pose, latar singkat, ada/tidaknya teks, gaya aset), "title": string maks ${MAX_TITLE_CSV} karakter (Inggris, kapital di awal, tanpa koma, boleh multikata), "keywords": array ${targetMin}-${targetMax} objek {k, src, of?, rel?, kind?, standalone?} (maksimal ${platformMax} kata, yang paling penting dulu), "category": string — salah satu persis dari daftar kategori di atas, "theme_canonical": string Inggris baku untuk tema, "theme_fit": boolean (tema didukung gambar?), "theme_evidence": string elemen gambar pendukung tema (wajib bila theme_fit true), "observation": {...lihat Tahap A...}}`
    : `{"visible_facts": array string pendek fakta visual — SATU fakta per butir (objek utama, jumlah, bagian/kostum, warna SETIAP bagian menempel bagiannya, bentuk, motif, bahan, aksi/pose, latar singkat, ada/tidaknya teks, gaya aset), "description": string SATU kalimat Inggris natural TANPA koma sama sekali (diawali subjek utama, lalu elemen kunci, lalu tema bila cocok; minimal 5 kata, ideal ${SS_DESCRIPTION_SUGGEST.MIN}–${SS_DESCRIPTION_SUGGEST.MAX} karakter SATU kalimat, pagar ${MAX_DESCRIPTION_SHUTTER} karakter, BUKAN daftar kata, boleh multikata), "keywords": array ${targetMin}-${targetMax} objek {k, src, of?, rel?, kind?, standalone?}, "category": array TEPAT ${SS_CATEGORIES_REQUIRED} string BERBEDA persis dari daftar kategori di atas, "theme_canonical": string Inggris baku untuk tema, "theme_fit": boolean, "theme_evidence": string (wajib bila theme_fit true), "observation": {...lihat Tahap A...}}`;

  // Daftar kata generik yang dilarang — satu sumber (limits.ts GENERIC_BAN_WORDS).
  const bannedGeneric = GENERIC_BAN_WORDS.join(', ');

  const lines = [
    ENGLISH_INSTRUCTION,
    '',
    'PERAN: Kamu kurator metadata microstock (Adobe Stock & Shutterstock) yang',
    'MELIHAT gambar terlampir dan menulis metadata siap jual dalam bahasa Inggris.',
    'TUGAS: amati gambar DULU (Tahap A), BARU tulis metadata valid (Tahap B).',
    'Hanya tulis hal yang benar-benar TERLIHAT atau menjadi makna gambar yang jelas.',
    '',
    'TAHAP A — AMATI GAMBAR (tulis apa adanya, kata tunggal Inggris per butir):',
    'Tulis DULU "visible_facts", BARU "observation" dan metadata. Satu butir = satu',
    'fakta pendek: objek utama, JUMLAH tiap objek, bagian/kostum/aksesori/dekorasi,',
    'warna SETIAP bagian (warna menempel pada bagiannya — jangan menempelkan satu',
    'warna ke seluruh subjek bila tidak benar), bentuk, motif, bahan, aksi/pose,',
    'latar singkat, ADA atau TIDAK ADANYA teks di gambar, dan gaya aset (photo,',
    'vector, illustration). JANGAN mengarang. visible_facts tidak ditampilkan ke',
    'pembeli tetapi MENENTUKAN keyword: setiap warna dan klaim spesifik di keyword,',
    'judul, dan deskripsi HARUS ada tertulis di sini.',
    'Isi "observation" dengan yang BENAR-BENAR terlihat. "objects" HANYA berisi',
    'subjek utama gambar (satu-dua benda/makhluk, mis. untuk foto close-up mata:',
    'objects boleh ["eye"]); anatomi generik (ears, eyes, mouth, nose, face, head,',
    'body, limbs, legs, arms, hands, paws, fingers, teeth, hair, tail, dan sejenisnya)',
    'DILARANG masuk daftar mana pun kecuali kata itu subjek utama di "objects".',
    '"parts" (bagian/kostum/aksesori/dekorasi khas: topi, sayap, kerah, ...), "patterns"',
    '(pola: garis, titik, ...), "materials" (bahan: kayu, logam, kain, ...), "shapes"',
    '(bentuk: bulat, persegi, ...), "styles" (gaya visual), "moods" (suasana), "usages"',
    '(kemungkinan pemakaian gambar ini), "colors" (warna identitas subjek), "media_type"',
    '("photo" untuk foto, "illustration"/"vector" untuk ilustrasi/vektor).',
    'JANGAN mengarang isi yang tidak terlihat. Latar dan sudut pandang TIDAK dipakai',
    'untuk keyword — cukup catat warnanya bila menjadi identitas subjek.',
    'Pastikan tiap dimensi terisi bila terlihat: subjek utama, aksi/pose, objek',
    'pendukung, warna dominan tiap bagian, bahan/tekstur, suasana, lokasi/latar,',
    'gaya visual, dan konsep yang diwakili gambar.'
  ];
  if (theme) {
    lines.push(
      'Tema utama dari kontributor: "' + theme + '".',
      'Kalau elemen visual di gambar konsisten dengan tema ini, KEMBANGKAN keyword dan title/description dengan istilah-istilah Inggris yang relevan dengan tema tersebut — SESUAIKAN dengan yang benar-benar cocok dengan visual gambar, jangan asal comot semua istilah generik tema itu.',
      'Kalau visual gambar TIDAK konsisten dengan tema yang disebutkan, ABAIKAN tema ini sepenuhnya dan deskripsikan apa adanya.',
      'Tema dari kontributor hanya konteks tambahan untuk foto ini: pakai kata tema HANYA bila relevan dengan foto ini, jangan menyalin kata tema ke foto lain.'
    );
  }
  lines.push(
    '',
    'TAHAP B — TULIS METADATA (aturan keyword WAJIB dipatuhi, dilanggar = gagal):',
    STAGE_B_WITH_IMAGE
      ? 'Nilailah seperti manusia yang MELIHAT gambar terlampir (bukan dari teks saja): cocokkan setiap kata dengan gambar + pengamatan Tahap A.'
      : 'Gunakan teks pengamatan Tahap A sebagai acuan utama.',
    'ATURAN KATA KUNCI (dilanggar = gagal — hanya tulis yang terlihat/jelas):',
    '1. Campur kata tunggal dan frasa pendek yang wajar dicari pembeli. Default',
    '   HANYA SATU KATA per keyword: satu token tanpa spasi, huruf kecil',
    '   (tanda hubung hanya untuk istilah baku satu kata, mis. t-shirt atau trick-or-treat).',
    `   Istilah DUA kata baku yang benar-benar dicari orang diizinkan maksimal ${KEYWORD_PHRASE_MAX}`,
    '   per generasi, TIDAK PERNAH tiga kata (mis. black cat atau red wine boleh; tiga kata',
    '   seperti hot air balloon tidak pernah dipakai). Tulis frasa sesuai urutan pencarian',
    '   yang wajar (mis. "bicycle basket", bukan "basket bicycle"). Setiap kata penyusun frasa harus ada di',
    '   pengamatan atau tema; frasa tak boleh memuat kata latar atau anatomi generik.',
    '   Tambahkan "standalone": true/false per keyword satu kata = apakah pembeli akan',
    '   mencari kata itu SENDIRIAN untuk gambar ini (mis. "kit" dari "first aid kit",',
    '   "print" dari "paw print", dan "handle" dari "bag handle" umumnya TIDAK bermakna',
    '   sendirian → standalone false; istilah utuh seperti "first aid kit" dipertahankan,',
    '   potongan tak bermakna dibuang). Untuk satu frasa, kirim maksimal SATU kata',
    '   komponennya sebagai keyword terpisah.',
    '2. SEMUA YANG BERKAITAN DENGAN LATAR DILARANG: background, backdrop, isolated,',
    '   isolate, cutout, transparent, plain, blank, copyspace, studio, dan sejenisnya.',
    '   DILARANG kata generik/tidak informatif: ' + bannedGeneric + ', photo, picture,',
    '   image, design — KECUALI tepat satu kata media yang sesuai jenis file foto/',
    '   ilustrasi (photo/illustration/vector), maksimal 1, dan TIDAK PERNAH di 10 teratas.',
    '   Anatomi generik (ears, eyes, mouth, nose, face, head, body, limbs, legs, arms,',
    '   hands, paws, fingers, teeth, hair, tail, dan sejenisnya) DILARANG kecuali kata',
    '   itu subjek utama di "objects". Juga dilarang deskriptor tanpa nilai cari:',
    '   symmetric, centered, simple, clean.',
    '3. SETIAP KEYWORD WAJIB PUNYA SUMBER ("src"):',
    '   - "visible": subjek utama, pakaian/kostum/aksesori, atau elemen dekoratif khas',
    '     yang TERTULIS di pengamatan. BUKAN anatomi generik.',
    '   - "attribute": pola, bahan, bentuk, gaya, atau warna identitas yang TERTULIS',
    '     di pengamatan;',
    '   - "synonym": WAJIB {"of": kata sumber yang ADA di pengamatan, "rel": salah satu',
    '     "synonym" (setara) | "parent" (induk/kelompok) | "specific" (jenis lebih spesifik',
    '     dari yang tampak)}. DILARANG kata untuk jenis/benda LAIN meski sekeluarga:',
    '     contoh yang salah: "puppy" untuk foto kucing, "lemon" untuk foto jeruk,',
    '     "truck" untuk foto mobil sedan.',
    '   - "theme": WAJIB {"kind": salah satu "event"|"season"|"mood"|"activity"|"usage"}.',
    '     Konsep HARUS abstrak — DILARANG makhluk, tokoh, atau benda fisik (kecuali',
    '     tertulis di pengamatan). HANYA bila theme_fit true dan theme_evidence tidak',
    '     kosong.',
    '   - "usage": konteks pemakaian yang masuk akal untuk jenis media gambar ini,',
    `     maksimal ${KEYWORD_USAGE_MAX}. Kata seperti sticker, poster, greeting hanya bila`,
    '     media ilustrasi/vektor.',
    '   Tanpa src yang sah = DIBUANG. Kata media (illustration, vector, photo, dan',
    '   sejenisnya) hanya bila sesuai media_type, maksimal 3. Kata pengisi generik',
    '   (graphic, design, clipart, icon, dan sejenisnya) DILARANG kecuali tercatat',
    '   sebagai bagian media_type. DILARANG MENGARANG: bila tidak ada hubungan dengan',
    '   gambar dan tema, jangan dibuat.',
    `4. JUMLAH: Hasilkan ANTARA ${targetMin} SAMPAI ${targetMax} kata kunci (bukan kurang dari ${targetMin} kecuali gambar benar-benar sangat sederhana/minim elemen). Instruksi kuat ini adalah permintaan AWAL — bila hasil tetap di bawah ${targetMin}, satu follow-up top-up otomatis (jaring pengaman, lihat providers/topup.ts) akan meminta tambahannya. Kata kunci HARUS akurat dan benar-benar relevan dengan apa yang TERLIHAT di gambar dan tema yang diberikan — JANGAN mengarang kata kunci yang tidak berhubungan hanya untuk mengejar jumlah. Urutan: paling relevan/spesifik dulu, baru variasi sinonim, kategori umum, mood/gaya, warna, komposisi, dan konteks tema. Kembangkan dari berbagai sudut: subjek utama, aksi/pose, latar/lingkungan, gaya visual (misal flat design, 3D, vector, dsb), warna dominan, mood/emosi, kategori penggunaan (misal untuk desain apa), istilah terkait tema musiman kalau ada tema yang diisi. Detail urutan: subjek`,
    '   utama dan varian terdekat, kata inti theme_canonical, elemen/kostum kunci, jenis',
    '   media, gaya/suasana, sinonim/induk, konsep tema abstrak, usage, warna identitas',
    '   (maksimal 2, paling akhir). Judul dan deskripsi tetap boleh multikata.',
    '5. DASAR FAKTA: setiap keyword harus berdasar visible_facts, atau konsep',
    '   event/season/mood/activity/usage yang didukung tema DAN cocok dengan gambar',
    '   (maksimal 6 keyword konsep seperti ini).',
    '6. WARNA: hanya warna yang tertulis di visible_facts, menempel pada bagiannya.',
    '   DILARANG pasangan yang saling bertentangan untuk satu bagian yang sama.',
    '7. Spesies, usia, jenis kelamin, dan profesi (kitten, puppy, baby, child, boy,',
    '   girl, man, woman, family, couple, dan sejenisnya) hanya bila jelas terlihat.',
    '   Bila ragu, pakai istilah umum ("cat", bukan "kitten").',
    '8. AKURASI SEBELUM KUANTITAS: Jangan tambahkan kata kunci yang tidak relevan',
    '   hanya untuk mencapai jumlah minimum — kualitas dan relevansi lebih penting',
    '   daripada sekadar jumlah. Bila gambar benar-benar sangat sederhana/minim elemen,',
    '   hasil di bawah target dapat diterima daripada mengarang kata generik.',
    '9. Frasa = frasa pencarian yang wajar ("moon lantern", "cat costume"), bukan',
    '   tumpukan kata acak. Hindari tumpang tindih: jangan menulis kata tunggal dan',
    '   beberapa frasa yang hanya menambah kata kecil padanya, berulang-ulang.',
    '   Singular dan plural dianggap sama.',
    '10. DILARANG: merek, nama orang, nama seniman, nama tempat spesifik yang tidak',
    '    terlihat di gambar, "AI generated", kata promosi.',
    '11. Kata generik (vector, illustration, icon, cute, dan sejenisnya) BUKAN kata',
    '    utama — validator menaruhnya paling akhir.',
    '12. Dedup SECARA MAKNA, bukan hanya ejaan: jangan menulis dua kata/frasa yang',
    '    artinya sama untuk gambar ini. Singular dan plural dianggap sama.',
    '13. Semua keyword bahasa Inggris, huruf kecil, tanpa tanda baca, tanpa duplikat.',
    '    DILARANG menebak merek, nama orang, atau tempat spesifik yang tidak terlihat.',
    '',
    'URUTAN KEYWORD (menentukan peringkat pencarian): posisi 1-3 subjek utama paling',
    'spesifik (frasa benda yang paling pas); posisi 4-7 ciri visual pembeda (bagian,',
    'motif, warna per bagian, aksi); sisa slot teratas untuk tema/acara/konsep pembeli',
    `yang cocok gambar; setelahnya kata sekunder, generik dan gaya aset paling akhir. ${PLATFORM_TOP_KEYWORDS.adobe} teratas (Adobe) / ${PLATFORM_TOP_KEYWORDS.shutterstock} teratas (Shutterstock) bebas kata generik.`,
    '10 kata pertama adalah frasa pencarian yang paling mungkin dipakai pembeli untuk',
    'menemukan gambar ini — subjek utama dan frasa pencariannya ada di awal.',
    'Keyword pertama harus berasal dari subjek yang juga ada di judul/deskripsi.',
    '',
    'ATURAN PENTING UNTUK TITLE/DESCRIPTION:',
    "- JANGAN gunakan frasa generik seperti 'isolated on white background', 'stock photo', atau sejenisnya kecuali itu benar-benar bagian penting dari komposisi visual",
    '- Fokus pada SUBJEK, AKSI, GAYA VISUAL, dan MOOD yang spesifik dan bisa dicari orang',
    '- Kalau ada elemen musiman/perayaan yang terlihat jelas (kostum, dekorasi, warna khas), sebutkan secara eksplisit dengan istilah Inggris baku',
    '- Warna dan klaim spesifik di judul/deskripsi HANYA dari visible_facts.',
    '- Jangan menyebut jenis aset generik (vector, illustration, dan sejenisnya) bila tidak menambah nilai cari.',
    '',
    'TEMA: kembalikan theme_canonical (Inggris baku, kapital natural), theme_fit (boolean), theme_evidence (elemen konkret pendukung; theme_fit true tanpa evidence = false). Bila false: jangan masukkan istilah tema, tulis dari isi gambar.',
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
  if (platform === 'shutterstock') {
    lines.push(
      `Shutterstock WAJIB mengembalikan TEPAT ${SS_CATEGORIES_REQUIRED} kategori BERBEDA dari daftar di atas (tidak boleh kosong, tidak boleh sama).`,
      'Deskripsi Shutterstock TIDAK BOLEH mengandung tanda koma sama sekali. Tulis sebagai SATU kalimat mengalir alami menggunakan kata sambung (and, with, as, while, dan sejenisnya) alih-alih koma untuk menggabungkan elemen. Deskripsi harus tetap akurat menggambarkan apa yang terlihat di gambar DAN konsisten dengan tema yang diberikan (kalau tema diisi).'
    );
  }
  if (languageFix) lines.push('', LANGUAGE_FIX_INSTRUCTION);
  if (retryNote) lines.push('', retryNote);
  lines.push(
    '',
    'CONTOH (tema-netral — tiru kekhususan dan urutannya, bukan katanya):',
    'BAIK 1 (foto): {"title": "Red bicycle with wicker basket on a quiet street",',
    '  "keywords": ["bicycle", "red bicycle", "wicker basket", "cycling", "quiet street",',
    '  "commute", "vintage", "leisure", ...]}',
    '  Alasan baik: subjek utama + frasa pencariannya di awal, tiap kata terlihat di',
    '  gambar, urut dari paling spesifik ke paling umum.',
    'BAIK 2 (ilustrasi): {"description": "A tabby cat wearing a tiny yellow raincoat sits under a glowing moon lantern",',
    '  "keywords": ["tabby cat", "raincoat", "moon lantern", "pet costume", "glowing", ...]}',
    '  Alasan baik: campur kata tunggal dan frasa wajar, warna menempel pada bagiannya',
    '  (yellow raincoat), konsep (pet costume) didukung visual.',
    'BURUK: {"keywords": ["beautiful", "nice", "photo", "background", "concept", "design",',
    '  "image", "stock", ...]}',
    '  Alasan buruk: generik semua — tidak menyebut subjek, objek, warna, suasana, atau',
    '  gaya apa pun; pembeli tidak akan menemukan gambar ini lewat kata-kata itu.',
    '',
    ENGLISH_INSTRUCTION
  );
  return lines.join('\n');
}

// M33 Fase 2c — Tahap D verifikasi bergambar: model melihat GAMBAR + daftar
// keyword final + ringkasan pengamatan, lalu membuang yang salah.
// Respons: {"remove": string[]} — kata yang menyebut jenis/benda berbeda dari
// gambar, bukan sinonim/induk/jenis-spesifik yang benar, konsep tema berupa
// makhluk/benda, atau latar/anatomi yang lolos.
export function buildVerifyPrompt({ keywords, observation, mediaType }: {
  keywords: string[];
  observation?: string;
  mediaType?: string;
}): string {
  return [
    ENGLISH_INSTRUCTION,
    '',
    'Lihat GAMBAR terlampir dan nilailah seperti manusia (bukan dari teks saja).',
    `Pengamatan: ${observation || '-'}. Media: ${mediaType || '-'}.`,
    `Daftar keyword: ${keywords.join(', ') || '-'}.`,
    '',
    'Hapus kata yang menyebut jenis/benda berbeda dari yang ada di gambar, atau yang',
    'bukan sinonim/induk/jenis-spesifik yang benar dari elemen gambar, atau konsep tema',
    'yang berupa makhluk/benda, atau kata latar/anatomi generik yang lolos.',
    'Hapus juga kata yang BUKAN istilah pencarian bermakna sendirian untuk gambar ini',
    '(termasuk potongan istilah majemuk seperti "kit" dari "first aid kit", "print" dari',
    '"paw print", "handle" dari "bag handle" — kecuali "standalone"-nya true dan kata itu',
    'benar dicari sendirian), serta kembaran yang tidak menambah nilai pencarian.',
    'Kembalikan HANYA JSON valid {"remove": [...]} tanpa teks tambahan.',
    '',
    ENGLISH_INSTRUCTION
  ].join('\n');
}

// Hasil normalisasi: field hanya muncul kalau model mengembalikannya (judul/deskripsi lama tidak
// ditimpa oleh field kosong) — persis perilaku applyGeminiResult() di legacy.
export type KeywordSrc = 'visible' | 'attribute' | 'synonym' | 'theme' | 'usage';

/** rel synonym: "synonym" setara | "parent" induk | "specific" jenis lebih spesifik. */
export type KeywordRel = 'synonym' | 'parent' | 'specific';

/** kind konsep tema: harus abstrak (event/season/mood/activity/usage). */
export type KeywordThemeKind = 'event' | 'season' | 'mood' | 'activity' | 'usage';

/** Satu keyword model M32/M33: kata/frasa + sumbernya (+ rel/kind/standalone). */
export interface SourcedKeyword {
  k: string;
  src: KeywordSrc;
  of?: string;
  rel?: KeywordRel;
  kind?: KeywordThemeKind;
  /** M34: true = pembeli akan mencari kata tunggal ini sendirian (dinilai Tahap D). */
  standalone?: boolean;
}

/**
 * Pengamatan Tahap A (diperkaya M32): bagian objek, pola, bahan, bentuk, gaya,
 * suasana, kemungkinan pemakaian. Parser tahan data lama (field opsional,
 * alias media_type/medium; background/komposisi lama diterima tapi tidak
 * dipakai untuk keyword).
 */
export interface ImageObservation {
  objects?: string[];
  parts?: string[];
  patterns?: string[];
  materials?: string[];
  shapes?: string[];
  styles?: string[];
  moods?: string[];
  usages?: string[];
  notes?: string[];
  colors?: string[];
  media_type?: string;
  medium?: string;
  background?: string;
  composition?: string[];
}

export interface ParsedMetadata {
  title?: string;
  description?: string;
  /** Respons lama: daftar string flat (tetap diterima). */
  keywords?: string[];
  /** M32: keyword bersumber {k, src, of?}. */
  sourcedKeywords?: SourcedKeyword[];
  category?: string;
  /** Shutterstock: hingga SS_CATEGORIES_REQUIRED nama berbeda (urutan model dipertahankan). */
  categories?: string[];
  /** M11: true bila kategori diisi fallback (nama model tidak cocok / field kosong) */
  categoryAuto?: boolean;
  /** Fase 4: tema kanonis Inggris dari model; tema ketikan user tetap apa adanya di frame.tema. */
  themeCanonical?: string;
  /** Fase 4: tema didukung gambar + evidence; true tanpa evidence diperlakukan false. */
  themeFit?: boolean;
  themeEvidence?: string;
  observation?: ImageObservation;
  /**
   * Fakta visual dua-tahap-dalam-satu-request: array string pendek yang ditulis
   * AI SEBELUM judul/keyword (warna menempel bagiannya). Tidak ditampilkan di UI.
   * Validator memakai ini + observation sebagai dasar warna dan klaim spesifik.
   */
  visible_facts?: string[];
  /** Peringatan validator pasca-AI (dibuang/dipindah) — diteruskan ke slot via merge. */
  warnings?: string[];
  /** M33 Fase 2c: kata yang dihapus model pada Tahap D verifikasi. */
  stageRemove?: string[];
}

// 'json' dipetakan UI ke pesan legacy "JSON tidak valid"
function jsonError(): Error {
  return Object.assign(new Error('JSON tidak valid'), { kind: 'json' });
}

function cleanKeywords(list: unknown[], max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of list) {
    // Trim + buang koma/tanda baca di TEPI kata (isi tengah seperti t-shirt dipertahankan).
    const v = String(k ?? '').trim().replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
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
  if (Array.isArray(kw)) {
    // M32: array objek {k, src, of?} → sourcedKeywords; array string (respons
    // lama) → keywords flat seperti sebelumnya.
    if (kw.length && kw.every((x) => typeof x === 'object' && x !== null)) {
      const sourced: SourcedKeyword[] = [];
      for (const x of kw as Record<string, unknown>[]) {
        const k = typeof x.k === 'string' ? x.k : '';
        const src = typeof x.src === 'string' ? x.src.toLowerCase() : '';
        if (!k.trim()) continue;
        if (!['visible', 'attribute', 'synonym', 'theme', 'usage'].includes(src)) continue;
        const of = typeof x.of === 'string' && x.of.trim() ? x.of.trim().slice(0, 60) : undefined;
        // M33: rel/kind diterima bila valid, sonst diabaikan (finalisasi yang menolak).
        const relRaw = typeof x.rel === 'string' ? x.rel.toLowerCase() : '';
        const kindRaw = typeof x.kind === 'string' ? x.kind.toLowerCase() : '';
        const rel = ['synonym', 'parent', 'specific'].includes(relRaw) ? (relRaw as SourcedKeyword['rel']) : undefined;
        const kind = ['event', 'season', 'mood', 'activity', 'usage'].includes(kindRaw) ? (kindRaw as SourcedKeyword['kind']) : undefined;
        const standalone = x.standalone === true;
        sourced.push({
          k: k.trim().slice(0, 60),
          src: src as KeywordSrc,
          ...(of ? { of } : {}),
          ...(rel ? { rel } : {}),
          ...(kind ? { kind } : {}),
          ...(standalone ? { standalone: true as const } : {})
        });
        if (sourced.length >= (platform === 'adobe' ? MAX_KEYWORDS_ADOBE : MAX_KEYWORDS)) break;
      }
      if (sourced.length) out.sourcedKeywords = sourced;
    } else {
      out.keywords = cleanKeywords(kw, platform === 'adobe' ? MAX_KEYWORDS_ADOBE : MAX_KEYWORDS);
    }
  }

  // M11: model kadang memakai key `categories` (Shutterstock) — terima `category` dulu, lalu aliasnya.
  const catRaw = pick(obj, 'category') ?? pick(obj, 'categories');
  const list = getCategories(platform);
  if (platform === 'shutterstock') {
    const rawList = Array.isArray(catRaw) ? catRaw : [catRaw];
    const distinct: string[] = [];
    const seen = new Set<string>();
    for (const x of rawList) {
      const n = normCat(x, list);
      if (!n || seen.has(n)) continue;
      seen.add(n);
      distinct.push(n);
      if (distinct.length >= SS_CATEGORIES_REQUIRED) break;
    }
    if (distinct.length > 0) {
      out.categories = distinct;
      out.category = distinct[0];
      if (distinct.length < SS_CATEGORIES_REQUIRED) out.categoryAuto = true;
    } else {
      // Tidak ada padanan sama sekali → isi sementara kategori pertama + tanda periksa.
      out.categories = [list[0]];
      out.category = list[0];
      out.categoryAuto = true;
    }
  } else {
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
  }

  const t = pick(obj, 'title');
  if (typeof t === 'string' && t.trim()) {
    // Adobe: contoh CSV resmi — maks 200 karakter, koma dibiarkan (M24)
    out.title = platform === 'adobe' ? cleanAdobeTitle(t).slice(0, MAX_TITLE_CSV) : t.trim().slice(0, 200);
  }
  const d = pick(obj, 'description');
  if (typeof d === 'string' && d.trim()) {
    const cleaned = platform === 'shutterstock' ? cleanShutterstockDescription(d) : d.trim();
    if (cleaned) out.description = cleaned.slice(0, MAX_DESCRIPTION_SHUTTER);
  }

  // Fase 4: tema kanonis + fit/evidence + grup keyword + observasi (semua opsional,
  // kompatibel respons lama yang hanya punya keywords flat).
  const tc = pick(obj, 'theme_canonical') ?? pick(obj, 'themecanonical');
  if (typeof tc === 'string' && tc.trim()) out.themeCanonical = tc.trim().slice(0, 60);
  const tf = pick(obj, 'theme_fit') ?? pick(obj, 'themefit');
  if (typeof tf === 'boolean') out.themeFit = tf;
  const te = pick(obj, 'theme_evidence') ?? pick(obj, 'themeevidence');
  if (typeof te === 'string' && te.trim()) out.themeEvidence = te.trim().slice(0, 300);
  // theme_fit true tanpa evidence konkret diperlakukan false.
  if (out.themeFit === true && !out.themeEvidence) out.themeFit = false;
  const vf = pick(obj, 'visible_facts') ?? pick(obj, 'visiblefacts');
  if (Array.isArray(vf)) {
    const facts = vf
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((s) => s.slice(0, 80));
    if (facts.length) out.visible_facts = facts;
  }
  const ob = pick(obj, 'observation');
  if (ob && typeof ob === 'object') {
    const o = ob as Record<string, unknown>;
    // M32: pengamatan diperkaya (bagian, pola, bahan, bentuk, gaya, suasana,
    // pemakaian). Parser tahan data lama: field opsional, alias media_type/medium.
    const strList = (v: unknown, n = 24): string[] | undefined =>
      Array.isArray(v)
        ? v.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, n)
        : undefined;
    const str = (v: unknown, n = 120): string | undefined =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined;
    const obs: ImageObservation = {};
    const assign = (key: keyof ImageObservation, v: string[] | string | undefined) => {
      if (v !== undefined && (Array.isArray(v) ? v.length : true)) {
        (obs as Record<string, unknown>)[key] = v;
      }
    };
    assign('objects', strList(o.objects));
    assign('parts', strList(o.parts));
    assign('patterns', strList(o.patterns));
    assign('materials', strList(o.materials));
    assign('shapes', strList(o.shapes));
    assign('styles', strList(o.styles));
    assign('moods', strList(o.moods));
    assign('usages', strList(o.usages));
    assign('notes', strList(o.notes));
    assign('colors', strList(o.colors, 8));
    assign('media_type', str(o.media_type ?? o.medium, 48));
    assign('background', str(o.background));
    assign('composition', strList(o.composition, 8));
    if (Object.keys(obs).length) out.observation = obs;
  }

  // M33 Fase 2c — respons Tahap D: {"remove": [...]} (kata yang dihapus model).
  const rmRaw = pick(obj, 'remove');
  if (Array.isArray(rmRaw)) {
    const stageRemove = rmRaw.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 50);
    if (stageRemove.length) out.stageRemove = stageRemove;
  }

  return out;
}
