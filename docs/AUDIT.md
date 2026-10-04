# AUDIT StockMeta vs Aturan Resmi Adobe Stock & Shutterstock (Fase 1)

> Fase audit saja — tidak ada perubahan kode. Status: **LULUS** = sudah sesuai,
> **SEBAGIAN** = ada tapi belum lengkap/salah detail, **GAGAL** = belum ada.
> Bukti memakai format `file:baris` dari tree saat audit.
> Item `[VERIFIKASI]` = belum dipastikan dari sumber resmi → implementasi nanti
> sebagai peringatan non-pemblokir + komentar TODO + catatan di sini.

## 1. Aturan Adobe Stock

| Aturan (Fase 2) | Status | Bukti |
|---|---|---|
| CSV header persis `Filename,Title,Keywords,Category,Releases` | LULUS | `src/lib/csv.ts:20-21`, `src/lib/csv.test.ts:26` |
| Title saran ≤70 karakter → peringatan | GAGAL | `src/lib/validate.ts:36-41` hanya cek `> MAX_TITLE_CSV (200)`; tidak ada angka 70 di repo |
| Title >200 = error pemblokir | SEBAGIAN | `src/lib/validate.ts:39-41` ada saran non-pemblokir; tidak ada konsep error/blokir ekspor; `src/lib/csv.ts:31` tetap mengekspor apa adanya |
| Title tanpa koma & karakter khusus → sanitasi saat ekspor | GAGAL (sengaja dibalik) | `src/lib/prompt.ts:10-13` "koma dibiarkan (JANGAN dihapus)"; `src/lib/metadata.ts:16-18` `cleanAdobeTitle` hanya rapikan spasi; `src/lib/csv.ts:31` tidak sanitasi kutip/titik-koma/emoji; test `src/lib/csv.test.ts:16-29` mengunci koma dipertahankan |
| Title bukan daftar kata | GAGAL | Tidak ada cek `looksLikeWordList` untuk title; hanya untuk description Shutterstock `src/lib/validate.ts:26-30,65` |
| `[VERIFIKASI] apakah impor CSV menolak judul >70` | GAGAL | Tidak ada TODO/komentar di kode; tidak ada pengujian impor portal |
| Keywords min 5, max 49 | LULUS (sebagai saran) | `src/lib/limits.ts:13-19`, `src/lib/validate.ts:46-48`, `src/lib/keywords.ts:21-38`, `src/components/KeywordEditor.tsx:42-70` |
| Keywords satu sel dipisah koma | LULUS | `src/lib/csv.ts:27` `m.keywords.join(', ')`, test `src/lib/csv.test.ts:27` |
| Keywords urut relevansi; 10 pertama memuat kata dari judul → peringatan jika tidak | GAGAL | Tidak ada cek `ADOBE_KEYWORDS_TITLE_WORDS`; prompt hanya "yang paling penting dulu" `src/lib/prompt.ts:13` |
| Tanpa data teknis (ISO, mm, f/, megapixel, nama kamera, resolusi) | GAGAL | Tidak ada daftar/regex data teknis di repo |
| Category ANGKA 1–21 sesuai daftar resmi | SEBAGIAN | `src/lib/categories.ts:4-33` + `src/lib/csv.ts:33` menulis nomor — LULUS untuk mekanisme; GAGAL detail nama: kode `Landscape` (singular) vs spek `Landscapes`; `Transport` vs spek `Transport` (cocok) tapi perlu cek 1:1 semua 21 nama |
| Releases kolom ada, dikosongkan | LULUS | `src/lib/csv.ts:21,34`, test `:26-28` |
| Larangan logo/merek/perusahaan/produk, nama artis, orang nyata, karakter fiksi, instansi pemerintah di judul & keyword | GAGAL | Tidak ada `src/lib/brands.ts`; tidak ada heuristik kapitalisasi; `analysisPrompt.ts:63` hanya menilai watermark/logo sebagai issue analisis, bukan cek keras metadata |
| Jangan tulis "generative AI"/"AI generated" di teks | GAGAL | Tidak ada cek `AI_LABEL_IN_TEXT` |
| Jangan "photo of"/"photograph of" di judul | GAGAL | Tidak ada cek; prompt tidak melarangnya |
| Judul dan keyword satu bahasa (English) | GAGAL | Tidak ada deteksi bahasa / kata Indonesia umum |
| File CSV: UTF-8, maks 1 MB dan 5000 baris | SEBAGIAN | UTF-8 + BOM + CRLF LULUS (`src/lib/csv.ts:51`); batas 1 MB / 5000 baris GAGAL (tidak dicek) |
| Nama file CSV tanpa spasi | LULUS (kebetulan) | `src/lib/csv.ts:54` `stockmeta-adobe-stock-metadata.csv` tanpa spasi, tapi format nama belum sesuai Fase 6 (`StockMeta_Adobe_YYYY-MM-DD.csv`) |
| Pengingat manual portal (centang AI tools, fictional, icon, recognizable, tipe aset) | GAGAL | Tidak ada panel "Langkah manual di portal" |

