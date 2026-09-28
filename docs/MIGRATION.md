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

## Perbaikan pasca-M11 (M12) — bukan tahap migrasi baru

Verifikasi: `npm run test` (173 tes), `npx tsc --noEmit`, `npm run lint`, `npm run build` — lolos.
Tanpa e2e, tanpa menjalankan server (lihat butir 3 untuk cakupan uji zoom).

### 1. Kotak "Kata kunci (siap tempel)" dihapus

- `src/components/KeywordEditor.tsx`: dibuang **label `Kata kunci (siap tempel)`, CopyButton di
  sampingnya, dan textarea readonly** (`#kw-plain`) yang menampilkan `keywordsToPlain`.
- **Dipertahankan**: chip kata kunci + input, dan **satu** `CopyButton` di samping label
  `Kata kunci` (line 41) — tetap menyalin format dipisah koma lewat `keywordsToPlain`;
  `src/lib/keywords.ts` + tesnya tidak diubah.
- Tes: tidak ada tes lama yang menyinggung elemen ini (diverifikasi); ditambah regresi di
  `CaptionSheet.test.ts` (M12: `#kw-plain` null, teks "siap tempel" hilang, tombol salin tetap ada).
- `docs/DESIGN.md`: baris `Panel`/`KeywordEditor`/`Worksheet` ikut disesuaikan (ikut M11/M12).

### 2. Audit tinggi terkunci ke viewport & scroll non-body

Hasil scan seluruh `src/` (`vh|dvh|svh|h-screen|min-h-screen|calc(...)|max-height|overflow-y|…`):

| Lokasi | Temuan | Keputusan |
| --- | --- | --- |
| `src/app/page.tsx:21` | `min-h-dvh` pada wrapper | **Dihapus** — wrapper jadi `<div>` polos, tinggi = isi. |
| `src/app/layout.tsx:35` | `h-full` pada `<html>` | **Dihapus** — html tinggi = isi (background body tetap merambat ke canvas, tidak ada strip kosong). |
| `src/app/layout.tsx:40` | `min-h-full` pada `<body>` | **Dihapus**. |

Sisa temuan yang **tidak** diubah (bukan tinggi viewport, alasan spesifik):

| Lokasi | Alasan dipertahankan |
| --- | --- |
| `src/components/Panel.tsx:27` `overflow-hidden` | Hanya *clipping* sudut membulat (strip full-bleed CaptionSheet pakai margin negatif) — bukan scroll. |
| `src/components/Worksheet.tsx:143` `overflow-hidden` | Track progress `h-1.5` (ketinggian kontrol, bukan viewport). |
| `src/components/Worksheet.tsx:190` `overflow-hidden` | Tile frame: memotong thumbnail ke sudut membulat. |
| `src/components/Worksheet.tsx:146,203,205` `h-full` | `100%` **parent** (isian progress & thumbnail dalam `aspect-square`), bukan viewport. |
| `src/app/globals.css:125` `height:12px` (`.spinner`) / `:166` `min-height:40px` | Ukuran kontrol & target sentuh layar kecil. |
| `src/components/CaptionSheet.tsx` textarea `rows={2}`/`rows={3}` | Kontrol isian native — menampilkan teks berbaris dan menggulir isinya sendiri saat panjang (bukan layout scroll). |
| `<select>` (provider/platform/kategori/jeda) | Dropdown native — menggulir daftarnya sendiri, sengaja. |
| `src/components/CopyButton.tsx:6` textarea `position:fixed` | Alat salin cadangan `execCommand`, langsung dibuang dari DOM. |

**`overflow-y-auto` / `overflow-y-scroll` di seluruh `src/`: NOL** — tidak ada elemen non-body
yang punya scrollbar sendiri. Satu-satunya pengguliran adalah dokumen (body) dan kontrol native.

Perubahan kecil terkait rapat-di-layar: `src/components/CaptionSheet.tsx` footer Export CSV
diberi `flex-wrap` (baris turun di layar sempit, tidak meluber).

### 3. Uji zoom 50–150%

- Karena pass ini dilarang menjalankan server/e2e, **verifikasi piksel di browser belum
  dilakukan** — yang dipastikan dari kode: **tidak ada lagi tinggi yang dikunci ke viewport**
  (tabel di butir 2), jadi zoom hanya mengubah lebar/kolom, tidak pernah membuat kotak kosong
  buatan; grid frame `auto-fill minmax(150px,1fr)` menambah/mengurangi kolom mengikuti lebar;
  breakpoint `lg` (≥1024px CSS) menumpuk jadi 1 kolom pada zoom tinggi/layar sempit; teks/tombol
  memakai wrap (`flex-wrap` header, konfirmasi, footer) dan `truncate` pada nama file/chip.
