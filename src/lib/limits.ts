// Batas batch — SATU sumber angka untuk logika dan teks UI (jangan tulis 20 literal di copy).
// M15: kembali ke 20 (legacy) — grid thumbnail di ≥1024px kini tepat 5 kolom → 4 baris penuh.
export const MAX_FRAMES = 20;

// Jeda antar foto saat batch (detik) — pilihan select "Jeda antar foto", disimpan ke localStorage.
export const BATCH_DELAY_OPTIONS_SEC = [3, 6, 12, 20] as const;
export const BATCH_DELAY_DEFAULT_SEC = 6;

export const ACCEPTED_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

// Batas tema batch/per frame — tema kini WAJIB (Fase 1): setelah trim + rapikan spasi,
// panjang efektif 2–60 karakter. Satu sumber angka — theme.ts mengimpor dari sini.
export const THEME_MIN_LENGTH = 2;
export const THEME_MAX_LENGTH = 60;
// Batas metadata per platform (konstanta untuk logika validasi + teks UI).
export const MAX_KEYWORDS = 50;
export const MIN_KEYWORDS_ADOBE = 5;
export const MIN_KEYWORDS_SHUTTER = 7;
// Batas CSV resmi Adobe Stock — M24 (koreksi M9a): contoh CSV resmi yang diverifikasi
// user menyatakan Title "Up to 200 characters" dan Keywords "Max 49 keywords, most
// important first". Koma di judul AMAN (CSV di-quote); nama file termasuk ekstensi.
export const MAX_TITLE_CSV = 200;
export const MAX_KEYWORDS_ADOBE = 49;
export const MAX_FILENAME = 30;
// (M33) Batas deskripsi Shutterstock pindah ke MAX_DESCRIPTION_SHUTTER di bawah.
export const MIN_DESCRIPTION_WORDS = 5;
// Aturan keyword Fase 3–4 — satu sumber angka (jangan tulis literal di logika/UI).
// (M34: sistem grup A–E dihapus; tersisa rentang konsep tema di bawah.)
// Konsep turunan tema: 5–10 bila cocok, 0 bila tidak.
export const THEME_CONCEPT_MAX = 10;
// Deteksi bahasa Fase 3: >20% keyword Indonesia → regenerasi sekali.
export const INDONESIAN_KEYWORD_RATIO_LIMIT = 0.2;
// Konfigurasi generasi API — SATU sumber (dipakai Groq, Gemini, OpenRouter
// seragam). Suhu rendah agar kata kunci deterministik dan tidak mengarang;
// pagu token longgar agar JSON panjang (visible_facts + ±49 keyword bersumber)
// tidak terpotong di tengah.
export const GENERATION_TEMPERATURE = 0.3;
export const GENERATION_MAX_TOKENS = 4000;
// Target jumlah keyword per platform untuk prompt (lantai validasi keras tetap
// MIN_KEYWORDS_ADOBE/MIN_KEYWORDS_SHUTTER; saran kualitas TARGET_KEYWORDS_MIN).
export const PROMPT_TARGET_ADOBE_MIN = 35;
export const PROMPT_TARGET_SHUTTER_MIN = 25;
// SATU-SATUNYA sumber kata generik yang DIBUANG (bukan dipindah ke ekor):
// tidak informatif dan bukan istilah yang dicari pembeli. Jangan definisikan
// ulang di modul lain — prompt mengimpor untuk larangan eksplisit,
// keywordGroups memakai untuk pembuangan deterministik + peringatan.
export const GENERIC_BAN_WORDS: readonly string[] = [
  'beautiful', 'nice', 'lovely', 'pretty', 'amazing', 'awesome',
  'wonderful', 'great', 'good', 'best', 'perfect', 'gorgeous',
  'stunning', 'stock', 'stocks', 'concept', 'concepts'
];
// Catatan: 'photo'/'picture'/'image' TIDAK masuk daftar ban — keduanya kata
// media yang sah bila sesuai media_type pengamatan (dibatasi KEYWORD_MEDIA_MAX
// dan tidak boleh di 10 teratas); 'design'/'background' sudah dibuang lewat
// GENERIC_FILLER_WORDS/BACKGROUND_STOPLIST.
// Batas keras minimum validasi tetap MIN_KEYWORDS_ADOBE (5) / MIN_KEYWORDS_SHUTTER (7).
// KEYWORD_MIN_TARGET dipertahankan sebagai alias lama agar impor lama tak rusak.
export const TARGET_KEYWORDS_MIN = 30;
export const TARGET_KEYWORDS_MAX = 49;
export const KEYWORD_MIN_TARGET = TARGET_KEYWORDS_MIN;
export const KEYWORD_TARGET_MAX = TARGET_KEYWORDS_MAX;
// M32 — batas per sumber: konteks pemakaian maksimal 4, kata media maksimal 3,
// warna identitas maksimal 2.
export const KEYWORD_USAGE_MAX = 4;
export const KEYWORD_MEDIA_MAX = 3;
export const KEYWORD_COLOR_MAX = 2;
// M32 — SATU-SATUNYA sumber stoplist keyword (jangan definisikan ulang di
// modul lain; impor dari sini). Semua yang berkaitan dengan latar DILARANG
// dipakai sebagai keyword: tidak diminta di prompt, dibuang di finalisasi.
export const BACKGROUND_STOPLIST: readonly string[] = [
  'background', 'backgrounds', 'backdrop', 'backdrops',
  'isolated', 'isolate', 'isolates',
  'cutout', 'cutouts',
  'transparent', 'plain', 'blank',
  'copyspace', 'studio'
];
// M32 — deskriptor tanpa nilai pencarian (satu sumber, lihat atas).
export const LOW_VALUE_DESCRIPTORS: readonly string[] = [
  'symmetric', 'symmetrical', 'front view', 'centered', 'centre',
  'clean', 'simple', 'minimal', 'empty'
];
// Urutan keyword menentukan peringkat pencarian: berapa slot teratas yang harus
// bebas kata generik. Shutterstock 7 perlu diverifikasi di panduan kontributor.
export const PLATFORM_TOP_KEYWORDS = { adobe: 10, shutterstock: 7 } as const;
// Kata generik ditaruh paling akhir (bukan kata utama), bukan dihapus: maksimal
// ini yang dipertahankan, sisanya dibuang dengan peringatan.
export const GENERIC_TAIL_MAX = 3;
// Tumpang tindih: paling banyak keyword yang boleh memuat token yang sama
// (token tema inti boleh satu lebih banyak). Singular/plural dianggap sama.
export const KEYWORD_TOKEN_OVERLAP_MAX = 3;
export const KEYWORD_THEME_TOKEN_OVERLAP_MAX = 4;
// SATU-SATUNYA sumber kata warna untuk gerbang fakta visual (kata utuh,
// cocok tanpa peduli huruf). Jangan definisikan ulang di modul lain.
export const COLOR_WORDS: readonly string[] = [
  'black', 'white', 'red', 'orange', 'yellow', 'green', 'blue',
  'purple', 'violet', 'pink', 'brown', 'gray', 'grey', 'gold',
  'silver', 'beige', 'teal', 'cyan', 'turquoise', 'maroon', 'navy'
];
// SATU-SATUNYA sumber klaim spesifik (spesies/usia/gender/kelompok): hanya sah
// bila terlihat di fakta visual, kecuali sinonim terverifikasi (of+rel).
// Jangan definisikan ulang di modul lain.
export const SPECIFIC_CLAIM_WORDS: readonly string[] = [
  'kitten', 'kittens', 'puppy', 'puppies', 'baby', 'babies',
  'child', 'children', 'kid', 'kids', 'toddler', 'toddlers',
  'teen', 'teens', 'teenager', 'teenagers',
  'boy', 'boys', 'girl', 'girls', 'man', 'men', 'woman', 'women',
  'family', 'families', 'couple', 'couples'
];
// SATU-SATUNYA sumber kata generik-ekor: bukan kata utama, dipindah ke posisi
// setelah PLATFORM_TOP_KEYWORDS (bukan dihapus). Kata tema (src theme) yang
// kebetulan generik tidak dihitung dalam GENERIC_TAIL_MAX. Jangan definisikan
// ulang di modul lain.
export const GENERIC_TAIL_WORDS: readonly string[] = [
  'vector', 'vectors', 'illustration', 'illustrations', 'icon', 'icons',
  'graphic', 'graphics', 'design', 'designs', 'art', 'artwork',
  'image', 'images', 'picture', 'pictures', 'cute', 'beautiful',
  'simple', 'flat', 'cartoon', 'cartoons', 'style', 'styles',
  'concept', 'concepts', 'element', 'elements', 'symbol', 'symbols',
  'set', 'collection', 'collections'
];
// M32 — kata media: hanya sah bila sesuai media_type pengamatan.
export const MEDIA_WORDS: readonly string[] = [
  'illustration', 'illustrations', 'vector', 'vectors',
  'photo', 'photos', 'photograph', 'photographs',
  'image', 'images', 'render', 'renders'
];
// M32 — kata pengisi generik: dilarang kecuali tercatat di media_type.
export const GENERIC_FILLER_WORDS: readonly string[] = [
  'graphic', 'graphics', 'design', 'designs', 'clipart', 'icon', 'icons'
];
// M33 — SATU-SATUNYA sumber anatomi generik (satu kata, netral-tema). DILARANG
// sebagai keyword kecuali kata itu subjek utama gambar (tercatat di
// objects pengamatan, mis. close-up mata). Jangan definisikan ulang di modul lain.
export const ANATOMY_STOPLIST: readonly string[] = [
  'ears', 'ear', 'eyes', 'eye', 'mouth', 'mouths', 'nose', 'noses',
  'face', 'faces', 'head', 'heads', 'body', 'bodies',
  'limb', 'limbs', 'leg', 'legs', 'arm', 'arms', 'hand', 'hands',
  'paw', 'paws', 'finger', 'fingers', 'tooth', 'teeth',
  'hair', 'hairs', 'tail', 'tails', 'whiskers', 'whisker',
  'claw', 'claws', 'beak', 'beaks', 'foot', 'feet'
];
// M33 — istilah dua kata baku diizinkan maksimal ini per generasi (tidak
// pernah tiga kata). 0 = kembali ke satu kata penuh. Cara mengubah: ganti
// angka ini saja, lalu jalankan tes (ada tes untuk 0 dan 8).
export const KEYWORD_PHRASE_MAX = 8;
// M34 — frasa utuh: maksimal kata per keyword = 3; maksimal keyword tiga kata
// per generasi = 3 (tiga kata HANYA bila persis nama objek/bagian pengamatan
// atau subjek judul). Cara mengubah: ganti angka ini saja (0 = satu kata penuh
// bila dipasangkan KEYWORD_PHRASE_MAX = 0), lalu jalankan tes.
export const KEYWORD_PHRASE_WORDS_MAX = 3;
export const KEYWORD_PHRASE3_MAX = 3;
// M34 — SATU-SATUNYA sumber kata kepala generik (netral-tema). Kata benda
// kepala generik ini tidak boleh berdiri sendiri sebagai keyword tunggal
// kecuali subjek utama (lihat aturan potongan di keywordGroups.ts).
export const ORPHAN_HEAD_STOPLIST: readonly string[] = [
  'kit', 'print', 'handle', 'box', 'case', 'set', 'pack',
  'piece', 'part', 'item', 'object', 'thing', 'mark', 'sign'
];
// M33 — kata usage yang hanya wajar untuk media ilustrasi/vektor.
export const MEDIA_ONLY_USAGE: readonly string[] = [
  'sticker', 'stickers', 'poster', 'posters',
  'greeting', 'greetings', 'postcard', 'postcards'
];
// M33 — batas maksimum deskripsi Shutterstock = 2048 karakter (satu sumber;
// counter UI, validasi, parser, dan CSV semuanya membaca konstanta ini).
// Batas judul Adobe tidak berubah.
export const MAX_DESCRIPTION_SHUTTER = 2048;
/**
 * M33 — target saran panjang ideal deskripsi Shutterstock (rentang, bukan
 * pagar): 100–250 karakter, satu atau dua kalimat natural bahasa Inggris.
 */
export const SS_DESCRIPTION_SUGGEST = { MIN: 100, MAX: 250 } as const;