## 2. Aturan Shutterstock

| Aturan (Fase 2) | Status | Bukti |
|---|---|---|
| CSV kolom wajib urut `Filename,Description,Keywords,Categories` | LULUS | `src/lib/csv.ts:22`, `src/lib/csv.test.ts:52` |
| Kolom opsional E–G `Illustration,Mature content,Editorial` (Yes/No), tulis hanya jika ≥1 frame aktif; frame lain "No" | GAGAL | `src/lib/csv.ts:19-23` header fix 4 kolom; `docs/MIGRATION.md:1304-1305` mencatat opsional "tidak disertakan" |
| Description kalimat natural English, bukan daftar kata | SEBAGIAN | Cek daftar-kata ada `src/lib/validate.ts:26-30,65`; prompt "BUKAN daftar kata" `src/lib/prompt.ts:14`; tapi tidak ada cek kalimat natural / bahasa Inggris |
| Description min 5 kata | LULUS (saran) | `src/lib/validate.ts:63`, `src/lib/limits.ts:27` |
| Description maks 2048 = pemblokir | SEBAGIAN | Angka 2048 benar `src/lib/limits.ts:26`; tapi non-pemblokir (tidak ada errors/blokir) |
| Description target 60–200 karakter (saran) | GAGAL | Tidak ada angka 60/200 di repo |
| Tanpa emoji/karakter khusus, tanpa merek di description | GAGAL | Tidak ada sanitasi/cek emoji/merek |
| Keywords min 7 UNIK (pemblokir) | SEBAGIAN | Angka 7 benar `src/lib/limits.ts:14`, `src/lib/validate.ts:67`; dedupe case-insensitive ada di input (`src/lib/keywords.ts:22-38`) dan parser (`src/lib/prompt.ts:62-75`); tapi duplikat persis bukan error pemblokir + tidak dilaporkan sebagai temuan |
| Keywords max 50 | LULUS (saran) | `src/lib/limits.ts:12`, `src/lib/validate.ts:68` |
| Peringatan stem berulang (forest / forest trees / forest path) | GAGAL | Tidak ada deteksi stem |
| Bahasa Inggris (kecuali Latin/tempat/asing lazim) | GAGAL | Tidak ada cek bahasa |
| Tanpa merek untuk komersial | GAGAL | Tidak ada `brands.ts` / cek merek |
| Categories: 1 wajib, 2 maksimal, satu sel koma, nama persis | SEBAGIAN | 1 wajib LULUS `src/lib/validate.ts:69-71`; maks 2 GAGAL (tidak dicek; UI malah membatasi via dua dropdown `src/components/CaptionSheet.tsx:410-452` tapi validasi tidak menolak 0/3+); nama persis SEBAGIAN via `normCat` + fallback `src/lib/prompt.ts:100-114` |
| Daftar 26 nama kategori persis | SEBAGIAN | `src/lib/categories.ts:35-39` 26 nama cocok dengan spek di tugas; `[VERIFIKASI]` Arts vs The Arts / Celebrities belum ada TODO di kode |
| Editorial: tool TIDAK membuat caption editorial otomatis; jika ditandai Editorial → peringatan "tulis format caption editorial manual" `[VERIFIKASI]` | GAGAL | Tidak ada toggle Editorial; tidak ada peringatan |
| Portal: atur "Jenis gambar" dan "Penggunaan" (Komersial/Editorial) | GAGAL | Tidak ada toggle Illustration/Editorial per frame |
| `[VERIFIKASI]` Deskripsi bawaan metadata file bisa terisi sebelum CSV diimpor | GAGAL | Tidak ada catatan/TODO di kode |

