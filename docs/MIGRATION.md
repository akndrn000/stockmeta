# Migrasi StockMeta: HTML/JS → Next.js + TypeScript + Tailwind

Referensi perilaku: `legacy/` (dibaca saja — **jangan diubah, jangan ikut di-build**).
`legacy/` dikecualikan dari `tsconfig.json` (`exclude`) dan ESLint (`globalIgnores`).

Konvensi: satu modul = satu seam dengan interface kecil (`src/lib/*` untuk logika murni tanpa
DOM/React, `src/hooks/*` untuk state React, `src/components/*` untuk UI). Logika murni tidak
mengimpor React; provider tidak mengimpor komponen.

## Checklist tahap

- [x] **M1 — Fondasi**: scaffold Next.js + TS strict + Tailwind, `legacy/` dikecualikan dari
  build, `src/lib/types.ts` berisi tipe inti, placeholder modul, halaman tes.
- [x] **M2 — Logika murni**: `categories.ts` (Adobe 21 / Shutterstock 26 + fuzzy match),
  `prompt.ts` (prompt anti-generic + blok tema + parser hasil model), `csv.ts`
  (`buildCsv` murni + `downloadCsv`), tes vitest (`npm run test`).
- [x] **M3 — Provider + retry**: `providers/retry.ts` (`ProviderError`, `withRetry`,
  `parseRetryAfter`, `BATCH_DELAY_MS`), `providers/types.ts` (`ProviderAdapter` seragam),
  `providers/gemini.ts`, `providers/groq.ts`, `providers/index.ts` (registry),
  `image.ts` (`prepareImage`, `makeThumbnail`), `scripts/live-test.ts` (npx tsx).
- [x] **M4 — Storage + hooks**: `storage.ts` (API key, riwayat sesi per-platform + migrasi
  format lama, tema), hooks `useSession` (restore/debounce 500ms/ganti platform non-destruktif),
  `useProvider` (tes lulus → key disimpan, pindah provider → reset status), `useTheme`
  (sistem → override manual terpersisten).
- [x] **M5 — Layout + ProviderPanel + tema siang/malam**: kerangka tiga panel, pilih provider,
  tes koneksi, toggle mode dengan satu skema warna.
- [x] **M6 — Worksheet**: upload/drop frame (maks 10), grid thumbnail, pilih/hapus frame,
  tema batch, tombol generate.
- [x] **M7 — CaptionSheet**: field editable per platform, keyword chip + kotak teks,
  tombol salin per field, tema per-foto, saran validasi, ekspor CSV sesuai platform.
- [x] **M8 — Alur generate end-to-end**: `lib/batch.ts` (batch murni: urut, jeda antar frame,
  gagal-lanjut, batal via AbortSignal), `hooks/useBatch.ts` (progress/notice/regenerate),
  tombol `Buat metadata`/`Batalkan`, sambungkan `Buat ulang frame ini`.
  Perbaikan M8: meta `Frame nn / total` sesi, saran validasi hanya slot berisi, jeda antar
  foto dapat diatur (default 6 detik), tombol `Coba lagi frame gagal`.
- [x] **M9a — CSV & aturan judul sesuai spesifikasi resmi**: header kolom per platform, kategori
  Adobe = **nomor** (`ADOBE_CATEGORY_IDS`), judul Adobe tanpa koma + batas 70, saran
  judul/koma/nama file, footer hitung baris bersaran (lihat kontrak **CSV**).
- [x] **M9b — Polish, aksesibilitas, README + docs**: kontras (temuan: `--ink-3` mode siang
  4.49 → `#676b73` ≥4.5), label terpisah `caption-tema`, target sentuh ≥40px layar kecil
  (blok CSS + `.btn-compact`), `prefers-reduced-motion` global (animasi mati, transisi
  tetap), `aria-live` hasil tes koneksi, h1 brand, chip panjang `truncate` + `title`,
  favicon `src/app/icon.svg` (hapus `favicon.ico` scaffold), `package.json` (`name`,
  `typecheck`), README publik Indonesia, `docs/DESIGN.md`, `.gitignore` (`/legacy/`,
  `*.log`), hapus artefak scaffold (`public/*.svg`, `.gitkeep`), scan key/URL log bersih.
- [ ] **M10 — Deploy Vercel**: `vercel deploy`, verifikasi produksi.

## Perbaikan pasca-M10 (M11) — bukan tahap migrasi baru

