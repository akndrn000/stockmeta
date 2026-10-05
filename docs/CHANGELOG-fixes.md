# Changelog Perbaikan — Tema Wajib, Layout, Inggris, Keyword Relevan

Catatan perubahan untuk 4 fase (tidak mengubah README, CSV, batas platform,
kunci localStorage, atau fitur di luar cakupan).

## Fase 1 — Opsional menjadi wajib
- `src/lib/theme.ts` (baru), `src/lib/limits.ts` (`THEME_MIN_LENGTH/MAX_LENGTH`):
  validasi murni trim+rapikan spasi, 2–60 karakter; `effectiveTheme()` =
  tema per frame bila diisi, sonst tema batch.
- `src/lib/categories.ts`: `SS_CATEGORIES_REQUIRED = 2` (satu sumber angka
  untuk prompt/parser/validasi/UI).
- `src/lib/prompt.ts`, `src/lib/metadata.ts`, `src/lib/validate.ts`:
  Shutterstock meminta tepat 2 kategori berbeda; kosong/duplikat = error
  pemblokir ekspor ("wajib punya 2 kategori berbeda" / "tidak boleh sama").
- `src/hooks/useBatch.ts`: `startBatch`/`regenerateFrame`/`regenerateAll`
  menolak bila tema efektif tak valid (pesan + `themeError` + sorotan
  `aria-invalid` pada `#tema-batch`).
- UI: `Worksheet.tsx` label "Tema utama *" (`aria-required`), `CaptionSheet.tsx`
  "Kategori tambahan *" (`aria-required`) + hint "Kosongkan untuk memakai
  Tema utama.".
- Perbaikan: `src/lib/theme.test.ts` sintaks (kurung tutup kurang).
- Tes: `theme.test.ts`, `Worksheet.test.ts`, `CaptionSheet.test.ts`,
  `useBatch.test.ts` (penolakan kosong, override, 2 kategori).

## Fase 2 — Tata letak sejajar dan rapi
- `src/components/LabelRow.tsx`: satu pola baris label (label kiri nowrap +
  ellipsis, grup kanan counter+Salin, `min-h-7` tetap, `flex-nowrap`).
- `src/components/CaptionSheet.tsx` (`Field`) + `KeywordEditor.tsx`: memakai
  `LabelRow` (sebelumnya pola duplikat); grid kategori 2 kolom sama lebar,
  kedua select `h-10` sejajar.
- `src/components/Worksheet.tsx` (`FrameTile`): area teks bawah TEPAT dua
  baris tinggi tetap (`h-11`: nama file truncate + `title`; baris status/
  penyedia selalu dipesan walau kosong, truncate + `title`); grid
  `auto-rows-fr items-stretch`; `li min-w-0`.
- Tes: tile dua baris tetap + grid `auto-rows-fr`; label kategori satu baris
  + select sama tinggi.
- Verifikasi responsif: statis (grid `auto-fill minmax(7.5rem,1fr)` tanpa
  scroll horizontal; label ellipsis `min-w-0`; select `w-full`) + tes jsdom.
  Playwright CLI tersedia (v1.63.0) tapi browser tidak diinstal di lingkungan
  ini, jadi screenshot 1440/1024/768/390 (gelap/terang, kedua platform)
  belum diambil — lakukan manual: `npm run dev`, buka dengan 3 frame (satu
  ber-note fallback), cek tidak ada tile lebih tinggi, label kategori satu
  baris, dan tidak ada scroll horizontal di tiap lebar.

## Fase 3 — Bahasa Inggris
- `src/lib/prompt.ts`: `ENGLISH_INSTRUCTION` paling atas + diulang di akhir
  (kedua platform); `LANGUAGE_FIX_INSTRUCTION` untuk retry; contoh tema
  hardcode ("Halloween: spooky, ...") dihapus.
- `src/lib/language.ts` (baru): `looksIndonesian()` (kata fungsi umum,
  whole-word; ≥2 hit lemah atau 1 kata kuat), `isIndonesianKeyword()`,
  `indonesianKeywordRatio()`; ambang `INDONESIAN_KEYWORD_RATIO_LIMIT` di
  `limits.ts`.