## 3. Lintas platform

| Aturan (Fase 2) | Status | Bukti |
|---|---|---|
| Filename SAMA PERSIS (ekstensi + kapitalisasi; mis. .jpeg, .eps). Jangan paksa .jpg | SEBAGIAN | `src/lib/csv.ts:30,38` memakai `f.name` apa adanya (LULUS, tidak dipaksa); tapi tidak ada field "Nama file di portal" + tidak ada peringatan ekstensi (`.jpg/.jpeg/.eps/.svg/.ai/.tif/.tiff`) |
| CSV UTF-8 (BOM opsional, default aktif) | SEBAGIAN | BOM hardcoded aktif `src/lib/csv.ts:51`; tidak ada opsi on/off |
| Header persis | LULUS | Lihat baris Adobe/Shutterstock di atas |
| Sel berisi koma di-quote, kutip di-escape (RFC 4180) | LULUS | `src/lib/csv.ts:16-18,45`, test koma+kutip `src/lib/csv.test.ts:16-29,42-55` |
| RULE_ID minimal 22 ID dipakai validate/prompt/csv/juri/counter | GAGAL | Tidak ada `src/lib/platform-rules.ts`; tidak ada satupun RULE_ID di repo; angka batas tersebar di `src/lib/limits.ts`, `src/lib/validate.ts`, `src/lib/prompt.ts`, `src/components/CaptionSheet.tsx:20`, `src/components/KeywordEditor.tsx:9` |
| Kunci API di localStorage, dikirim browser→provider langsung | LULUS | `src/lib/storage.ts:8-40`, provider `fetch` langsung (`groq.ts:71-83`, `gemini.ts:67-78`, `openrouter.ts:86-94`); tidak ada API route backend |
| Hasil AI/juri = SARAN, tidak ada klaim "dijamin lolos" | SEBAGIAN | README sudah "saran AI, bukan jaminan" (`README.md:98-99,194-199`); tapi tidak ada label baku "Perkiraan kelolosan (saran, bukan keputusan platform)" karena modul juri belum ada |

## 4. Analisis gambar nyata + generasi metadata (Fase 4)