Semua di bawah adalah perbaikan lanjutan; tanpa e2e, tanpa menjalankan server. Verifikasi:
`npm run test` (172 tes), `npx tsc --noEmit`, `npm run lint`, `npm run build` — lolos semua.

### 1. Groq jadi provider default, Gemini cadangan

- `src/hooks/useProvider.ts`: default state `'gemini'` → **`DEFAULT_PROVIDER = 'groq'`**;
  boot membaca pilihan tersimpan dulu (`readProvider()`), hanya fallback ke Groq kalau belum
  pernah memilih; `setProvider` menulis `stockmeta_provider` (**baru** — sebelumnya tidak ada
  kunci pilihan provider sama sekali).
- `src/lib/storage.ts`: `PROVIDER_KEY` + `readProvider`/`writeProvider` (nilai asing → `null`).
- `src/components/ProviderPanel.tsx`: urutan dropdown dari `PROVIDER_ORDER`
  (**Groq → Gemini → Coming Soon**), catatan Gemini baru: *Kadang lebih sering terkena limit/sibuk
  dibanding Groq — coba Groq dulu kalau sering gagal.*; catatan Groq dipertahankan.
- `README.md`: baris **Groq (default)** di atas Gemini di tabel provider + catatan Gemini lebih
  sering kena limit; urutan penyebutan di intro & langkah pakai ikut dibalik.
- Efek samping yang perlu diketahui: tiga tes harness (`useBatch`, `Worksheet`, `CaptionSheet`)
  kini mendaftarkan adapter palsu juga ke `registry.groq` karena default sudah Groq.

### 2. Satu dokumen, satu scroll (Worksheet & CaptionSheet tanpa scroll internal)

- `src/app/page.tsx`: buang `lg:h-dvh lg:overflow-hidden` dan
  `lg:grid-rows-[minmax(0,1fr)]`/`min-h-0 flex-1` — akar cukup `min-h-dvh flex flex-col`,
  `main` jadi grid biasa `items-start` (2 kolom ≥1024px tetap: Worksheet kiri, CaptionSheet kanan).
- `src/components/Panel.tsx`: body panel buang `min-h-0 flex-1 overflow-y-auto` → tinggi mengikuti
  isi; `overflow-hidden` **dipertahankan** hanya untuk merapikan sudut membulat (strip full-bleed
  CaptionSheet pakai margin negatif). Panel juga buang `min-h-0` — tingginya kini mengikuti isi,
  jadi kedua kolom boleh berbeda tinggi.
- **Header tetap non-sticky** (keputusan): paling rapi untuk dokumen yang menggulir dan tidak
  pernah menutupi konten; scroll ke `#lembar-caption` di layar kecil tetap aman.

### 3. Ganti provider tanpa upload ulang + tombol "Buat ulang semua"

- **Verifikasi**: mengganti provider **tidak** menghapus frame/file/metadata — `setProvider`
  hanya mereset state koneksi. Tidak ada perilaku yang perlu diperbaiki di sini.
- `src/hooks/useBatch.ts`: `regenerateAll()` (konfirmasi 2 langkah per platform via
  `regenAllConfirm: Platform | null`), `dismissRegenAll()`; `run()` kini membersihkan kedua
  konfirmasi begitu batch jalan (mencegah konfirmasi basi terpakai tanpa sengaja).
- `src/components/Worksheet.tsx`: tombol **`Buat ulang semua`** + konfirmasi inline
  **`Ganti semua hasil yang sudah ada?`** (`Ya, ganti semua` / `Batal`), hanya dirender bila ada
  frame `siap`/`gagal` di platform aktif.
- Provider & key di-snapshot saat batch mulai → setelah ganti provider + tes ulang, generate
  memakai provider yang baru.

### 4. "Coba lagi frame gagal" selalu tersedia selama ada yang gagal

- Kondisi ternyata **sudah benar** (`!busy && failed > 0`, `failed` dihitung dari status sesi
  platform aktif → melekat lama setelah batch selesai). Tidak ada kode yang diubah; ditambah
  **tes regresi** di `Worksheet.test.ts` (setelah pindah-pindah frame & ganti platform lalu
  kembali).

### 5. Bug: kategori tidak terisi otomatis setelah generate

Penyebab yang ditemukan (bukan satu-satunya ambang Levenshtein):

1. **Key `categories` tidak dikenali** — parser hanya mencari `category` persis (case-insensitive);
   respons Shutterstock yang memakai `categories` (nama kolom CSV-nya) dibuang → kategori kosong.