- `src/lib/englishRetry.ts` (baru): `needsEnglishRetry()` + retry TEPAT satu
  kali (`languageFix: true` diteruskan ke Groq/Gemini/OpenRouter via
  `GenerateArgs`/`FallbackGenerateArgs`).
- `src/lib/validate.ts`: `ENGLISH_REQUIRED_MSG` — pemblokir untuk
  judul/deskripsi Indonesia, peringatan untuk keyword >20%.
- UI: placeholder judul/deskripsi contoh Inggris netral
  ("A red fox running through tall grass at sunrise"); hint deskripsi
  "Tulis dalam bahasa Inggris: satu kalimat deskriptif utuh, bukan daftar kata."
- Tes lama dengan fixture Indonesia ("kalimat utuh yang ...", "satu dua
  tiga", dst.) diperbarui ke Inggris karena perilaku SENGAJA berubah.
- Tes: `language.test.ts`, `englishRetry.test.ts` (tepat-satu-retry),
  `prompt.test.ts` (instruksi atas+akhir), `validate.test.ts` (blokir Inggris).

## Fase 4 — Keyword relevan dengan tema dan gambar
- `src/lib/prompt.ts`: model mengembalikan `theme_canonical`,
  `theme_fit` (+`theme_evidence` wajib bila true; true tanpa evidence =
  false), `keyword_groups` (A-E), `observation` (colors/background/
  composition/medium). Tanpa daftar tema di kode — konsep turunan dibuat
  model saat berjalan.
- `src/lib/keywordGroups.ts` (baru, murni): `NEUTRAL_STOPLIST` kecil,
  dedupe varian latar (satu), dedupe kontainmen frasa + stem, urutan stabil
  A-E, E didedupe-dulu lalu maks 3 di akhir, guard medium
  (illustration/vector vs photo), `cleanAiTitle()` (kapital, tanpa koma).
  Angka (`GROUP_E_MAX`, `THEME_CONCEPT_MIN/MAX`, `MAX_KEYWORD_WORDS`) di
  `limits.ts`.
- `src/lib/finalize.ts` (baru, murni): `finalizeModelOutput()` (terapkan
  fit/C, grup, kapital judul/deskripsi), `needsKeywordRetry()`,
  `keywordRetryNote()` (sebut yang dibuang + kuota kurang, tanpa nama tema).
- `src/lib/types.ts` + `metadata.ts` + `storage.ts` + `validate.ts`:
  `themeMismatch` (fit false) = peringatan non-pemblokir "Tema tidak cocok
  dengan gambar"; tema ketikan user tetap apa adanya di `frame.tema`.
- `src/hooks/useBatch.ts`: English-retry lalu finalisasi; bila keyword di
  bawah minimum → SATU retry tambahan (maks 3 panggilan/frame).
- `scripts/live-test.ts`: mencetak keyword per kelompok A-E + final/removed/
  mismatch/canonical/fit (tidak dijalankan — butuh API key).
- Tes: `keywordGroups.test.ts`, `fase4.table.test.ts` (6 kasus: perayaan
  typo, musim, tema Indonesia, bisnis abstrak, produk/makanan, fit false —
  × kedua platform: E≤3 di akhir, tanpa varian latar/frasa duplikat,
  subjek+tema di 10 pertama, C 5–10/0, judul kapital, deskripsi Inggris,
  2 kategori berbeda), `themeGuard.test.ts` (gagal bila nama
  perayaan/musim hardcode di src non-tes; data tes dikecualikan).
- Keputusan saat ragu: (1) retry bahasa + keyword digabung maksimal 3
  panggilan/frame (hemat token); (2) varian subjek (mis. "red fox cub" vs
  "fox") dianggap duplikat kontainmen — data tes memakai varian tak-memuatu
  (fox/wolf/coyote/...) agar varian bernilai tambah tidak terbuang;
  (3) judul AI tanpa koma (ganti koma jadi spasi) + kapitalisasi diterapkan
  di finalisasi — ekspektasi tes lama ("baru"→"Baru") diperbarui.

## Risiko
- Token: frame bermasalah bisa memakan 2–3× panggilan (English-retry 1× +
  keyword-retry 1×). Batas: retry hanya bila terdeteksi Indonesia atau
  keyword < minimum; respons palsu tes memakai 5 keyword agar tidak retry.
- Deteksi bahasa berbasis kata fungsi: kalimat Inggris dengan 2+ kata seperti
  "and/on" tidak ditandai (butuh kata fungsi Indonesia utuh); judul seperti
  "Judul bagus" lolos (bukan kata fungsi) — validasi relevansi Fase 4 yang
  menilai.

## M32 — Bersihkan teks UI, sejajarkan baris, perketat keyword (satu kata + sumber)
Aturan lama Fase 4 (grup A–E, frasa multikata) DIGANTI aturan M32 di bawah.
CSV, batas platform, dan kunci localStorage tidak berubah. README tidak diubah.
Playwright/screenshot dilewati atas instruksi user — verifikasi tampilan manual
oleh user (lebar 1440/1024/768/390, kedua platform, gelap/terang).

### Fase 1 — hapus teks bantuan yang tidak jelas
- `CaptionSheet.tsx`: hint "Kosongkan untuk memakai Tema utama." (tema per
  frame) dan hint "Tulis dalam bahasa Inggris: ..." (deskripsi) DIHAPUS.
  Placeholder dipertahankan. Aturan Inggris tetap di prompt + validasi; pesan
  hanya muncul sebagai error saat melanggar.
- `useBatch.ts`: note tile "Diproses via X (fallback)" → "via X" (pendek,
  muat tanpa ellipsis); ruang dua baris tile tetap dipesan.
- Tes: `CaptionSheet.test.ts` (assert kedua kalimat hilang),
  `Worksheet.test.ts` (note "via Gemini").

### Fase 2 — sejajarkan baris kategori dan tema per frame
- `CaptionSheet.tsx`: kedua grid (Adobe Kategori+Tema, Shutterstock
  Kategori utama+Tambahan) memakai `items-start` — kolom tidak saling
  meregang setelah hint dihapus; baris label seragam via `LabelRow`
  (satu baris, tinggi tetap), kontrol `h-10` sebaris.
- Tes: `CaptionSheet.test.ts` assert `items-start` + `h-10` ketiga kontrol.

### Fase 3 — aturan keyword baru (berlaku untuk tema apa pun)
- `limits.ts` (satu sumber): `KEYWORD_MIN_TARGET = 30`,
  `KEYWORD_TARGET_MAX = 45`, `KEYWORD_USAGE_MAX = 4`, `KEYWORD_MEDIA_MAX = 3`,
  `KEYWORD_COLOR_MAX = 2`, plus `BACKGROUND_STOPLIST`,
  `LOW_VALUE_DESCRIPTORS`, `MEDIA_WORDS`, `GENERIC_FILLER_WORDS` — SATU-SATUNYA
  definisi stoplist (modul lain impor, guard: tidak ada stoplist ganda).
- `prompt.ts` Tahap A+B ditulis ulang (Indonesia tegas, output Inggris, tanpa
  contoh terikat tema): observasi diperkaya (objects, parts, patterns,
  materials, shapes, styles, moods, usages, colors, media_type); keyword
  sebagai `{k, src, of?}` (visible/attribute/synonym+of/theme/usage), satu
  kata, larangan latar, target 30–45, urutan subjek+sinonim → bagian/atribut
  → tema → gaya/media → warna identitas (maks 2); judul/deskripsi boleh
  multikata. Parser tahan data lama (flat string[], alias medium/media_type,
  field opsional).
- `keywordGroups.ts` ditulis ulang: normalisasi trim+lowercase, buang
  berspasi/Indonesia/latar/deskriptor/filler; verifikasi src terhadap teks
  grounding observasi (tanpa latar/komposisi); synonym wajib "of" di
  pengamatan; theme hanya bila fit+evidence (maks `THEME_CONCEPT_MAX`);
  usage maks 4; kata media/filler-media hanya dari media_type (maks 3);
  dedupe stem; cap total 45 + maksimum platform.
- `finalize.ts` ditulis ulang: format M32 via `processSourcedKeywords`,
  flat lawas via `normalizeLegacyKeywords` (tanpa grounding); `needsExpansion`
  (< 30), `expansionNote` (daftar ada + faset kosong, minta kata tunggal
  dari sumber sah).
- `validate.ts`: minimum platform (5/7) = pemblokir; < 30 =
  `KEYWORD_THIN_MSG` ("Hanya N keyword relevan ditemukan (target 30)...")
  non-pemblokir; jumlah TIDAK digenapi karangan.
- `useBatch.ts`: English-retry lalu finalisasi; bila < 30 → SATU putaran
  perluasan (total ≤ 3 panggilan/frame); selebihnya simpan apa adanya.
- `live-test.ts`: mencetak keyword beserta src + jumlahnya (tidak dijalankan).
- Keputusan saat ragu: (1) minimum platform dijadikan pemblokir sesuai
  "tetap pemblokir" (sebelumnya saran) — fixture tes diperbarui; (2) kata
  media/pengisi-media sumbernya media_type (tanpa grounding teks);
  (3) alias `medium` dinormalisasi parser menjadi `media_type`; akses properti
  tetap langsung (`o.media`, `obs?.medium`) — helper akses-dinamis sempat
  dibuat karena dugaan "quirk runtime", tetapi setelah dikembalikan ke akses
  langsung seluruh 310 tes lolos berulang, jadi helper dihapus (temuan:
  kegagalan pertama adalah ekspektasi tes yang salah — menegaskan kunci lama
  `medium` yang memang sengaja tidak dipertahankan; kegagalan kedua tidak
  ter-reproduksi dan eksperimen node-CLI yang "membuktikan quirk" terbukti
  tidak dapat dipercaya karena dua program ekuivalen memberi hasil berbeda
  lewat lapisan shell ini);
  (4) respons flat lawas tidak di-grounding (tidak ada observasi dirujuk).

### Fase 4 — tes
- `keywordGroups.test.ts` ditulis ulang (15 tes): normalisasi, grounding per
  src, larangan latar/filler, batas theme/usage/media/warna, urutan, dedupe.
- `fase4.table.test.ts` ditulis ulang (22 tes, 6 jenis tema: perayaan typo,
  Indonesia, abstrak bisnis, produk, musim, fit false — × Adobe/Shutterstock):
  tanpa spasi, tanpa stoplist, src valid terverifikasi ke observasi, synonym
  tanpa "of" dibuang, theme dibuang saat fit false, kaya 30–45, miskin =
  saran tipis tanpa penggenapan, media ≤ 3 sesuai media_type.
- `prompt.test.ts` (+4 M32: teks Tahap A/B, parse sourced, observasi+alias).
- `validate.test.ts` (fixture `kws(30)`; +3 M32: min pemblokir, saran tipis,
  30+ bersih). `useBatch/Worksheet/CaptionSheet.test.ts`: fixture KW30 satu
  kata; +3 tes perluasan (satu putaran, miskin tetap 2 panggilan, ID+miskin
  tepat 3). Guard tema tetap lolos.
- Verifikasi: lint 0, typecheck 0, test 310/310, build sukses. Grep: kedua
  kalimat Fase 1 hanya di assert-tidak-ada; stoplist satu sumber; nama tema
  hanya di data tes + satu false-positive substring ("auto").

### Risiko M32
- Token: observasi diperkaya + perluasan → frame tipis bisa 2–3 panggilan
  (dibatasi: perluasan SEKALI, total ≤ 3/frame; English-retry tetap 1×).
- Model lama/tidak patuh (tanpa src/observasi) → jalur flat lawas: kualitas
  lebih rendah tapi tidak rusak; validasi saran tipis menandai.
- Minimum platform kini pemblokir: sesi lama dengan < 5/7 keyword mengunci
  ekspor sampai dilengkapi (disengaja — perketat kualitas).

## M33 — Keyword setara model besar + deskripsi Shutterstock 2048
Aturan keyword Fase 4/M32 (grup A–E, frasa dilarang) DIGANTI aturan M33.
CSV, kunci localStorage, dan README tidak berubah. Tanpa dev server/
Playwright/proses latar (dilarang) — verifikasi tampilan manual oleh user.

### Fase 1 — buang anatomi generik
- `limits.ts`: `ANATOMY_STOPLIST` (satu sumber, netral-tema).
- Finalisasi (`keywordGroups.ts` + legacy): buang deterministik; kecuali kata
  tunggal yang tercatat di `objects` pengamatan (mis. close-up mata).
- Prompt Tahap A/B melarang anatomi generik di daftar mana pun (contoh bagian
  yang disarankan hanya kostum/aksesori/dekorasi, bukan anatomi/latar).

### Fase 2 — sinonim benar, konsep tema abstrak, verifikasi bergambar
- `synonym` diperketat menjadi `{k, src, of, rel}` (`rel` = synonym|parent|
  specific; tanpa `of`/rel valid → dibuang). Prompt menyebut larangan
  lintas-jenis dengan 3 contoh lintas domain (puppy/kucing, lemon/jeruk,
  truck/sedan). Sinonim salah jenis lolos filter deterministik (formatnya
  benar) dan dihapus Tahap D.
- `theme` wajib `kind` (event|season|mood|activity|usage); tanpa kind valid,
  fit false, atau evidence kosong → dibuang. Keabstrakan (bukan makhluk/benda)
  dinilai Tahap D.
- Tahap D (baru — belum ada sebelumnya): `buildVerifyPrompt()` + respons
  `{"remove": [...]}` + `applyStageRemovals()` (dilog di `removed`).
  Berjalan bila ada keyword synonym/theme/usage dan anggaran tersisa.
- Usage `MEDIA_ONLY_USAGE` (sticker/poster/greeting/...) hanya untuk
  ilustrasi/vektor.

### Fase 3 — pengurutan komersial deterministik
- Urutan stabil: subjek (visible ∈ objects), inti tema_canonical, elemen/
  kostum, media, gaya/suasana (moods/styles), sinonim, tema, usage, warna
  (maks 2, akhir). Inti tema dirancang di 5 pertama untuk kolam wajar
  (subjek ≤ 3); 10 pertama memuat subjek, tema, elemen, media, kata judul —
  dibuktikan tes dengan data realistis.

### Fase 4 — istilah majemuk terkendali
- `KEYWORD_PHRASE_MAX = 8` di `limits.ts`: frasa dua kata baku ≤ 8/generasi,
  tidak pernah tiga kata; tiap komponen harus di pengamatan/tema; tanpa kata
  latar/anatomi. `0` = satu kata penuh (diteruskan via parameter, ada tes
  untuk 0 dan 8). Senyawa hubung (t-shirt, trick-or-treat) dihitung satu kata.
  Cara mengubah: ganti angka ini saja, lalu `npm run test`.

### Fase 5 — kolam kata, target 30, Tahap B bergambar
- Tahap A: objects = subjek utama saja + parts/patterns/materials/shapes/
  styles/moods/usages/colors/media_type (+ `notes` opsional, diabaikan
  grounding); parser tahan data lama (field opsional, alias medium).
- `STAGE_B_WITH_IMAGE = true` di `models.ts`: Tahap B menilai gambar
  terlampir seperti manusia (gambar = keluaran `prepareImage`, sisi terpanjang
  `MAX_IMAGE_SIDE` 1280px — sudah dikirim adapter sejak dulu, jadi tidak ada
  biaya gambar baru; yang baru hanya instruksinya). Bila false: perilaku
  prompt lama. Adapter (groq/gemini/openrouter) memakai `promptOverride`
  untuk Tahap D dengan gambar yang sama — tercakup tes body request.
- Target tetap 30 (`KEYWORD_MIN_TARGET`): perluasan SEKALI menyebut daftar ada
  + faset kosong (subjek, kostum/pola/gaya, sinonim, tema, usage); hasil
  perluasan ikut filter + Tahap D bila anggaran ada (total ≤ 3/frame).
  Tetap < 30 → simpan + saran "Hanya N keyword...". Tanpa penggenapan.
- Keputusan saat ragu: kata media/pengisi-media sumbernya media_type
  (tanpa grounding teks); flat lawas tanpa grounding; frasa vs tunggal tidak
  saling mendedupe (cat + black cat boleh berdampingan).

### Fase 6 — model provider (laporan saja, tidak diubah)
- Dipakai kini: `GEMINI_MODEL = 'gemini-3.5-flash-lite'` (varian lite),
  `GROQ_MODEL = 'qwen/qwen3.8-27b'`, `OPENROUTER_MODEL = 'openrouter/free'`.
- Mengganti model cukup SATU BARIS di `src/lib/providers/models.ts`
  (terverifikasi: adapter + `testConnection` + `PROVIDER_MODELS` + UI semua
  membaca konstanta itu; `models.test.ts` mengunci satu-sumber).
- Opsi non-lite: TIDAK direkomendasikan nama apa pun — verifikasi dokumentasi
  resmi butuh jaringan yang dilarang tugas ini (jangan menebak nama model).
  Kriteria pengganti bila diverifikasi nanti: input gambar, output JSON
  (`responseMimeType`/`response_format`), kuota gratis longgar, throughput
  lebih baik dari lite. Catatan: `models.test.ts` melarang pola
  `gemini-(1|2).x` di folder provider — nama pengganti dari generasi itu
  perlu memperbarui tes tersebut.

### Fase 7 — batas deskripsi Shutterstock 2048
- `MAX_DESCRIPTION_SHUTTER = 2048` di `limits.ts` (SATU sumber; konstanta lama
  `MAX_DESCRIPTION` 200 dihapus). Counter UI (`n/2048`), validasi (> 2048 =
  saran batas), parser (`slice` 2048), CSV (pass-through, tak memotong),
  dan tes semuanya membaca konstanta itu. Batas judul Adobe tidak berubah.
- `SS_DESCRIPTION_SUGGEST = {MIN: 100, MAX: 250}`: > 250 (dalam pagar) =
  saran ideal non-pemblokir. Prompt menyebut pagar + ideal 1–2 kalimat,
  tidak memerintahkan deskripsi panjang. Grep: literal 200 tersisa hanya
  untuk judul Adobe (diizinkan), thumbnail, dan retry-delay.

### Fase 8 — tes (tanpa jaringan)
- `fase4.table.test.ts` ditulis ulang: kasus bukti kucing (39 kata kotor →
  deterministik buang anatomi/latar; puppy + 7 makhluk menunggu D; setelah D:
  bersih, `cat` pertama, halloween di 5 pertama, kostum+media di 10 pertama,
  frasa ≤ 8, warna di akhir) + 5 lintas tema (anatomi dibuang, sinonim/tema
  salah menunggu D lalu bersih) + frasa 0/8 + kolam miskin (saran, tanpa
  genap) + media vektor — × Adobe/Shutterstock.
- `keywordGroups.test.ts` ditulis ulang (15); `prompt.test.ts` (+STAGE_B,
  rel/kind, verify, remove); `validate.test.ts` (2048/saran, fixture 30);
  `useBatch.test.ts` (+pipeline D: 2 panggilan/28 kata; anggaran ≤ 3);
  provider ×3 (promptOverride + gambar); `CaptionSheet.test.ts` (counter
  2048). Fixture lama dis scrub dari frasa/anatomi (`wild dog`→tunggal, dst.).
  Guard tema tetap lolos.
- Verifikasi: lint 0, typecheck 0, test 310→316/316, build sukses. `live-test.ts`
  mencetak keyword + src + kind/rel + urutan (tidak dijalankan).

### Risiko M33
- Token: Tahap B sudah bergambar sejak dulu (tanpa biaya baru); panggilan
  teks bisa 2–3/frame (perluasan + Tahap D, dibatasi ≤ 3).
- Inti-tema-di-5-pertama dijamin untuk kolam wajar; subjek > 4 kata bisa
  menggesernya (diterima — subjek lebih penting).
- Dedupe memakai kunci alfanumerik (digit dipertahankan) setelah temuan
  `fest0`/`fest1` bertabrakan saat `squash()` membuang digit.

## M34 — Istilah majemuk utuh, inti tema di depan, Tahap D bermakna
Aturan keyword M33 (grup A–E, frasa dilarang) DIGANTI aturan M34. Konstanta
grup lama yang tak terpakai (`GROUP_E_MAX`, `MAX_KEYWORD_WORDS`) dihapus.
CSV, kunci localStorage, README, dan model tidak berubah. Tanpa dev server/
Playwright/proses latar/jaringan — verifikasi tampilan manual oleh user.

### Fase 1 — istilah majemuk utuh, potongan tak bermakna dibuang
- `limits.ts`: `KEYWORD_PHRASE_WORDS_MAX = 3`, `KEYWORD_PHRASE3_MAX = 3`
  (tiga kata hanya nama objek/bagian observasi atau subjek judul),
  `ORPHAN_HEAD_STOPLIST` (kit, print, handle, box, case, set, pack, piece,
  part, item, object, thing, mark, sign — satu sumber, tak boleh sendiri
  kecuali subjek utama).
- Output Tahap B + parser: field `standalone` boolean per keyword satu kata.
- Finalisasi: kata tunggal komponen frasa (di daftar respons atau nama
  observasi) dibuang kecuali subjek utama / inti tema / tercatat sendiri /
  `standalone: true` (keputusan akhir di Tahap D); frasa beranggota
  orphan-head harus persis nama observasi/judul; per frasa maksimal SATU
  komponen tersisa (subjek/inti dilindungi). Prompt + Tahap D menyebut aturan
  ini dengan contoh lintas domain (kit/first aid kit, print/paw print,
  handle/bag handle).

### Fase 2 — urutan komersial yang menjamin inti tema
- Urutan stabil: frasa subjek posisi 1, inti tema 2–3, benda sekunder
  tunggal ≤3 di 10 teratas (frasa dikecualikan sebagai kompon bernilai
  tinggi), lalu media, gaya/suasana, sinonim, tema, usage, warna (maks 2).
  Kata judul (konten, >3 huruf) ditarik ke 10 teratas via swap (indeks 0–4
  tak tersentuh). Dibuuktikan tes meski banyak sekunder.

### Fase 3 — Tahap D menilai "bermakna"
- Prompt verifikasi diperluas: hapus kata bukan-istilah-bermakna, potongan
  majemuk, dan kembaran tanpa nilai tambah. Parser `{"remove"}` tak berubah
  (tahan respons lama). Anggaran panggilan tetap (≤ 3/frame).

### Fase 4–8 — tes (tanpa jaringan)
- `fase4.table.test.ts` ditulis ulang: bukti kotak P3K (39 kata kotor →
  "first aid kit" utuh posisi 1, tanpa kit/print/handle/cross, inti ≤3,
  sekunder ≤3, tanpa kembar, warna di akhir; setelah D bersih) + 4 domain
  (dapur, lalu lintas, tulis, outdoor) + frasa-3/WORDS_MAX=2/PHRASE_MAX=0 +
  kaya ≥30/miskin bersaran + media vektor — × Adobe/Shutterstock.
- `keywordGroups.test.ts` (+11 M34: frasa-3, orphan, kembar, urutan, judul).
  `prompt.test.ts` (+standalone, aturan potongan, D bermakna; parser
  standalone). Fixture lama di-scrub dari frasa/anatomi. Guard tema lolos.
- `live-test.ts` mencetak keyword + urutan + status standalone (tak dijalankan).
- Verifikasi: lint 0, typecheck 0, test 316/316, build sukses.

### Keputusan saat ragu
- Twin `cat` + `black cat` boleh berdampingan (subjek dilindungi; hanya
  komponen tak-dilindungi kedua+ yang dibuang).
- Kembar semantik non-komponen (`medicine` vs `medical box`) = tugas Tahap D,
  bukan deterministik.
- Pull-up judul via swap (bukan insert) agar komposisi 10 teratas stabil.
- `wordsMax`/`phraseMax`/`phrase3Max` dapat dioverride per panggilan (untuk
  tes nilai 0/2/8); produksi memakai konstanta.

### Risiko M34
- Token: tak ada biaya gambar baru; panggilan teks tetap ≤ 3/frame.
- Model yang mengabaikan `standalone`/frasa akan kehilangan kata baik
  (terbuang deterministik) — perluasan + validasi saran menandai kolam tipis.