| Aturan | Status | Bukti |
|---|---|---|
| Metadata bersumber dari isi gambar; nama file/tema/frame lain bukan sumber isi | SEBAGIAN | Prompt "Analisis HANYA apa yang terlihat" `src/lib/prompt.ts:17` + "ABAIKAN tema bila tak konsisten" `src/lib/prompt.ts:23`; tapi tidak ada Tahap A observation JSON; tema masih diteruskan bebas ke model; tidak ada larangan memakai nama file sebagai sumber isi |
| Tema bertentangan → abaikan + tandai "tema tidak cocok" | GAGAL | Abaikan ada, tanda tidak ada |
| Jangan tebak nama orang/merek/lokasi/usia/etnis/gender/kesehatan/peristiwa; ragu = kosongkan + turunkan confidence | SEBAGIAN | "Jangan menebak konteks, lokasi, merek, emosi" `src/lib/prompt.ts:17`; tidak ada field confidence / aturan kosongkan |
| Tahap A observation JSON ketat + validasi skema (media_type, people, brands, quality_issues, confidence, dst.) | GAGAL | Tidak ada modul observation; `AnalyzeArgs`/`GenerateArgs` hanya `{image, platform, theme}` `src/lib/providers/types.ts:18-36` |
| Prapemrosesan 1280px JPEG 0.8 tanpa EXIF | SEBAGIAN | 1280px + JPEG 0.8 LULUS `src/lib/image.ts:6-9,25-48`; "tanpa EXIF" implisit via canvas (tidak dinyatakan/test) |
| Provider/model tanpa gambar → error jelas, HENTIKAN frame; tanpa fallback teks-saja | GAGAL | Semua adapter selalu kirim gambar; tidak ada flag `supportsVision` |
| Flag supportsVision per provider/model; `[VERIFIKASI]` model default Groq/Gemini dukung gambar | GAGAL | `src/lib/providers/models.ts:6-9` (`qwen/qwen3.8-27b`, `gemini-3.5-flash-lite`) tanpa info vision; tidak ada TODO verifikasi di kode |
| Tahap B metadata per platform (Adobe title ≤70 tanpa koma/bukan daftar kata/tanpa photo-of; keywords 25–35 maks 49 urut relevansi; category 1–21 by subjek utama; Shutterstock description 1 kalimat 60–200, keywords 25–45 unik, categories 1–2 by subjek) | GAGAL | Prompt kini generik: Adobe `15-35 kata`, Shutterstock `15-40 kata` `src/lib/prompt.ts:12-14`; tidak ada aturan urutan keyword, title≤70, larangan photo-of/AI/merek, pemetaan kategori by subjek |
| Tahap C compliance deterministik (brands→hapus/samarkan; landmark→release; wajah→model release; non-photo→toggle Illustration; AI-look→pengingat manual; quality_issues; confidence<0.6→tinjau) | SEBAGIAN | Hanya sebagai prompt analisis generik `src/lib/analysisPrompt.ts:60-66` (reviewer, bukan cek deterministik dari observation); tidak ada modul Tahap C |
| Tahap D verifikasi grounding (toggle default aktif, hapus unsupported, regenerasi 1x / error keyword kurang) | GAGAL | Tidak ada modul grounding |
| Parser ketat; kategori luar daftar ditolak→retry→"perlu ditinjau" (bukan lolos diam-diam); gagal permanen = status gagal | SEBAGIAN | Parser fence-strip + retry JSON rusak LULUS (`src/lib/prompt.ts:82-90`, `src/lib/providers/retry.ts:85-96`); tapi kategori tak dikenal di-fallback diam-diam ke `list[0]` + `categoryAuto` `src/lib/prompt.ts:106-114` (bukan "perlu ditinjau") |
| Retry/limit/batal dipertahankan | LULUS | `src/lib/providers/retry.ts:104-134`, `src/lib/batch.ts:78-139`, hooks `useBatch.ts`, `useAnalysisBatch.ts` |

## 5. Juri kepatuhan multi-provider (Fase 5)