2. **`normCat` mengembalikan `null`** untuk nama yang tidak mirip cukup (mis. padanan lintas
   platform seperti `Nature` di daftar Adobe), dan field yang kosong/`null` juga berujung `null`
   → `out.category` tidak pernah ditulis.
3. Instruksi prompt sudah ada tapi tidak melarang nilai kosong.

Perbaikan:

- `src/lib/prompt.ts` (`parseMetadataResponse`): terima alias `categories`; kalau tetap tidak ada
  padanan (nama terlalu jauh / field kosong) → **fallback kategori resmi pertama** + bendera
  `categoryAuto: true`. Prompt ditegak: field `category` **wajib terisi, jangan kosong/jangan null**.
- `src/lib/types.ts` + `src/lib/metadata.ts`: field opsional `categoryAuto` di kedua metadata dan
  aturan merge — **fallback tidak pernah menimpa kategori lama yang sudah terisi**, bendera ikut
  berpindah/dibersihkan mengikuti nilai.
- `src/lib/validate.ts`: `categoryAuto` → saran **`Kategori dipilih otomatis oleh sistem, periksa
  kembali.`** (menggantikan `Pilih satu kategori.` saat slot terisi); idem untuk Shutterstock.
- `src/hooks/useSession.ts`: user mengubah kategori manual → `categoryAuto` dihapus (saran tidak
  basi). `src/lib/storage.ts`: bendera ikut persisten saat reload.
- Tes baru: `prompt.test.ts` (tidak cocok / kosong / alias `categories`), `validate.test.ts`
  (saran auto), **baru** `metadata.test.ts` (merge tidak menimpa kategori lama).

### 6. Bonus: instruksi deskripsi Shutterstock ±200 karakter

- `buildMetadataPrompt` (Shutterstock saja): format JSON kini minta deskripsi *minimal 5 kata dan
  **maksimal sekitar 200 karakter*** (memakai `MAX_DESCRIPTION`) — instruksi ke model saja,
  **tanpa memotong paksa di kode** (saran validasi >200 tetap non-pemblokir).

## Kontrak perilaku (WAJIB sama dengan legacy)

Sumber: `legacy/docs/PROGRESS.md` + `legacy/js/*.js`. Tanda **[BARU]** = perilaku baru yang
belum ada di legacy (atau berubah dari legacy) — legacy tetap jadi acuan untuk hal lain.

### Upload & frame

- Upload **JPG / PNG / WEBP** (dropzone + tombol pilih file), **maksimal 10 frame** per batch.
  **[BARU: sebelumnya 20]** — batch penuh → frame dilewati + pesan.
- Hapus **per frame**; frame terpilih di-highlight.
- Setelah sesi di-restore, file asli hilang (hanya thumbnail) → upload ulang dengan nama sama
  menyambung kembali frame lama (metadata/status dipertahankan).

### Platform

- **Adobe Stock**: `title` + `keywords` + `category` (satu kategori persis dari daftar).
- **Shutterstock**: `description` (kalimat, bukan daftar kata) + `keywords` + `categories`
  (array 1–2) — **tanpa title**.
- **Ganti platform bersifat non-destruktif** **[BARU]**: metadata tersimpan **per platform**
  (`frame.metadata = { adobe?: …; shutterstock?: … }`) — mengganti platform TIDAK menghapus
  hasil generate; UI/CSV/generate hanya membaca slot platform aktif (slot kosong = belum pernah
  digenerate untuk platform itu). Status juga per platform: slot kosong → `menunggu`, ada isi →
  `siap`, gagal → `gagal` + pesan error milik platform itu. Edit yang **mengosongkan** slot juga
  mengembalikan statusnya ke `menunggu` (`gagal` tetap dipertahankan) **[audit A1]**. Sesi format lama (flat / legacy)
  tetap terbaca dan dimigrasi ke slot platform sesi tersebut.

### Provider

- Dropdown: **Groq**, **Gemini**, **Coming Soon** (nonaktif: field key + tombol Test disabled,
  Generate tetap mati, catatan `Provider tambahan akan segera hadir`) **[M11: urutan & default]** —
  **Groq provider default** saat belum ada pilihan tersimpan; pilihan user disimpan di localStorage
  (`stockmeta_provider`) dan **dihormati** di kunjungan berikutnya.
- Catatan per provider di bawah hasil tes **[M11]**: Groq tetap soal limit 8.000 token/menit;
  Gemini: *Kadang lebih sering terkena limit/sibuk dibanding Groq — coba Groq dulu kalau sering gagal.*