- Ruang kosong di bawah konten saat zoom 50% (viewport CSS jadi lebih luas) = normal, tidak
  dikompensasi dengan tinggi apa pun.
- **Tindak lanjut yang perlu Anda lakukan manual**: buka halaman di browser, cek zoom 50 / 67 /
  80 / 100 / 125 / 150% dengan 1–2 frame dan 10 frame, plus lebar mobile — pastikan tidak ada
  elemen terpotong/tumpang tindih.

## Perbaikan pasca-M12 (M13) — bukan tahap migrasi baru

Verifikasi: `npm run test` (180 tes), `npx tsc --noEmit`, `npm run lint`, `npm run build` — lolos.
Tanpa e2e, tanpa menjalankan server. Detektor desain (`impeccable detect --json`) dijalankan atas
5 file UI yang berubah: **nol temuan**.

### 1. "Buat ulang frame" pindah dari CaptionSheet ke ikon di tile Worksheet

- `src/components/CaptionSheet.tsx`: **dihapus** blok tombol `Buat ulang frame ini` + konfirmasi
  `Timpa hasil yang ada?` — baik di kotak error (frame `gagal`) maupun di strip aksi (frame `siap`).
  **Dipertahankan**: kotak error `role="alert"` berisi pesan error lengkap.
- Props `provider` & `batch` **dibuang** dari CaptionSheet (tidak ada lagi pemakainya) —
  `src/app/page.tsx` cukup `<CaptionSheet session={session} />`.
- `src/components/Worksheet.tsx` (`FrameTile`): **ikon SVG panah-putar 28×28** di pojok kanan atas,
  14px di kiri tombol hapus (X); `aria-label="Buat ulang metadata untuk <nama file>"`.
  - Ada di **setiap** tile (menunggu/siap/gagal). Frame `gagal` → aksen
    (`border-accent-text/70 text-accent-text` + hover wash); lainnya netral (`border-line text-ink-2`).
  - **`aria-disabled` + `title`, bukan `disabled` native**: alasan nonaktif tetap muncul sebagai
    tooltip di semua browser (native `disabled` menahan event mouse di sebagian peramban) —
    `File asli hilang setelah sesi di-restore …` / `Batch sedang berjalan — tunggu selesai.` /
    `SOON_NOTE` / `Tes koneksi provider dulu.`; klik saat nonaktif di-guard di handler (tes:
    tidak ada batch yang dijalankan). Alasan juga terbaca AT lewat `title`.
  - Konfirmasi **`Timpa hasil yang ada?` tetap** (jalur `useBatch.regenerateFrame`, konfirmasi 2
    langkah persis seperti sebelumnya) tapi kini **popover yang menempel pada tile**
    (`absolute left-1.5 right-1.5 top-[42px]`, `border-fail` + `shadow-panel`) tepat di bawah
    ikon — tidak di lembar caption. Slot kosong → langsung jalan tanpa konfirmasi.
  - Jarak 14px ke tombol X disengaja: area klik keduanya (`before:-inset-1.5`, 40px target sentuh)
    jadi tidak tumpang tindih; `z-10` eksplisit pada ketiga kontrol tile (regen, popover, hapus)
    supaya berada di atas tombol pilih yang menutupi seluruh tile.
- Tes: 2 tes regresi CaptionSheet diganti (kotak error tetap; tombol + konfirmasi hilang) dan
  **5 tes baru** di `Worksheet.test.ts` (label, aksen frame gagal, `aria-disabled` + 3 alasan +
  guard, konfirmasi dua langkah, frame menunggu langsung generate).

### 2. Tinggi daftar chip kata kunci — pengecualian scroll yang disengaja

- `src/components/KeywordEditor.tsx`: pembungkus chip →
  `max-h-[200px] overflow-y-auto overscroll-contain` (dalam rentang 180–220px).
- **Ini pengecualian terdokumentasi terhadap aturan M12 "tanpa scroll internal"**: hanya daftar
  chip (bisa 50 item) yang dibatasi. Input kata kunci baru, panel CaptionSheet, dan seluruh
  elemen lain tetap tingginya = isi.