| Aturan | Status | Bukti |
|---|---|---|
| Adapter generik `{id, label, supportsVision, callJudge}` + registry; Groq, Gemini, OpenAI-compatible ke-3 (baseUrl+model+apiKey user, tanpa hardcode) | GAGAL | Adapter kini `{testConnection, generateForImage, analyzeImage}` tanpa `supportsVision`/`callJudge` `src/lib/providers/types.ts:38-44`; OpenRouter hardcoded `openrouter/free` + base tetap `src/lib/providers/openrouter.ts:15,79,86` |
| Pengguna memilih juri aktif (min 1, ideal 3); UI "juri: N dari 3" bila <3 | GAGAL | Hanya satu provider aktif + fallback otomatis `src/lib/providers/fallback.ts`; tidak ada pemilihan multi-juri |
| Input juri: gambar (bila supportsVision + toggle) / observation saja + "tanpa gambar"; metadata; observation; blok ATURAN dari platform-rules.ts ([VERIFIKASI] ditandai bukan alasan gagal tunggal); cek keras sebagai konteks | GAGAL | Tidak ada modul juri; tidak ada render aturan dari sumber tunggal |
| Prompt juri: nilai HANYA berdasar aturan + isi gambar; luar aturan = n/a | GAGAL | `buildAnalysisPrompt` menilai kriteria umum, bukan RULE_ID |
| Output JSON ketat (verdict/score/checks rule_id/unsupported/ip_risks/category/needs_release/confidence); tolak rule_id tak dikenal | GAGAL | `AnalysisResult {verdict, issues, summary}` `src/lib/types.ts:80-84` — bukan skema juri |
| Konsensus deterministik `src/lib/judge.ts` (cek keras > semua juri; semua pass=LOLOS; mayoritas=LOLOS DENGAN CATATAN; fail ber-evidence=TIDAK LOLOS; split=PERLU DITINJAU; conf<0.6=TINJAU; gabung per rule_id status terburuk + fix tersering) | GAGAL | Tidak ada `src/lib/judge.ts` |
| Label "Perkiraan kelolosan (saran, bukan keputusan platform)" | GAGAL | Lihat §3 |
| Perbaikan otomatis (tombol manual → provider pilihan → cek keras ulang → diff → konfirmasi; tidak timpa edit manual diam-diam) | GAGAL | Hanya generate-ulang penuh (`useBatch.ts:183-246`, `Worksheet.tsx:724-763`) |
| Juri paralel antar provider, serial antar frame, hormati jeda/retry, bisa batal; gambar diperkecil; peringatan privasi sekali; cache per (frame, platform, hash metadata), invalid saat berubah | GAGAL | Batch serial per frame LULUS (`src/lib/batch.ts`); sisanya belum ada |

## 6. CSV & UI (Fase 6)

| Aturan | Status | Bukti |
|---|---|---|
| csv.ts sesuai Fase 2 (header, opsional bersyarat, quoting, BOM opsional, nama tanpa spasi `StockMeta_Adobe_YYYY-MM-DD.csv`) | SEBAGIAN | Header+quoting+BOM LULUS; opsional/nama file/BOM-toggle/1MB-5000-baris/filename-override GAGAL (lihat §1–3) |
| Field "Nama file di portal" per frame (default = nama upload, dipakai apa adanya); peringatan ekstensi di luar `.jpg/.jpeg/.eps/.svg/.ai/.tif/.tiff` | GAGAL | `Frame {name}` tunggal `src/lib/types.ts:40-54`; `Worksheet.tsx:419-429` memakai nama upload; tidak ada override |
| Toggle per frame "Ilustrasi" + "Editorial" (default mati, Shutterstock) | GAGAL | Tidak ada field di `Frame`/metadata |
| Counter keyword batas aktif (Adobe 5–49; SS 7–50) | SEBAGIAN | Menampilkan `n/max` + `min N` `src/components/KeywordEditor.tsx:51-66`; teks "batas aktif" per platform belum eksplisit |
| Panel lipat observation per frame + peringatan Tahap C; badge "perlu ditinjau"; tombol "Analisis ulang gambar" (hapus cache) + "Buat ulang metadata" (pakai cache) | GAGAL | `AnalysisPanel` hanya verdict/issues reviewer; tidak ada observation/cache terpisah |
| Tombol "Periksa kepatuhan" per frame & semua; badge LOLOS/DENGAN CATATAN/TIDAK LOLOS/PERLU DITINJAU; panel checks + matriks juri×aturan + unsupported + "hapus keyword ini"; filter by badge | GAGAL | Badge kini menunggu/memproses/siap/gagal (`Worksheet.tsx:249-266`, `CaptionSheet.tsx:289-300`) — bukan badge kepatuhan |
| Dialog sebelum unduh: daftar Filename + "sama persis" + jumlah error/warning; blokir hanya error cek keras; TIDAK LOLOS juri = peringatan saja | GAGAL | `CaptionSheet.tsx:189-235` ekspor langsung tanpa dialog; tidak ada split error/warning |
| Panel "Langkah manual di portal" per platform | GAGAL | Tidak ada |

## 7. Test & docs (Fase 7–8)