- **Tes koneksi wajib lulus sebelum API key disimpan** ke `localStorage` (kunci
  `stockmeta_gemini_key` / `stockmeta_groq_key`); key di-restore saat pindah provider tapi status
  sengaja reset ke `Belum dites` (harus tes ulang).
- **Gemini**: model **auto-detect** dari `GET /v1beta/models` (preferensi flash terbaru), bukan
  hardcode; key salah dilaporkan Gemini sebagai HTTP 400 `API_KEY_INVALID` — jangan cek 401 saja.
- **Groq**: model tunggal **`qwen/qwen3.8-27b`**, **tanpa fallback**; pesan error body dibawa utuh
  ke UI.
- API key **hanya di browser** (localStorage), **tidak pernah dikirim ke server** — semua panggilan
  dari `fetch` di client.
- **Ganti provider bersifat non-destruktif** **[M11: diverifikasi]**: `useProvider.setProvider`
  hanya mengubah state koneksi (provider/key/status/model) + menulis `stockmeta_provider` —
  **frame, fileStore, dan metadata tidak disentuh sama sekali**. Generate berikutnya selalu
  memakai adapter/key/model hasil snapshot saat batch dimulai, sehingga setelah ganti provider
  (wajib tes ulang dulu) prompt & panggilan API memakai provider yang baru dipilih.

### Generate

- **Satu panggilan API per gambar, berurutan, jeda antar gambar dapat diatur** **[BARU]**
  (select `Jeda antar foto` di lembar kerja: **3 / 6 / 12 / 20 detik**, **default 6 detik**,
  tersimpan di localStorage `stockmeta_batch_delay`, nonaktif selama batch; batch tidak
  pernah berhenti di tengah).
- **Retry sabar** **[BARU]**: baca header `retry-after`; default **429 → 20 detik**,
  **503 → 5 detik**; **maksimal 5 percobaan**; selama menunggu frame menampilkan status
  **`Menunggu limit reset (percobaan x/5)`**; pesan error asli tetap yang tampil kalau habis retry.
- Error non-retryable (400/401/403/…) → gagal seketika, tanpa retry.
- **Prompt anti-generic** (larangan frasa generik, fokus subjek/aksi/gaya/mood), **tema per-batch**
  + **override per-foto** (tema frame menimpa tema batch), **daftar kategori resmi**
  (Adobe **21**, Shutterstock **26**) + **fuzzy match** (eksak → contains → berbagi kata →
  Levenshtein 45%). Bila tetap tidak ada padanan (atau field kategori kosong) → **fallback
  kategori resmi pertama + saran `Kategori dipilih otomatis oleh sistem, periksa kembali.`**
  **[M11]** — kategori tidak pernah kosong hasil generate, dan fallback tidak menimpa kategori
  lama yang sudah terisi.
- **Frame gagal** ditandai dengan **pesan error asli** (bukan pesan retry), **batch lanjut** ke
  frame berikutnya; **spinner per frame yang sedang diproses** **[BARU]**; **highlight frame yang
  dipilih** (termasuk saat gagal); **status/gagal tersimpan per platform** **[BARU]** (frame gagal
  di Adobe tetap `siap`/`menunggu` di Shutterstock).
- Batch hanya memproses frame di platform aktif berstatus **`menunggu`/`gagal`** — frame
  **`siap` dilewati** **[BARU]** (legacy memproses ulang semua frame); hasil masuk lewat
  `applyGenerated` — judul/deskripsi **tidak pernah ditimpa kosong**, slot yang tidak
  dikembalikan model tetap punya nilai lama.
- **Bisa dibatalkan** **[BARU]**: tombol `Batalkan` selama batch — frame yang sedang diproses
  **kembali `menunggu`** (bukan gagal, tanpa pesan error), sisa frame tak tersentuh, catatan
  limit dibersihkan; batal juga memutus jeda antar frame & tunggu retry.
- Selama batch berjalan **platform & provider terkunci**, `Tes koneksi`/`Mulai sesi baru`/
  tambah-hapus frame dinonaktifkan (alasan via `title`), **peringatan tutup tab hanya saat
  batch berjalan** **[BARU]**.
- **Frame tanpa file asli** → error per frame `File asli tidak tersedia — upload ulang frame
  ini` + **lanjut tanpa jeda** **[BARU]** (legacy menonaktifkan seluruh tombol Generate kalau
  ada file hilang).