- `src/app/globals.css`: utilitas baru **`.scroll-slim`** — scrollbar 6px yang diwarnai dari token
  (`--line`, hover `--ink-3`) di kedua mode, termasuk pseudo-element WebKit, supaya bagian
  peramban yang tidak kita gambar ikut membawa desain.

### 3. Keterangan bantu & penghitung masuk ke DALAM kotak isian

- `src/components/CaptionSheet.tsx` — komponen baru `InFieldNote`
  (`absolute bottom-1.5 right-3`, mono 10px uppercase `--ink-3`, `pointer-events-none`):
  - **Judul (Adobe)**: hint `maks 70 karakter, tanpa koma` + penghitung yang tadinya baris
    terpisah → jadi satu baris menempel `0/70 · tanpa koma`; textarea `pb-6 pt-2` (24px ruang
    kosong di bawah) supaya teks yang diketik tidak tertimpa. **Baris hint lama dihapus.**
  - **Deskripsi (Shutterstock)**: penghitung **baru** `n/200` (`MAX_DESCRIPTION`) di pojok yang
    sama; petunjuk instruksional `Tulis kalimat deskriptif utuh …` **tetap di bawah** kotak
    (sengaja: memindahkannya membuat kotak terlalu penuh).
- `src/components/KeywordEditor.tsx`: `0/50`, badge `min N`, dan `penuh` pindah dari baris
  terpisah ke pojok kanan bawah kotak input; input diberi **`pr-24`** (ruang tetap 96px supaya
  teks yang diketik tidak lewat di bawahnya, dan layout tidak melompat saat badge muncul).

### 4. Rapat spasi diseragamkan ke skala

| Lokasi | Sebelum | Sesudah | Alasan |
| --- | --- | --- | --- |
| `src/app/page.tsx` `main` | `lg:gap-3.5` (14px) | `lg:gap-4` (16px) | jarak antar panel = padding panel (`p-4`) |
| `Worksheet` tombol frame + pesan limit | `-mt-1` (margin negatif di luar skala) | satu grup `flex-col gap-1.5` | sama persis dengan hint di bawah `Buat metadata` |
| `Worksheet` konfirmasi `Ganti semua…` | `px-3 py-2.5` | `p-3` | kotak isian lain (saran, error) `p-3` |
| `KeywordEditor` root | `gap-2` | `gap-1.5` | = semua grup label→kontrol (`Field`, tema, jeda) |
| CaptionSheet blok utama | `gap-4` | `gap-4` (tetap) | ritme antar-blok 16px bertahan setelah 2 blok regen dihapus |
| Grid thumbnail | `gap-2.5` (10px) | tetap | sengaja lebih rapat daripada ritme blok 16px |

### 5. Keadaan kosong CaptionSheet

- Ikon SVG inline **garis tipis** (frame gambar + dua baris caption, stroke 1.25,
  `text-ink-3`) — bukan emoji, tanpa ilustrasi gambar.
- Kolom terpusat: ikon → judul `Belum ada frame dipilih` (13.5px semibold) → penjelasan yang sudah
  ada (12px, `max-w-[42ch]`); `gap-3` ikon↔teks, `gap-1` judul↔penjelasan.
- `min-h-32` dibuang → tinggi mengikuti isi (`py-9`), proporsional terhadap konten sendiri.

### 6. Tinjauan umum (temuan → perbaikan)

1. Dua ikon di tile bersaing area klik → jarak 14px, `before:-inset-1.5` tidak lagi tumpang tindih; glyph berbeda (silang vs panah putar); aksen merah hanya untuk frame gagal.
2. Popover konfirmasi `top-[42px]` — mulai di bawah baris ikon, tidak menutupi badge nomor (y≈6–22) maupun badge `SIAP`/`GAGAL` (pojok bawah thumbnail), dan tetap di dalam batas `overflow-hidden` tile.
3. Tombol pilih membalut seluruh tile → ketiga kontrol (ikon regen `z-10`, popover `z-10`, hapus `z-10`) diangkat di atasnya; tombol pilih tetap statis sehingga tidak ada yang tertutup.
4. `pointer-events-none` pada semua teks yang menempel di dalam kotak → klik mengenai textarea/input, bukan teksnya.
5. Kontras: counter/hint baru memakai `--ink-3` (≥4.5:1 di semua permukaan), ikon regen `--ink-2` di atas `bg-surface/85`, aksen `--accent-text` — tidak ada warna hard-coded baru.
6. Radius & garis ikut sistem yang ada: popover `rounded-lg` + 1px (sama seperti kotak error/saran), tombol ikon `rounded-md`, keadaan kosong `rounded-xl` dashed (sama seperti dropzone).
7. Font baru semua dari skala yang ada: body 13.5px, hint 12px, readout mikro mono 10px bold uppercase `0.08em` (sama seperti badge `SIAP`/`min 5`).
8. Ikon keadaan kosong diperiksa geometrinya: dua garis caption disusun panjang-dulu-pendek-di-bawah (dibetulkan saat review).
9. `.scroll-slim` menyetel scrollbar dari token — permukaan peramban ikut membawa palet (gelap & terang).
10. Nol temuan dari `impeccable detect` setelah seluruh perubahan; `npm run lint` bersih.

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
- Keyword sebagai **chip** + input; salin daftar (dipisah koma) lewat **satu tombol salin di
  samping label `Kata kunci`** **[M12: kotak teks `KEYWORDS (SIAP TEMPEL)`/cerminan dihapus]**.
  **[M13]** penghitung `0/50` + badge `min N`/`penuh` **menempel di pojok kanan bawah kotak
  input** (ruang cadangan `pr-24`), dan daftar chip dibatasi **`max-height` 200px + scroll**
  — satu-satunya scroll internal di aplikasi (pengecualian terdokumentasi M13).