| Aturan | Status | Bukti |
|---|---|---|
| Test batas yang ada | SEBAGIAN | `validate.test.ts`, `csv.test.ts`, `prompt.test.ts`, `batch.test.ts` lolos untuk perilaku lama; belum ada test untuk 70/71/200/201, 4/5 kata, duplikat/stem, sanitasi, kategori invalid, opsional bersyarat, RFC 4180 penuh, BOM, override, snapshot |
| Test analisis/juri/mock 3 provider/grounding/cache | GAGAL | Belum ada file test tersebut |
| `scripts/live-test.ts` 3 gambar fixture (polos, logo/teks, ilustrasi vektor) | SEBAGIAN | Skrip ada untuk 1 gambar generate (`scripts/live-test.ts:17-59`); belum ada fixture/observation/juri |
| README + AUDIT + "Uji impor pertama" 2–3 foto | SEBAGIAN | README Format/Batasan/Provider/Keamanan ada (`README.md:101-153`); belum ada alur analisis-juri, manual portal, uji impor pertama |

## 8. Celah berurut prioritas (untuk Fase 2+)

1. **Tidak ada `platform-rules.ts` satu sumber kebenaran** — angka & daftar tersebar; semua RULE_ID hilang. Tanpa ini Fase 3–6 tidak bisa konsisten.
2. **Validasi tanpa errors/warnings + tanpa blokir ekspor** — `validateMetadata` hanya saran (`src/lib/validate.ts:33`); ekspor tidak memblokir frame (`src/lib/csv.ts:24-44`, `CaptionSheet.tsx:189-235`).
3. **Tidak ada deteksi IP/merek, data teknis, AI-label, bahasa, duplikat/stem, keyword↔judul, kategori maks-2, deskripsi kalimat** — inti "cek keras" Fase 3 hilang; butuh `src/lib/brands.ts` baru.
4. **Tidak ada analisis gambar nyata 4 tahap (observation → metadata → compliance → grounding)** — prompt satu tahap teks+bebas; risiko halusinasi; butuh skema observation + cache sesi + `supportsVision` + error tegas tanpa fallback teks-saja.
5. **Tidak ada juri multi-provider + konsensus** — tidak ada `callJudge`, `judge.ts`, matriks, cache, perbaikan-dengan-diff.
6. **CSV Shutterstock kolom opsional + Filename override + nama file tanggal + batas 1 MB/5000 baris + dialog pra-unduh** belum ada.
7. **Detail kategori Adobe salah nama (`Landscape` vs `Landscapes`)** + `[VERIFIKASI]` Arts/Celebrities & judul>70 & editorial & metadata-prefill belum punya TODO di kode.
8. **Sanitasi judul Adobe belum didefinisikan** — kode kini sengaja mempertahankan koma (M24) yang bertentangan dengan spek baru; perlu keputusan + sanitasi eksplisit + penanda di editor (jangan potong diam-diam).
9. **UI kepatuhan belum ada** — toggle Ilustrasi/Editorial, panel observation, badge LOLOS/…, filter, panel manual portal, label "saran bukan keputusan".
10. **Test Fase 7 + live-test fixture + docs Fase 8** belum ada.

## 9. Daftar [VERIFIKASI] yang wajib jadi TODO + peringatan non-pemblokir

- Adobe: apakah impor CSV menolak judul >70 (spek: warning >70, error >200).
- Shutterstock: "Arts" vs "The Arts"; apakah "Celebrities" tersedia; cocokkan dropdown Submit.
- Editorial: format caption editorial khusus; tool tidak membuat otomatis.
- Portal SS: apakah impor CSV menimpa deskripsi bawaan metadata file.
- Model default Groq (`qwen/qwen3.8-27b`) & Gemini (`gemini-3.5-flash-lite`) benar-benar mendukung gambar.
- Kategori lain SS by-subjek (Backgrounds/Textures, Abstract, dst.) belum dibaca dari sumber resmi.
- Shutterstock property-release untuk landmark (`landmarks_or_private_property`).