- Progres: `Memproses 3 dari 10...` saat jalan; label akhir **`Batch selesai — 8 siap · 2
  gagal`** / **`Batch dibatalkan — 3 siap`** + pengumuman `aria-live="polite"` **[BARU]**;
  bila ada gagal karena limit → saran satu kalimat di bawah tombol: *"Beberapa frame gagal —
  coba lagi sebentar lagi lewat 'Buat metadata', hanya frame yang gagal yang diproses ulang."*
  **[BARU]**; semua frame sudah siap → catatan `Semua frame sudah selesai.` tanpa panggilan API.
- **Tombol `Coba lagi frame gagal`** **[BARU]**: muncul dekat progress bar selama ada frame
  `gagal` di platform aktif dan batch tidak berjalan; klik → jalankan batch (hanya memproses
  `menunggu`/`gagal`); otomatis hilang begitu tak ada frame gagal. Syaratnya hanya itu —
  **tetap tampil** lama setelah batch selesai, setelah pindah frame, dan setelah ganti platform
  lalu kembali **[M11: diverifikasi + tes regresi]**.
- **Tombol `Buat ulang semua`** **[M11]**: tepat di bawah `Buat metadata`, tampil hanya bila ada
  minimal satu frame berstatus `siap`/`gagal` untuk platform aktif (frame `menunggu` saja sudah
  tercakup `Buat metadata`). Klik pertama → konfirmasi inline **`Ganti semua hasil yang sudah
  ada?`**; konfirmasi → generate ulang **SEMUA** frame platform aktif (menimpa hasil yang sudah
  ada) memakai file tersimpan di fileStore — **tanpa upload ulang**; frame yang file aslinya sudah
  hilang dilewati dengan pesan `File asli tidak tersedia — upload ulang frame ini` + lencana
  *upload ulang*, sisanya tetap diproses.

### CaptionSheet

- Field editable (ikut platform), **tombol salin per field** (feedback `Disalin`, reset 1.4s).
- Keyword sebagai **chip** + **kotak teks `KEYWORDS (SIAP TEMPEL)`** dipisah koma (cerminan,
  tidak diedit langsung).
- **`Buat ulang frame ini` aktif** **[BARU]**: satu frame lewat jalur batch yang sama
  (`useBatch.regenerateFrame`); slot platform sudah berisi → konfirmasi inline **`Timpa hasil
  yang ada?`**; nonaktif + alasan jelas bila file asli hilang / provider belum Aktif / batch
  berjalan. Tombol tampil untuk frame **`gagal`** (di kotak error) **maupun** frame **`siap`**
  (strip aksi tenang di bawah baris status) **[audit A2]**.
- **Header meta `Frame nn / total`** **[BARU]**: posisi frame terpilih / jumlah frame sesi
  (bukan batas batch), mis. `Frame 01 / 03`.
- **`Saran perbaikan` hanya bila slot platform aktif berisi** **[BARU]**: slot kosong/belum
  pernah digenerate tidak dinilai; kotak error frame `gagal` tetap tampil meski slot kosong.
- Petunjuk judul Adobe **`maks 70 karakter, tanpa koma`** **[M9a]**; saran non-pemblokir baru:
  judul > 70 (batas CSV), judul ber-koma, nama file > 30 karakter (Adobe saja).
- Footer **`N baris punya saran perbaikan`** **[M9a]**: jumlah frame (baris) yang punya saran
  untuk platform aktif — tampil di dekat tombol `Export CSV` bila > 0, **tidak memblokir
  ekspor**. Footer **`N baris`** = jumlah baris yang **benar-benar diekspor** (slot berisi),
  bukan jumlah frame **[audit F2]**.

### CSV