- **Buat ulang satu frame** **[BARU + M13: pindah tempat]**: jalur batch yang sama
  (`useBatch.regenerateFrame`); slot platform sudah berisi → konfirmasi **`Timpa hasil yang
  ada?`**; nonaktif + alasan jelas bila file asli hilang / provider belum Aktif / batch berjalan.
  Tampil untuk frame **`gagal`**, **`siap`**, maupun **`menunggu`** **[audit A2]** — tapi
  sejak **M13** bentuknya **ikon di pojok kanan atas setiap tile Worksheet**
  (`aria-label="Buat ulang metadata untuk <nama file>"`, aksen merah untuk frame gagal,
  `aria-disabled` + `title` untuk alasan) dengan konfirmasi sebagai **popover menempel di
  bawah ikon**; lembar caption hanya menyimpan **kotak error** frame gagal.
- **Header meta `Frame nn / total`** **[BARU]**: posisi frame terpilih / jumlah frame sesi
  (bukan batas batch), mis. `Frame 01 / 03`.
- **`Saran perbaikan` hanya bila slot platform aktif berisi** **[BARU]**: slot kosong/belum
  pernah digenerate tidak dinilai; kotak error frame `gagal` tetap tampil meski slot kosong.
- Petunjuk judul Adobe **`maks 70 karakter, tanpa koma`** **[M9a]**; saran non-pemblokir baru:
  judul > 70 (batas CSV), judul ber-koma, nama file > 30 karakter (Adobe saja).
  **[M13]** petunjuk batas + penghitung judul **menempel di pojok kanan bawah textarea**
  (bukan baris terpisah); deskripsi punya penghitung `n/200` yang sama, sedangkan petunjuk
  instruksional tetap di bawah kotak.
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
- Tinggi viewport (M12): `min-h-dvh` (wrapper halaman), `h-full` (`<html>`) dan `min-h-full`
  (`<body>`) dibuang — **tidak ada satupun** tinggi yang dikunci ke ukuran layar; semua elemen
  tingginya murni isi. Ruang kosong di bawah konten (mis. zoom 50%) berasal dari background
  halaman, bukan dari kotak kosong buatan.
- Kata kunci (M12): legacy & versi awal punya cerminan readonly **`KEYWORDS (SIAP TEMPEL)`**
  → kini hanya chip + **satu tombol salin** di label `Kata kunci` (`keywordsToPlain` tetap
  dipakai untuk proses salin).
- Lokasi aksi (M13): legacy menaruh generate-ulang per frame di lembar caption → kini **ikon di
  tile thumbnail** (dekat thumbnail-nya, untuk semua status), CaptionSheet hanya menyimpan pesan
  error. Konfirmasi `Timpa hasil yang ada?` dipindah ke popover yang menempel pada tile.
- Scroll internal (M13): aturan M12 "tanpa scroll non-body" kini punya **satu pengecualian yang
  disengaja dan terdokumentasi** — daftar chip kata kunci (maks 50 item) dibatasi 200px.
- Keterangan bantu (M13): hint batas & penghitung karakter **menempel di dalam kotak isian**
  (pojok kanan bawah), bukan baris terpisah di bawah — kecuali petunjuk instruksional yang
  sengaja tetap di luar agar kotak tidak penuh.