- Export **sesuai template resmi per platform** **[BARU — M9a, spesifikasi resmi, bukan legacy]**.
  Sumber: dokumentasi kontributor resmi Adobe Stock dan Shutterstock (template/aturan impor CSV).
  **Impor CSV nyata ke portal masing-masing masih perlu uji manual** — verifikasi dengan impor
  CSV uji sebelum dipakai produksi.
  - **Adobe Stock** — header **persis** `Filename,Title,Keywords,Category,Releases`:
    `Filename` maks **30 karakter** (termasuk ekstensi); `Title` maks **70 karakter** dan
    **tanpa koma** (koma diganti spasi saat ekspor; judul **tidak dipotong diam-diam** —
    kelebihan jadi saran); `Keywords` satu sel bertanda kutip dipisah koma (urut relevansi,
    maks 50); `Category` = **nomor** kategori (`ADOBE_CATEGORY_IDS`, 1–21; kosong bila belum
    dipilih); `Releases` selalu kosong.
  - **Shutterstock** — kolom A–D: `Filename`, `Description`, `Keywords`, `Categories`; kategori
    = 1–2 nama resmi dalam **satu sel** dipisah koma; kolom opsional E–G (Illustration, Mature
    content, Editorial) **tidak disertakan**.
  - Keduanya: **hanya baris yang slot platform aktif berisi**; quoting `"`, BOM UTF-8, baris
    `\r\n`, dan nama file unduhan (`stockmeta-adobe-stock-metadata.csv` /
    `stockmeta-shutterstock-metadata.csv`) tetap. Sel berawalan `=`/`+`/`-`/`@` (atau tab/CR)
    dinetralkan dengan awalan `'` — netralisasi **CSV-injection** agar formula tidak dieksekusi
    spreadsheet **[audit C1]**.

### Sesi & tema

- **Riwayat sesi di localStorage** (`stockmeta_session`) — **thumbnail kecil saja** (±220px JPEG),
  tanpa objek `File`; debounce 500ms untuk edit teks, langsung untuk aksi struktural; kuota penuh →
  tulis ulang tanpa thumbnail; sesi kosong → kunci dihapus.
- Tombol **`Mulai Sesi Baru`** (confirm) → kosongkan frame/progress/tema + hapus kunci sesi;
  API key tidak disentuh.
- Status koneksi & key **tidak** ikut dipulihkan (wajib tes ulang).
- **Mode siang/malam** **[BARU]**: **satu skema warna untuk semua panel (tanpa dual-tone** —
  legacy punya polaritas gelap/kertas, versi ini menyeragamkan), **ikuti preferensi sistem**,
  bisa **di-override manual**, **tersimpan** di localStorage.

### Batas

- Seluruh UI **Bahasa Indonesia**; yang tetap Inggris: nama teknis (`Export CSV`, `API key`,
  `Provider`), nama provider/platform, kategori resmi Adobe/Shutterstock.

## Catatan perubahan sadar dari legacy

- ID platform: legacy `'adobe-stock' | 'shutterstock'` → **`'adobe' | 'shutterstock'`**
  (lihat `src/lib/types.ts`); nama tampilan tetap `Adobe Stock`.
- Legacy menyimpan metadata sebagai satu kantong flat (`title`/`desc`/`cat` per frame) →
  versi ini memisah **slot per platform** `frame.metadata.{adobe,shutterstock}`; ganti platform
  tidak menghapus apa pun, hanya memindahkan fokus pembacaan.
- Legacy memakai polaritas ganda `.is-dark` / `.is-paper` → diganti satu skema (lihat kontrak
  mode siang/malam).
- Catatan tunggu retry ditampilkan **statis** `Menunggu limit reset (percobaan 2/5, ~15 dtk)`
  (legacy menghitung mundur tiap detik); angka percobaan = percobaan yang akan dijalankan
  (legacy: nomor retry yang baru lewat).
- `src/lib/batch.ts` menerima callback **`onCancel`** tambahan (di luar `onStart/onWait/
  onSuccess/onError`) karena hanya pemanggil yang bisa mengembalikan frame batal ke
  `menunggu`; `useSession.snapshot()` / `applyGenerated` / `failFrame` adalah aksi baru untuk
  membaca state segar & menulis hasil batch di dalam callback async.
- Prompt & parser judul Adobe (M9a): **maks 70 karakter dan tanpa koma** (spesifikasi CSV resmi
  Adobe) menggantikan batas legacy 200 — **tes prompt yang dibandingkan persis dengan legacy
  sengaja diperbarui**; parser merapikan koma → spasi lalu memotong di 70, ekspor CSV hanya
  merapikan koma tanpa memotong (kelebihan dikasih tahu lewat saran validasi).
- Layout (M11): dari kerangka "aplikasi setinggi layar + scroll di dalam tiap panel" (M5–M7)
  menjadi **satu dokumen yang menggulir**; Worksheet & CaptionSheet tingginya mengikuti isi
  (grid 2 kolom ≥1024px tetap), tanpa scrollbar internal, Header non-sticky.
- Kategori generate (M11): parser **tidak pernah** mengembalikan kategori kosong — fallback
  kategori pertama + bendera `categoryAuto` + saran periksa (perubahan kontrak dari
  "kategori tanpa padanan tidak ditulis sama sekali"; tesnya ikut diperbarui).
