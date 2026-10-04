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
- [x] **M6 — Worksheet**: upload/drop frame (maks 10 saat itu; **M15 menaikkan ke 20**), grid thumbnail, pilih/hapus frame,
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

> **Sebagian besar dibatalkan oleh M18** (lihat "Perbaikan pasca-M17 (M18)"): penghitung
> pindah ke baris label di atas kotak, `pb-6`/`pr-24`/`pointer-events-none` dihapus. Yang
> bertahan dari M13: penghitung Deskripsi (`n/200`), penggabungan hint+penghitung judul jadi
> satu keterangan, dan penghapusan baris hint lama `maks 70 karakter`.

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

### 5. Keadaan kosong CaptionSheet *(dihapus oleh M14 — lihat "Perbaikan pasca-M13")*

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

## Perbaikan pasca-M13 (M14) — bukan tahap migrasi baru

Verifikasi: `npm run test` (185 tes), `npx tsc --noEmit`, `npm run lint`, `npm run build` — lolos.
Tanpa e2e, tanpa menjalankan server (uji piksel/zoom = analisis statis + catatan tindak lanjut
manual). Audit poin 2 & 4 memakai skill **frontend-design**.

### 1. Tiga baris keterangan dihapus sepenuhnya

| File (posisi sebelum dihapus) | Teks yang dibuang |
| --- | --- |
| `Worksheet.tsx` — di bawah `Tema utama (opsional)` | *Berlaku untuk seluruh batch — tiap frame bisa di-override di lembar caption.* |
| `Worksheet.tsx` — di bawah `Jeda antar foto` | *Naikkan jika sering muncul 'Menunggu limit reset'.* |
| `CaptionSheet.tsx` — `Field` `Tema untuk frame ini (opsional)` | `hint="Kosongkan untuk memakai tema batch."` |

Label sudah menjelaskan fungsi masing-masing; **hint instruksional Deskripsi (Shutterstock)
tetap** (satu-satunya yang tersisa). Regresi: `Worksheet.test.ts` → describe
`keterangan bantu dihapus (M14)`.

### 2. Lembar kerja & lembar caption sama tinggi (semua lebar & zoom)

- `src/app/page.tsx:30` — `items-start` → **`items-start lg:items-stretch`**: di ≥1024px
  (kedua panel bersebelahan) tinggi baris grid = panel **tertinggi**, keduanya ikut meregang;
  di <1024px panel menumpuk sehingga tinggi masing-masing tetap = isi (aturan M12).
- `src/components/Panel.tsx:42` — body panel diberi **`grow`**: panel yang lebih pendek
  mengisi ruang tambahan dengan wajar (konten tetap di atas, footer menempel di bawah).
  Panel yang lebih tinggi **tidak** memicu scroll internal — body tetap `overflow: visible`
  (`overflow-hidden` di section hanya untuk clipping sudut membulat). Pengecualian scroll
  tetap hanya daftar chip kata kunci (M13).

### 3. Lembar caption tidak pernah kosong (state kosong M13 diganti)

- **Dihapus**: kotak kosong M13 poin 5 (ikon SVG + `Belum ada frame dipilih` + *Pilih frame di
  lembar kerja untuk mengedit caption-nya.*) beserta `max-w-[42ch]`-nya.
- **Diganti**: struktur field **sama persis seperti kondisi terisi** selalu dirender —
  `Judul`/`Deskripsi`, `Kata kunci`, `Kategori`, `Tema untuk frame ini`, blok
  `Saran perbaikan` (tetap hanya kalau relevan), footer `Export CSV` — dalam keadaan
  **kosong + nonaktif** selama belum ada frame terpilih:
  - textarea/input/`<select>` `disabled` dengan **placeholder tetap tampil**
    (`Judul menjual…`, `— pilih kategori —`, `ikuti tema batch`);
  - `KeywordEditor` menerima prop baru **`disabled`** → input & `CopyButton` nonaktif;
  - `Field` menerima prop **`disabled`** → tombol `Salin` tiap field nonaktif;
  - strip nama file + status dan kotak error tetap **hanya** saat ada frame.
- **Header meta**: ada frame → `Frame nn / total`; ada frame tapi tak terpilih →
  `Frame -- / total sesi`; **0 frame → `Frame -- / --`** (pengganti `Frame -- / 00`).
- **Footer `Export CSV` tetap ada**, nonaktif dengan alasan jelas memakai pola M13 —
  **`aria-disabled` + `title` + guard `onClick`** (bukan `disabled` native, yang menahan
  tooltip di sebagian peramban): `Belum ada frame — upload gambar dulu di lembar kerja.` /
  `Belum ada metadata — jalankan Buat metadata dulu.`
- Frame terpilih **otomatis setelah upload pertama** (`useSession.addFrame`:
  `sel: cur.sel ?? id`) — begitu ada frame, field langsung aktif berisi data frame itu.
- Tes: describe lama `keadaan kosong (M13)` **diganti 4 tes M14** (field nonaktif + placeholder
  & tombol salin, header + Export CSV ter-guard, aktif setelah upload, frame ada tapi slot
  masih kosong).

### 4. Piksel-tetap → unit relatif (responsivitas zoom/font root)

Spasi & lebar struktural seluruhnya kini **rem / % / fr**. Skala spacing Tailwind memang sudah
rem, jadi yang perlu diganti hanya nilai arbitrer berbasis piksel:

| file:baris | Sebelum | Sesudah | Alasan |
| --- | --- | --- | --- |
| `src/components/Worksheet.tsx:532` | `minmax(150px,1fr)` | `minmax(9.375rem,1fr)` | lebar minimum tile ikut membesar bila font root naik |
| `src/components/Worksheet.tsx:319` | `top-[42px]` (popover konfirmasi) | `top-[2.625rem]` | = `top-1.5` + `h-7` + gap `0.5rem` → popover selalu nempel persis di bawah ikonnya |
| `src/components/KeywordEditor.tsx:52` | `max-h-[200px]` | `max-h-[12.5rem]` | batas daftar chip ikut skala root |
| `src/components/Panel.tsx:29` | `rounded-[14px]` | `rounded-[0.875rem]` | radius container panel ikut skala root |
| `src/components/Header.tsx:35` | `rounded-[3px]` | `rounded-[0.1875rem]` | idem untuk dot brand |

**Sengaja tidak diubah:**

- Ukuran font `text-[…px]` (10/11/12/13/13.5/15/18px) — **skala tipografi yang disengaja**
  (lihat `docs/DESIGN.md` → Tipografi), bukan spasi/lebar elemen struktural.
- `src/app/globals.css`: `min-height:40px` (target sentuh), `.spinner 12px` (ukuran kontrol),
  scrollbar `6px` — ukuran kontrol/krom peramban; sudah tercatat di tabel audit M12.

Hasil audit komponen (poin 4, rentang uji 360px → >1920px dan zoom 50–150%, analisis statis):

- `Header`: `flex-wrap` + `gap-y-2.5` → brand/segmen/readout menumpuk rapi di 360px; readout
  mono membungkus sendiri.
- `ProviderPanel`: `flex-col` → `lg:flex-row lg:items-end`; provider `lg:w-44`, API key
  `flex-1 min-w-0`, blok catatan `min-w-0` → teks panjang (catatan limit) membungkus, tidak
  terpotong di lebar berapa pun.
- `Worksheet`: grid `auto-fill minmax(9.375rem,1fr)` tetap dari M6 (hanya unitnya diganti);
  dropzone `min-h-44`; tombol + pesan limit `flex-wrap`.
- `CaptionSheet`: semua field `w-full`; footer `flex-wrap`. (**M18:** `InFieldNote` sudah tidak
  menempel di dalam textarea — kini `FieldNote` sebaris dengan label, lihat "Perbaikan pasca-M17 (M18)".)
- Elemen absolut: ikon tile (`right-12`/`right-1.5`, `top-1.5`) dan popover
  (`left-1.5 right-1.5 top-[2.625rem]`) — semuanya rem, jadi menempel pada
  anchor-nya di semua ukuran; popover tetap di dalam thumbnail (≥ `9.375rem`, tile
  `overflow-hidden`). `InFieldNote` (absolut saat itu) dihapus oleh M18.
- `lg:grid-cols-[3fr_2fr]` memakai `fr` — kolom menyesuaikan tanpa lebar absolut.
- **Tindak lanjut manual (belum bisa dilakukan tanpa server):** buka halaman, uji lebar
  360 / 768 / 1024 / 1440 / 1920px dan zoom 50/67/80/100/125/150% — pastikan kedua panel sama
  tinggi di ≥1024px dan tidak ada elemen terpotong.

### 5. Spasi antar field diseragamkan

- Skala tidak berubah: root `gap-4`, grup label→kontrol `gap-1.5`, jarak antar-blok `gap-4`.
- Karena struktur field kini **identik** antara kondisi kosong dan terisi (poin 3), jaraknya
  juga identik — tidak ada lagi blok khusus (kotak kosong) yang jaraknya berbeda; berlaku di
  semua ukuran layar. Dua baris hint Worksheet yang dihapus (poin 1) tidak mengubah ritme:
  blok `Tema utama` & `Jeda antar foto` tetap `flex-col gap-1.5` seperti grup lainnya.

## Perbaikan pasca-M14 (M15) - bukan tahap migrasi baru

Tiga pekerjaan dalam satu batch, tanpa e2e dan tanpa menjalankan server. Verifikasi:
`npm run test` (185 tes), `npx tsc --noEmit`, `npm run lint`, `npm run build` — lolos semua;
`impeccable detect src` → 0 temuan.

### 1. Grid thumbnail 5 kolom + batas frame kembali 20

- `src/lib/limits.ts`: `MAX_FRAMES = 10` → **`20`** — mengembalikan batas legacy (kontrak
  "Upload & frame" di bawah ikut diperbarui; M6 sempat menurunkannya ke 10).
- `src/components/Worksheet.tsx`: grid `<ul>` kini `grid-cols-[repeat(auto-fill,minmax(9.375rem,1fr))]`
  **`min-[1120px]:grid-cols-5`** — di ≥1120px thumbnail dikunci 5 kolom sehingga 20 frame jadi
  4 baris × 5 kolom penuh; di bawah itu tetap `auto-fill` 2–4 kolom.
- Ambang 1120px (bukan `lg`/1024px) menggantikan keputusan awal "overlap diterima": pada
  V ≥1024 lebar tile = `0,12V − 20,56px`, badge nomor berakhir di 28px dari kiri
  (`left-1.5` 6px + lebar `px-1`/border/2 digit ≈22px), bayangan klik ikon regen mulai di
  82px dari kanan (`right-12` 48px + `before:-inset-1.5` 6px + lebar tombol 28px) → keduanya
  baru bebas tabrakan saat lebar dalam ≥110px, yaitu **V ≈1105px**. Ambang 1120px menyisakan
  sisa ≈1,9px, jadi di seluruh rentang **1024–1920px tidak ada tumpang tindih** (dihitung di
  titik tersempit dan melebar terus seiring lebar layar).
- Tes: `frames.test.ts` & `CaptionSheet.test.ts` dibuat relatif terhadap `MAX_FRAMES`
  (tidak lagi mematok angka 10/20 literal), `Worksheet.test.ts` kini meng-assert
  `minmax(9.375rem,1fr)` **dan** `min-[1120px]:grid-cols-5` (plus tidak ada lagi
  `lg:grid-cols-5`), `README.md` dua teks "10 frame" → "20 frame".

### 2. Scroll horizontal di daftar chip kata kunci (bug CSS)

- Akar masalah: pada CSS, `overflow-y: auto` **tanpa** `overflow-x` membuat `overflow-x`
  terhitung `auto`; pemicunya pseudo-element `before:-inset-2.5` tombol hapus chip yang melebar
  6px ke kanan kotak. (`flex-wrap` sudah ada — chip memang membungkus.)
- `src/components/KeywordEditor.tsx`: `<ul>` chip diberi **`overflow-x-hidden`** eksplisit
  (scroll vertikal + `overscroll-contain` tetap), komentar penjelas ditambahkan di tempat.

### 3. Rombak visual: tema terminal/CRT hijau-hitam dua mode ("Phosphor")

- `src/app/globals.css`: token baru diganti total — kanvas `#050805`, garis hairline hijau,
  **aksen tunggal hijau fosfor** `#39ff7a`; `--success` jadi **amber** (sinyal status, bukan
  aksen), `--fail` tetap merah; token baru `--accent-dim`, `--accent-faint`, `--on-accent`,
  `--on-fail`, `--fail-wash`, `--glow*`; token `--panel-shadow`/`shadow-panel` **dihapus**.
  Mode terang memakai pasangan hijau-daun di latar kertas (`#f3f2ea`) dengan semua glow `none`.
  Ditambah: glow statis (`.glow`, `.glow-soft`, `.glow-ok`, `.glow-text`), badge bracket
  (`.badge-bracket::before/::after` → `[` `]`, teks asli tetap di DOM), seleksi/fokus gaya
  terminal, spinner di atas tombol aksen memakai `--on-accent`.
- `src/app/layout.tsx`: **Archivo + Courier Prime dibuang**, satu font `JetBrains_Mono`
  (`--font-jetbrains`) untuk body & heading — `--font-sans` & `--font-mono` menunjuk font sama.
- Radius diseragamkan dua tingkat di semua komponen: **kontrol 4px (`rounded`)**,
  **kontainer 6px (`rounded-md`)**; `rounded-lg`/`rounded-xl`/`rounded-full` sisa dari tema lama
  dihapus (dropzone kini 6px, progress bar & semua tombol 4px).
- `Header.tsx`: brand memakai indikator fosfor + wordmark `glow-text`, pelat platform aktif
  `glow-soft`, readout status diberi glyph prompt `❯`, header ditutup garis tipis
  `bg-accent-faint` (title bar) — **titik traffic-light sengaja tidak dipakai** (menambah dua
  warna status di luar palet pada baris brand).
- `ProviderPanel.tsx`: `Tes koneksi` jadi outline aksen hijau, badge status memakai
  `.badge-bracket` tanpa rotasi (dulu `-rotate-[1.4deg]`), ikon panah select `--accent-dim`.
- `Worksheet.tsx`: tombol `Buat metadata` = isian aksen + glow (teks `--on-accent`, bukan
  `text-white`), tile terpilih `border-accent` + `glow-soft`, ikon regen frame gagal memakai
  `--fail` (bukan aksen), popover konfirmasi `bg-raised` tanpa `shadow-panel`, kotak error &
  pesan limit tetap `--fail` dengan wash `--fail-wash`, dropzone/`+ Tambah frame` hover
  `--accent-dim`.
- `CaptionSheet.tsx`: strip status memakai `.badge-bracket`, kotak error `bg-fail-wash`
  (dulu `bg-accent-wash`), ikon select `--accent-dim`.
- `KeywordEditor.tsx`/`CopyButton.tsx`/`ThemeToggle.tsx`/`Panel.tsx`: radius & hover ikut
  token baru; `Panel` tanpa bayangan lembut.
- Aksesibilitas tidak dikorbankan: kontras teks ≥4.5:1 dihitung ulang untuk dua mode, focus
  ring `2px` tetap, target sentuh ≥40px tetap, glow **statis** (bukan animasi) jadi aman bagi
  `prefers-reduced-motion`, bracket badge tidak mengubah teks yang dibaca pembaca layar.
- Tes terdampak: `Worksheet.test.ts` — asersi ikon regen gagal berubah dari
  `text-accent-text` → `text-fail` (mengikuti keputusan warna di atas).

## Perbaikan pasca-M15 (M16) - bukan tahap migrasi baru

Konsistensi visual murni: **struktur HTML, perilaku, dan teks tidak berubah** — hanya kelas
styling + token CSS. Tiga skala resmi ditulis ke `docs/DESIGN.md` ("Skala M16").

### 1. Ketebalan border diseragamkan ke DUA nilai

- **1px** untuk semua elemen biasa, **2px** untuk elemen menyala/ditekankan: tile terpilih,
  tombol utama `Buat metadata` (`border-2 border-accent`, se-warna dengan fill), badge status
  di tiga tempat (ProviderPanel, tile Worksheet, strip CaptionSheet), kotak error
  `role="alert"`, dropzone kosong, dan **isian saat fokus**.
- Fokus isian = `border-color: --accent` + `box-shadow: inset 0 0 0 1px --accent` (1px border +
  1px ring inset). Menambah `border-width` sungguhan akan menambah tinggi input ber-height
  auto tiap pindah field (layout shift) — aturan yang sama dipakai untuk state sementara
  (hover, drag-over, tombol armed): warna saja, tidak pernah lebar.
- Mode terang: `--glow-input` berubah dari `none` → `0 0 0 0 transparent` supaya tetap sah
  digabung dengan ring inset dalam satu deklarasi `box-shadow`.
- `border-fail/70` pada ikon regen → `border-fail` (warna status dipakai konsisten penuh).

### 2. Skala ukuran font: lima tingkat token `@theme`

- `--text-meta 11px` · `--text-small 13px` · `--text-body 14px` · `--text-title 16px` ·
  `--text-brand 20px` — semua `text-[NNpx]` hard-coded di komponen dihapus (0 sisa).
- Mapping: `10px`→11 (badge/konfig), `11px`→11 (label/counter/readout), `12px`→13 (hint,
  nama file, catatan), `13–15px`→14 (nilai isian, teks tombol, teks dropzone, pesan error),
  judul panel 15→16, wordmark 18→20. Placeholder ikut ukuran input (14px) — tidak ada
  lompatan ukuran saat mulai mengetik.
- Tidak ada tes yang meng-assert ukuran font (perubahan aman).

### 3. Skala spasi: {4, 6, 8, 12, 16, 24}px

- Hilangkan semua nilai 10px: `gap-2.5`/`gap-y-2.5`→8, `pb-2.5`→8, `px-2.5`→12,
  `py-2.5`→8 (tombol besar), panah select `right-2.5`→12; `gap-0.5` (micro-stack di tile &
  segmen) → `gap-1`; dropzone `py-8`(32)→`py-6`(24). Sisa gap: 4/6/8/12/16 saja.
- **Gap grid thumbnail 10px → 8px** → geometri baru `W = 0,12V − 18,96px`; syarat bebas
  tabrakan `W ≥ 82 + 27,2 = 109,2px` (badge nomor `text-meta` tanpa kotak) → aman sejak
  V ≥1068px; ambang 1120px menyisakan ≈6,2px. Komentar matematika di `Worksheet.tsx`
  dan `docs/DESIGN.md` ikut diperbarui.
- Reserve fungsional dibiarkan: `pr-8` (panah select), `pr-10` (tombol lihat key);
  `pr-24` (penghitung keyword) — **dihapus oleh M18** (penghitung pindah ke baris label).

### 4. Badge terbagi dua keluarga

- **Badge status** (bracket + kotak `border-2`, warna status; label netral =
  `border-dashed border-ink-2`): `AKTIF`, `SIAP`, `GAGAL`, `MENUNGGU/PROSES`.
- **Badge meta kecil jadi teks polos tanpa kotak**: `min 5`, `penuh`, `0/50`, nomor frame
  `01` (tetap `bg-surface/85` untuk keterbacaan di atas thumbnail), nama model, `upload ulang`
  — sebelumnya lima gaya kotak berbeda. Karena tanpa border, ukurannya ikut `text-meta`.
- Tes tidak meng-assert kelas badge/ukuran; hanya warna (`text-fail`) yang di-assert dan tetap.

Verifikasi M16: `vitest` **185/185**, `tsc --noEmit` **0**, `eslint` **0**, `next build` sukses,
`impeccable detect --json src` → **`[]`** (exit 0).

## Perbaikan pasca-M16 (M17) - bukan tahap migrasi baru

Penggantian seluruh palet warna + penajaman UI per area. Kontrak perilaku, endpoint API,
hook, dan fitur **tidak berubah** (lihat "Kontrak perilaku" di bawah — semua daftar tetap
lengkap: platform Adobe/Shutterstock, provider Gemini/Groq/Coming Soon, tes koneksi, badge
status, catatan rate-limit, drag-drop, batch 20 frame, jeda antar foto, tema batch + tema per
frame, ikon buat ulang per frame, chip kata kunci, kategori dropdown, salin per field,
Export CSV, Mulai sesi baru, toggle siang/malam).

### 1. Token warna diganti utuh (sumber kebenaran baru)

Palet inti mode gelap persis seperti brief M17; token lama dihapus total — tidak ada dua
sistem token berjalan bersama.

| Token lama | Token baru |
| --- | --- |
| `--raised`, `--well` | `--surface-elevated` |
| `--line`, `--line-soft` | `--border`, `--border-strong` |
| `--wash`, `--accent-wash` | `--accent-tint` |
| `--ink`, `--ink-2`, `--ink-3` | `--text`, `--text-secondary`, `--text-muted` |
| `--fail`, `--fail-wash`, `--on-fail` | `--error`, `--error-tint`, `--error-contrast` |
| `--success-wash` | `--success-tint` (warna `--success` **amber → hijau** `#35d98a`) |
| `--plate`, `--plate-ink`, `--on-accent` | `--accent` + `--accent-contrast` |
| `--accent-dim` | dihapus — hover isian `hover:border-accent/60`, panah select → `text-text-muted`, regen → `hover:border-accent hover:text-accent-text` |
| `--wait` | dihapus (tidak pernah dipakai) |
| `--bg-secondary` | dipertahankan (chrome band Header/ProviderPanel/dropzone) |

Utilitas Tailwind baru di `@theme inline`: `bg-bg`, `bg-bg-secondary`, `bg-surface`,
`bg-surface-elevated`, `border-border`, `border-border-strong`, `text-text`,
`text-text-secondary`, `text-text-muted`, `text-success/warning/error`, `bg-*-tint`,
`text-accent-contrast`, `text-error-contrast`. Class rename massal ke seluruh
`src/components/*.tsx` (+ `Worksheet.test.ts`): `text-ink*`→`text-text*`,
`border-line`→`border-border`, `bg-well/raised`→`bg-surface-elevated`, `bg-wash`→`bg-accent-tint`,
`*-fail`→`*-error`, `on-accent`→`accent-contrast`, `plate`→`accent`.

### 2. Glow diturunkan: hanya tombol utama

`--glow-soft`, `--glow-text`, `--glow-input`, `--glow-ok` + kelasnya dihapus. Sisa glow:
`.glow` pada tombol `Buat metadata` dan titik brand (statis, mode terang `none`). Segmen
platform aktif, tile terpilih, wordmark, badge Aktif, dan fokus isian kini memakai
isian/border aksen bersih. Fokus isian = garis aksen + ring inset (tanpa glow-input).

### 3. Perbaikan UI per area (klasifikasi temuan)

- **Header**: band `bg-bg-secondary`; wordmark tanpa glow; segmen platform pelat aktif
  solid aksen + hover `bg-accent-tint` + `transition-colors`; readout dipecah jadi span
  (pemisah `/` `aria-hidden`) dan **status diberi warna status** (aktif=`--success`,
  gagal=`--error`, menguji=`--accent-text`, idle netral).
- **ProviderPanel**: band `bg-bg-secondary`; select/API key/`Tes koneksi` `h-10` (tinggi
  seragam 40px) + hover `border-accent/60`; badge status kehilangan glow dan mendapat
  **titik indikator warna** (sukses/gagal/menguji/idle), badge idle tanpa tint;
  catatan limit & nama model `text-text-muted` (lebih redup, pesan hasil tes tetap
  `text-text-secondary`).
- **Worksheet**: dropzone kosong mendapat **ikon unggah** + `bg-bg-secondary` +
  `hover:border-accent/70`, sub-line `text-text-secondary` (AA saat drag-over mengubah
  latarnya ke tint); **badge `MENUNGGU`** ditambahkan di tile (4 status kini terbaca);
  tile terpilih tanpa glow (border 2px + tint); tombol utama `h-11` (44px, paling
  menonjol); `Batalkan` & `Coba lagi` hover `bg-error`; ikon buat ulang hover
  `border-accent`; input tema/jeda `h-10` + hover aksen.
- **CaptionSheet**: counter isian punya **nada warna** (netral → `--warning` ≥60% kuota →
  `--error` lewat batas) + `aria-describedby`; strip status netral
  `border-border-strong`; select `h-10` + hover aksen; kotak saran tetap elevated; jumlah
  baris di footer naik ke `text-text-secondary`.
- **KeywordEditor**: chip lebih lega (`py-1`), input `h-10` + hover aksen, `min 5` →
  `text-warning`.
- **CopyButton**: state `Disalin` = `border-success bg-success-tint text-success`; hover
  netral `border-border-strong` + `bg-accent-tint`.
- **Micro-interaction**: `transition-colors` ditambahkan ke badge, tile, dropzone,
  segmen; `prefers-reduced-motion` tetap mematikan animasi dan mempertahankan transisi
  warna (umpan balik state).
- **Responsif/tata letak**: tanpa perubahan geometri grid (M16 dipertahankan);
  `Panel` ditambah `min-w-0` supaya kolom grid tidak bisa memaksa overflow horizontal.

### 4. Verifikasi M17

`vitest` **185/185**, `tsc --noEmit` **0**, `eslint` **0**, `next build` sukses,
`impeccable detect --json src` → **`[]`** (exit 0). Kontras diukur skrip
(gelap+terang, termasuk composite tint): semua teks ≥4,5:1; titik terketat
`--text-muted` di atas `--surface-elevated` = 4,52:1.

### 5. M17b — batas kontrol naik ke ≥3:1 (token `--border-control`)

Perbaikan kecil pasca-M17 atas temuan "border vs permukaan hanya ≈1,6–2,2:1" (SC 1.4.11):

- Token BARU `--border-control` (`#3a7c51` gelap, `#718380` terang) + utilitas
  `border-border-control` di `@theme inline`. **`--border` global tidak diubah** —
  tetap `#1b3d28`/`#c7d3cb` untuk garis pembatas struktural non-interaktif (pemisah
  panel, hairline, kotak konfirmasi, chip, progress track) sesuai brief "tipis, redup".
- Dipakai **hanya** di kelas `input`/`textarea`/`select`/`button` (23 titik): select &
  input tema/jeda/API, textarea judul/deskripsi, input kata kunci, tombol Export CSV,
  toggle detail mobile, Tes koneksi (state disabled), NewSession, Tambah frame,
  dropzone, Buat ulang semua, ikon hapus/buat ulang, tombol popover, CopyButton,
  ThemeToggle. Hover CopyButton menaik ke `hover:border-accent/70` (sebelumnya
  `border-border-strong` yang justru lebih redup dari batas kontrol baru).
- Dibiarkan `border-border`: Panel, header, divider strip, kotak saran, container
  segmented, chip kata kunci (elemen non-interaktif), progress track, tile frame
  (wadah; tombol di dalamnya tanpa border sendiri — statusnya dibaca dari border aksen
  2px saat terpilih).
- Kontras terukur skrip: gelap **3,78 / 3,55 / 3,85 / 3,99:1** dan terang
  **3,87 / 3,99 / 3,34 / 3,57:1** (vs surface / elevated / bg-secondary / bg) — semua ≥3.

## Perbaikan pasca-M17 (M18) — bukan tahap migrasi baru

**Membalik sebagian keputusan M13** (masukan langsung): keterangan bantu & penghitung tidak
lagi "menempel" di dalam kotak isian, melainkan **sebaris dengan label field — di atas kotak**.
Alasan: penghitung di atas kolom isian memakai ruang yang seharusnya dipakai teks yang diketik,
dan `0/70 · TANPA KOMA` lebih cepat ditemukan kalau berdampingan dengan labelnya.

### 1. Posisi keterangan & penghitung

- `src/components/CaptionSheet.tsx`: komponen `InFieldNote` → **`FieldNote`** — tanpa
  `absolute`, tanpa `bottom-1.5 right-3`, tanpa `pointer-events-none` (tidak ada lagi teks
  yang menutupi kolom isian). Dipakai lewat prop baru **`note`** pada `Field`; baris label
  jadi `flex flex-wrap items-center justify-between gap-x-2 gap-y-1`:
  **label di kiri**, **grup kanan** (`ml-auto`) berisi keterangan + tombol `Salin`.
  Saat layar/zoom sempit grup kanan turun ke baris kedua dan **tetap rata kanan**, sehingga
  label & tombol salin tidak pernah meluber.
  - **Judul**: `n/70 · tanpa koma`, nada netral → `--warning` ≥60% → `--error` (M17) tetap,
    masih dirujuk `aria-describedby` textarea.
  - **Deskripsi**: `n/200` (`MAX_DESCRIPTION`) sama; petunjuk instruksional
    `Tulis kalimat deskriptif utuh …` tetap di **bawah** kotak.
  - **Kategori / Tema**: tanpa keterangan → baris label hanya label + `Salin` (tidak dipaksakan).
- `src/components/KeywordEditor.tsx`: `0/50`, badge `min N`, dan `penuh` pindah ke baris
  label dalam grup **`#kw-count`** (di kiri tombol salin), dan input kini memakai
  **`aria-describedby="kw-count"`** — penghitung yang keluar dari kotak tetap terbaca
  pembaca layar.

### 2. Ruang cadangan di dalam kotak dihapus

| Lokasi | Sebelum (M13) | Sesudah (M18) |
| --- | --- | --- |
| textarea judul & deskripsi | `pb-6 pt-2` (24px kosong di bawah) | `py-2` |
| input kata kunci | `pr-24` (96px cadangan) | `px-3` (seragam kotak isian lain) |
| pembungkus `relative` (2 textarea + 1 input) | ada | **dihapus**; `<select>` tetap `relative` — dipakai panah |

### 3. Tes & verifikasi

- `src/components/CaptionSheet.test.ts`: blok lama M13 (selector `#caption-title + span` +
  cek `pointer-events-none`) diganti **4 tes M18** — penghitung ada di baris label
  (`ta.previousElementSibling.contains(note)`), `pb-6`/`pr-24` hilang, `aria-describedby`
  judul/deskripsi/kata kunci tetap terpasang, tombol `Salin` masih sebaris label & penghitung.
- **188/188 tes**, `npx tsc --noEmit` 0 error, `npx eslint .` 0 temuan.

## Perbaikan pasca-M18 (M19) — bukan tahap migrasi baru

Satu label **M19** untuk dua gelombang: (a) **redesign responsif** yang sudah di-commit terpisah
(`9656947 ui: redesign responsif fluid, header, panel, dan caption`) — dirangkum di sini supaya
tak ada penanda `M19` di kode tanpa keterangan di dokumen; (b) **perbaikan tambahan** di bawah:
dua kesejajaran piksel, provider OpenRouter, dan auto-test API key. Tanpa e2e, tanpa menjalankan
server. Verifikasi akhir: `npm run test` **203/203 tes**, `npx tsc --noEmit` 0 error,
`npm run lint` 0 temuan, `npm run build` sukses.

### 1. Redesign responsif fluid (commit 9656947 — sudah masuk; ringkasan)

- **Satu container `.shell`** (`globals.css`) dipakai header, baris status chip, panel provider,
  dan `main`: `width:100%`, `max-width:120rem`, padding samping fluid
  `max(clamp(.75rem,2vw,2rem), env(safe-area-inset-*))` — tepi kiri/kanan semua blok sejajar
  dari 320px sampai ultrawide, plus aman untuk HP berponi/landscape.
- **Header lengket hanya ≥1120px** (`Header.tsx`, `z-40` + `backdrop-blur-md`), di bawah itu
  menggulir bersama halaman; baris chip status jadi scroll horizontal tanpa scrollbar
  (`.scroll-none`); segment platform jadi `grid-cols-2` di bawah 1120px.
- **Grid utama baru** (`page.tsx`): `minmax(0,1.4fr) / minmax(24rem,1fr)` mulai **1120px**
  (satu kolom di bawahnya), `items-start` (tinggi kartu = isi) + kolom caption `sticky top-28`
  di ≥1120px.
- **ProviderPanel**: di bawah 1120px disusun vertikal selebar penuh (provider → API key →
  tombol + chip status), provider berupa **segmented control** (bukan `<select>`), chip status
  diseragamkan dengan chip header (pil + dot).
- **Worksheet**: grid thumbnail intrinsik (auto-fill ≈7.5rem) + tombol aksi selebar penuh di HP.
- **CaptionSheet**: pasangan dua kolom **Kategori ↔ Tema** (`@container` + `@md:grid-cols-2`,
  penanda E.4), baris `role="status"` Kata kunci jadi `sr-only` saat kosong (E.3), keadaan
  kosong baru, pasangan dua kolom juga untuk dua select kategori Adobe.
- **`text-meta` naik ke lantai 12px** (`clamp(12px, 11.5px + .15vw, 12.5px)`); `body` jadi
  `min-height:100dvh` + `overflow-x:clip`; target sentuh **44px** (dari 40) pada
  `@media (max-width:1119px), (pointer:coarse)` + input/select/textarea 16px anti auto-zoom
  iOS; export `viewport` Next 16 (zoom tidak diblokir, `viewportFit:cover`); scrollbar dokumen
  ikut palet; fokus segmen pakai `outline-offset` supaya tidak menumpuk di atas isian aksen.

### 2. Kesejajaran garis pembatas header panel (Lembar kerja ↔ Lembar caption)

- Masalah: baris header Lembar kerja membawa tombol **Mulai sesi baru** (35px) sedangkan header
  Lembar caption hanya judul + meta (≈24px) → `border-b` kedua panel beda ±11px di ≥1120px.
- `src/components/Panel.tsx`: baris header kini **`min-h-15`** (60px = `py-3` 24 + `border-b` 1
  + 35) + dua varian penambah tinggi `[@media(max-width:1119px)]:min-h-[4.3125rem]` dan
  `pointer-coarse:min-h-[4.3125rem]` (69px = 24 + 1 + 44) — **media yang sama persis** dengan
  aturan tombol 44px di `globals.css`, jadi tidak ada celah 1px. Hasil: tinggi baris judul
  identik di kedua panel di semua lebar; header Lembar kerja desktop tidak berubah (memang
  sudah 60px), hanya Lembar caption yang naik.

### 3. Kesejajaran baris label Kategori ↔ Tema (dan kotak isian di bawahnya)

- Masalah: di grid dua kolom (E.4) baris label **Kategori** punya tombol `Salin` (28px, 44px di
  sentuh) sedangkan **Tema untuk frame ini** hanya teks (labelnya bisa membungkus 2 baris) →
  tinggi baris label beda dan kotak isian sejajar hanya kebetulan.
- `src/components/CaptionSheet.tsx`: **`flex-1`** pada baris label komponen `Field`. Grid
  meregangkan kedua field ke tinggi baris yang sama, `flex-1` membagi sisa ruang → tinggi baris
  label kedua kolom selalu setara dan kotak isian keduanya berhenti di titik yang sama, berapa
  pun tinggi tombol/label. Pilihan ini di atas `min-h-7` tetap: angka tetap bocor untuk kasus
  sentuh (44px) dan label membungkus; field tunggal (container auto-height) tidak berubah.

### 4. Provider OpenRouter (cadangan keempat)

- `src/lib/types.ts`: `ProviderId` + **`openrouter`**; `src/lib/storage.ts`: kunci
  `stockmeta_openrouter_key` + `readProvider` menerima `openrouter`.
- `src/lib/providers/openrouter.ts` (**baru**): tes koneksi = `GET /api/v1/models` (Bearer,
  ringan, tanpa biaya token); generate = `POST /api/v1/chat/completions` dengan **model
  `openrouter/free`** (alias — OpenRouter sendiri memilih model vision gratis yang tersedia,
  tidak di-hardcode), `messages` identik Groq (prompt + `image_url` data URI) +
  `response_format:{type:'json_object'}`; bila ditolak (**400/422**) **diulangi sekali tanpa
  parameter itu** — hasil tetap dibersihkan `parseMetadataResponse`. Pesan error body
  `{"error":{"message":"…"}}` ATAU `{"error":"…"}` dibawa utuh; 401/403 → *Key salah…*,
  429 → kuota, 402 → kredit. Retry tetap lewat `withRetry`/`ProviderError`/`parseRetryAfter`
  (400/404 non-retryable, 429 sabar). Key tidak pernah masuk URL/log.
- `src/lib/providers/index.ts`: masuk registry. `src/hooks/useProvider.ts`:
  `PROVIDER_ORDER` = **Groq → Gemini → OpenRouter → Coming Soon**, `PROVIDER_LABELS` /
  `KEY_NOTES` / `TESTING_NOTES` ikut (`Memanggil endpoint OpenRouter…`).
- `src/components/ProviderPanel.tsx`: catatan khusus **OpenRouter** (free tier ±20 request/hari
  tanpa isi saldo — cadangan, bukan andalan; model vision gratis dipilih otomatis) tampil saat
  provider aktif; segmented control `grid-cols-3` → **`grid-cols-2`** (4 segmen; 4 kolom membuat
  "OpenRouter" meluber di layar 360px; ≥1120px tetap `inline-flex w-fit`).
- `README.md`: baris **OpenRouter** di tabel provider. `scripts/live-test.ts`: env
  `OPENROUTER_KEY`. `useBatch` tidak perlu diubah — `providerReady()` cukup `status === 'ok'`
  (model Groq/OpenRouter sudah pasti; deteksi model hanya untuk Gemini).

### 5. Auto-test API key tersimpan (boot & ganti provider)

- `src/hooks/useProvider.ts`: `test()` dipilah jadi **`runTest(provider, key)`** — satu jalur
  tes untuk tombol manual, boot, dan ganti provider; guard `testingRef` tetap (tak ada tes
  beruntun) dan `Coming Soon` tidak pernah dites.
  - **Boot**: key tersimpan langsung dites → status `Menguji…` → `Aktif`/`Gagal`
    (bukan `Belum dites` basi dari sesi lalu); tanpa key tersimpan → tetap `Belum dites`.
  - **`setProvider`**: provider tujuan **punya** key tersimpan → field diisi key itu
    (yang tampil = yang dites) + tes otomatis; **tidak punya** → isi field lama dipertahankan
    (legacy) dan status reset `Belum dites`.
  - Key **tetap hanya disimpan setelah tes lulus** (kontrak legacy); tes manual tetap bisa
    kapan saja dan hasilnya mengganti key tersimpan.
- Efek samping pada tes: harness lama (`useBatch`, `Worksheet`, `CaptionSheet`) membersihkan
  localStorage sebelum mount → auto-test tidak menyala, perilaku tes lama tidak berubah.

### 6. Tes & verifikasi M19

- `src/lib/providers/openrouter.test.ts` (**baru**, 7 tes): bentuk request tes/generate
  (Bearer, `openrouter/free`, data URI, `response_format`), fallback tanpa `response_format`
  pada 400 (dua panggilan, prompt identik), pesan error body utuh + 404 tanpa retry, respons
  non-JSON → pesan generik.
- `src/hooks/useProvider.test.ts` (**baru**, 9 tes): auto-test boot (`Menguji…` → `Aktif`
  dengan key & catatan benar), key mati → `Gagal`, tanpa key → tetap `Belum dites` tanpa
  panggilan, ganti provider (ada key → isi field + tes; tidak ada → field dipertahankan +
  reset), tes manual sesudah auto-test (key yang diketik yang dites & disimpan), Coming Soon
  tak pernah dites, urutan & label provider.
- **203/203 tes** (16 baru), `npx tsc --noEmit` 0 error, `npm run lint` 0 temuan,
  `npm run build` sukses; aturan CSS baru diverifikasi ikut ter-compile
  (`.min-h-15`, `@media (max-width:1119px){…min-h-[4.3125rem]}`, `@media (pointer:coarse){…}`).

## Perbaikan pasca-M19 (M20–M21) — bukan tahap migrasi baru

- **M20 — README diperbarui jadi format profesional GitHub, konten teknis tidak berubah.**
  `README.md` kini punya header + badge (shields.io), placeholder screenshot, tautan cepat,
  daftar isi dengan anchor, heading ber-emoji, serta bagian penutup **Lisensi** & **Dibuat
  dengan**; `LICENSE` (MIT) ditambahkan sesuai konfirmasi. Hanya `README.md` + `LICENSE` +
  catatan ini yang disentuh — `docs/DESIGN.md` tidak diubah.
- **M21 — screenshot aplikasi ditambahkan ke README (diambil otomatis via Playwright/CDP).**
  `docs/screenshot.png` (PNG 1440×900, mode gelap, halaman awal kosong tanpa upload/generate)
  diambil lewat Chrome headless + CDP (`Emulation.setDeviceMetricsOverride` +
  `Emulation.setEmulatedMedia` `prefers-color-scheme: dark`); badge indikator dev Next.js
  disembunyikan saat capture, lalu placeholder komentar README diganti
  `![Screenshot StockMeta](./docs/screenshot.png)`.

## Perbaikan pasca-M21 (M22) — footer baru, bukan tahap migrasi baru

- **M22 — Footer baru (`src/components/Footer.tsx`, dirender di `src/app/page.tsx`
  setelah `main`).** Struktur meniru RigForge (3 kolom desktop, stack 1 kolom mobile)
  dengan palet Phosphor yang sudah ada — tanpa warna/e2e/server baru: latar chrome
  `bg-bg-secondary`, garis atas tegas `border-t-2 border-accent`, kolom kiri brand
  `StockMeta` (`text-accent-text`) + tagline, kolom tengah disclaimer independen
  (tidak berafiliasi dengan Adobe/Shutterstock), kolom kanan catatan privasi
  (API key & gambar browser → provider langsung, tanpa analytics), baris bawah
  `border-t border-border` berisi `© 2026 StockMeta` + readout mono
  `diproses lokal di browser`. Tipografi ikut skala M16 (`text-title`/`text-small`/
  `text-meta` mono), spasi ikut skala (`gap-4`, `py-4`, `mt-4`/`pt-3`/`gap-2`/`gap-1`).

## Perbaikan pasca-M22 (M23) — disiplin skala mobile, bukan tahap migrasi baru

Eksekusi memakai skill **frontend-design**, audit memakai **impeccable** (mode Operate).
Aturan keras: **tanpa** perubahan logika (`src/lib`, hooks tidak disentuh), **tanpa**
perubahan tampilan desktop — seluruh perubahan hanya di bawah 640px (default
mobile-first), dengan varian `sm:`/`lg:`/`max-lg:`/`min-[1120px]:` mengembalikan nilai
desktop persis di ≥640px/≥1024px/≥1120px. Hasil: tinggi halaman awal di 375px turun
**2517 → 2229px (−288px)**, keterbacaan & target sentuh terjaga (blok `min-height:44px`
di `globals.css` tetap menjamin ≥40px; font isian tetap 16px anti auto-zoom iOS).

### 1. Toggle platform Header → segmented ringkas (mobile)

- `Header.tsx`: tombol segmen `text-body → text-small`, `px-3 → px-2`, `gap-1.5 → gap-1`
  (semua dengan `sm:` restore); wordmark `text-brand (20px) → text-title (16px)`,
  dot brand `14 → 12px`, baris atas `pt-3 → pt-2`, baris status `gap-1.5 → gap-1`,
  `pb/pt-2 → 1.5`. Tinggi sentuh visual tetap 44px lewat CSS, tapi bobot visual jauh
  turun (bukan lagi dua pil raksasa).

### 2. ProviderPanel → `<select>` native di <1024px, grid utuh di desktop

- Keputusan: **dropdown di bawah 1024px, grid segmented tetap di ≥1024px** — pola select
  sama seperti slot/kategori di Worksheet/CaptionSheet; grid 2×2 (4 segmen, ±2 baris
  × ±88px) yang makan ±190px vertikal diganti satu baris select `h-10`.
- Teknik: dua DOM dipilih per breakpoint — select `lg:hidden`, grid `max-lg:hidden`
  (bukan `hidden lg:grid`: `lg:grid` sempat **mengalahkan** `min-[1120px]:inline-flex`
  di cascade Tailwind v4 sehingga desktop jadi 2 baris — terdeteksi lewat audit
  computed-style, diperbaiki, lalu diverifikasi `inline-flex` + 1 baris kembali).
  Ambang `lg` (1024) dipilih supaya rentang 1024–1119px **identik** dengan semula.
- Select memakai gaya select standar aplikasi (`h-10`, `border-border-control`,
  panah SVG, `hover:border-accent/60`), opsi `Coming Soon` = `disabled`,
  `value`/`onChange`/`disabled`/`title` identik perilaku grid; label dipakai ulang
  (`<label for>` untuk select, `aria-labelledby` grid tetap menunjuk label yang sama).
- Tambahan mobile: tombol `Tes koneksi` `text-body → text-small`, `px-4 → px-3`;
  callout catatan `py-2.5 → py-2`; grup `gap-3 → gap-2`, `py-3 → py-2` (sm: restore).

### 3. Dropzone dirampingkan (mobile)

- `Worksheet.tsx`: `min-h-36 (144px) → min-h-28 (112px)`, `py-6 → py-4`, `px-5 → px-4`,
  `gap-3 → gap-2`; ikon `h-11 w-11 → h-8 w-8`, glyph `22 → 16px`; judul
  `text-body (14px) → text-small (13px)`; sub-format tetap `text-meta` (lantai 12px).
  Tetap jelas sebagai area klik (dashed `border-2` + ikon + 2 baris teks dipertahankan).

### 4. Kotak "belum ada frame" dirampingkan (mobile)

- `CaptionSheet.tsx`: `py-8 → py-4`, `px-4 → px-3`, `gap-2 → gap-1.5`; ikon
  `h-10 w-10 → h-8 w-8`, glyph `18 → 14px`; teks tetap `text-meta`. State kosong tetap
  terbaca tanpa memakan ruang layar berharga.

### 5. Disiplin ukuran mobile di semua komponen (audit impeccable)

| Area | Mobile (<640px) | Desktop (restore) |
| --- | --- | --- |
| Judul panel (`Panel h2`), brand footer | `text-title 16 → text-body 14` | `sm:text-title` / `sm:text-brand` untuk wordmark Header (20px) |
| Teks tombol (Generate, Batalkan, Buat ulang semua, Coba lagi, Mulai sesi baru, Tambah frame, Tes koneksi, Export CSV, Salin, Ya/timpa, konfirmasi) | `text-body 14 → text-small 13` | `sm:text-body` |
| Padding tombol | `px-4 → px-3`, `py-2 → py-1.5`, `p-3 → p-2` | `sm:` restore penuh |
| Body/padding panel, footer panel | `p-4 → p-3`, `px-4 py-3 → px-3 py-2` | `sm:` restore |
| Gap vertikal (root Worksheet, caption-body, grid tema/jeda, grid kategori, main, footer) | `gap-4 → gap-3`, `py-4 → py-3`, `mt-4 pt-3 → mt-3 pt-2` | `sm:` restore |
| Toggle detail caption, strip nama file | `px-3 py-2 → px-2 py-1.5`, `px-4 py-2 → px-3 py-1.5` (+ `mx/mt` negatif strip ikut `p-3` body) | `sm:` restore |
| Info tile (`px-3 py-2 → px-2 py-1.5`) | padding saja | `sm:` restore |

- **Sengaja tidak dikecilkan** (lantai keterbacaan/aksesibilitas): semua
  `input/select/textarea` (16px anti-zoom iOS via CSS), `text-meta` (label, counter,
  badge, chip status — sudah di lantai 12px), chip kata kunci, pesan hint/notice
  `text-small`, badge status `border-2` (tetap 2px sesuai skala M16).
- Semua nilai rapat tetap dalam skala spasi M16 {4, 6, 8, 12, 16, 24}px.

### 6. Verifikasi M23

- `npm run test` **222/222**, `npx tsc --noEmit` 0, `npm run lint` 0, `npm run build`
  sukses, `impeccable detect --json` atas 7 file UI → **`[]`** (exit 0).
- Bukti screenshot (full-page, mode gelap, state awal kosong):
  `docs/screenshots-mobile/before/` (`before-375/390/1440.png`) vs
  `docs/screenshots-mobile/after/` (`after-375/390/1440.png`) — diambil via Chrome
  headless + CDP (`Emulation.setDeviceMetricsOverride` + `captureBeyondViewport`).
- Desktop 1440px: tata letak identik (provider 1 baris inline-flex, dropzone 176px,
  semua computed-style terukur sama: h1 20px, tombol 14px, panel 16px, footer 16px);
  selisih tinggi total −16px berasal dari pembungkusan ulang teks (font swap),
  bukan perubahan kelas — seluruh nilai desktop di-restore eksplisit per tabel di atas.

## Perbaikan pasca-M23 (M24) — koreksi batas Adobe Stock, bukan tahap migrasi baru

Sumber: **contoh CSV resmi Adobe Stock yang diverifikasi langsung oleh user**
(header `Filename,Title,Keywords,Category,Releases`; Title "Up to 200 characters";
Keywords "Max 49 keywords, most important first") — bukan asumsi lagi. Koreksi atas
asumsi salah M9a (70 karakter + tanpa koma + maks 50 keywords).

| Sebelum (M9a, asumsi) | Sesudah (M24, contoh resmi) | File |
| --- | --- | --- |
| `MAX_TITLE_CSV = 70` | `MAX_TITLE_CSV = 200` | `src/lib/limits.ts` |
| — (satu batas 50 utk semua) | `MAX_KEYWORDS_ADOBE = 49` (Shutterstock tetap `MAX_KEYWORDS = 50`) | `src/lib/limits.ts` |
| Prompt Adobe: "maks 70 … TANPA koma" | "maks 200 karakter … (maksimal 49 kata, yang paling penting dulu)", tanpa larangan koma | `src/lib/prompt.ts` |
| Parser: `cleanAdobeTitle` ganti koma → spasi, potong 70; keyword cap 50 | `cleanAdobeTitle` hanya rapikan spasi (koma dipertahankan); judul mentah model dipotong 200; keyword cap 49 Adobe / 50 Shutterstock | `src/lib/prompt.ts`, `src/lib/metadata.ts` |
| Validasi: saran >70 + saran "mengandung koma"; keyword Adobe >50 | Saran >200; **saran koma dihapus**; keyword Adobe >49 | `src/lib/validate.ts` |
| Ekspor: judul dibersihkan dari koma | Koma dipertahankan (quoting `"` sudah benar); header & `Releases` kosong tak berubah | `src/lib/csv.ts` |
| UI: `n/70 · tanpa koma`, counter `n/50` utk Adobe | `n/200`, counter Adobe `n/49` (editor `max` per platform) | `CaptionSheet.tsx`, `KeywordEditor.tsx` (+ prop baru `max`) |
| README: "maks 70 … tanpa koma", "maksimal 50" (Adobe) | "maks 200 (koma aman)", "maksimal 49" (Adobe; Shutterstock tetap 50) | `README.md` |

- Bagian historis M9a/M11/M13/M18 di dokumen ini **sengaja tidak ditulis ulang** (catatan
  masa lalu); yang diperbarui ke keadaan kini: kontrak CSV di atas, catatan legacy, UI,
  README, dan tes (`prompt`/`validate`/`csv`/`metadata` + regresi `cleanAdobeTitle` baru +
  `CaptionSheet` `/200` & `/49`).
- Verifikasi: `npm run test` **223/223**, `npx tsc --noEmit` 0, `npm run lint` 0,
  `npm run build` sukses.

## Perbaikan pasca-M24 (M25) — audit overflow horizontal mobile, bukan tahap migrasi baru

Dugaan awal: M23 menyebabkan regresi overflow di 360–390px. Audit memakai **DevTools
responsif sungguhan** (Chrome headless + CDP `Emulation.setDeviceMetricsOverride`
dengan `mobile: true`, bukan asumsi dari kelas CSS): diukur
`document.documentElement.scrollWidth` & `document.body.scrollWidth` vs
`window.innerWidth`, plus pemindaian semua elemen yang `right`-nya melewati viewport
(kecuali isi scroll-container sengaja seperti baris chip status `overflow-x-auto`).

Hasil — **tidak ada overflow sama sekali** (dugaan regresi terbantahkan oleh data):

| Lebar | Keadaan | `innerWidth` | `scrollWidth` (doc/body) | Offender |
| --- | --- | --- | --- | --- |
| 360px | kosong (profil bersih) | 360 | 360 / 360 | 0 |
| 375px | kosong (profil bersih) | 375 | 375 / 375 | 0 |
| 390px | kosong (profil bersih) | 390 | 390 / 390 | 0 |
| 360px | **5 frame nama-sangat-panjang** (tile + strip caption + counter) | 360 | 360 / 360 | 0 |
| 375px | idem | 375 | 375 / 375 | 0 |
| 390px | idem | 390 | 390 / 390 | 0 |
| 360px | idem + platform **Shutterstock** (2 select kategori) | 360 | 360 / 360 | 0 |

- Pemeriksaan khusus terkonfirmasi aman: baris header "Lembar kerja"
  (judul + badge + `Mulai sesi baru`) memakai `flex-wrap` — tombol turun ke baris
  kedua, tidak dipaksa satu baris; baris breadcrumb `❯ …` menggulir di dalam
  container-nya sendiri (`overflow-x-auto` + `whitespace-nowrap`), tidak mendorong
  body; strip nama file memakai `truncate` (= `overflow:hidden` → minimum flex 0,
  menyusut benar); grid thumbnail `minmax(7.5rem,1fr)` muat 2 kolom di 336px isi.
- Karena nol offender, **tidak ada perubahan kode** di M25 — hanya bukti + catatan ini.
- Bukti screenshot: `docs/screenshots-mobile/after-m24/` (`after-360/375/390/1440.png`,
  profil bersih) + `seed-check.png` (360px, 5 frame nama panjang) +
  `seed-shutter-360.png` (Shutterstock). Desktop 1440px tidak berubah kecuali counter
  baru (`0/200`, `0/49`) yang memang disengaja oleh M24.

## Perbaikan pasca-M25 (M26) — hapus breadcrumb, ringkas fallback & label, bukan tahap migrasi baru

### 1. Baris status/breadcrumb di bawah Header dihapus seluruhnya

- `Header.tsx`: blok `❯ 00 FRAME / ADOBE STOCK / GROQ / ● BELUM DITES` (prompt + 4 chip
  + scroll horizontal) dibuang; header kini hanya baris brand + toggle platform.
  Konstanta `CHIP`/`STATUS_CHIP`/`STATUS_DOT`/`pad2` ikut dihapus; props
  `provider`/`status` dicabut dari `Header` (tidak dipakai komponen lain — tidak ada
  tes yang merender `Header`, URL di atas) dan `page.tsx` tidak lagi mengopernya;
  container atas diberi `pb-2 sm:pb-3` pengganti padding bawah yang hilang.
  Footer paling bawah **tetap ada, tidak disentuh**.

### 2. Checkbox fallback: teks dihapus, pindah ke samping label PROVIDER

- `ProviderPanel.tsx`: teks `Fallback antar provider saat kuota habis` dihapus dari UI;
  checkbox telanjang (`h-4 w-4`, tanpa teks) pindah ke satu baris dengan label
  `PROVIDER` (`PROVIDER ☐`). Satu baris label dipakai bersama select (mobile,
  `aria-labelledby`) & grid (desktop) — tanpa duplikasi DOM.
- Aksesibilitas: `aria-label="Fallback antar provider saat kuota habis"` pada input +
  `title` pada label berisi fungsi + limit ringkas per provider
  (`LIMIT_TIP`: Groq 8.000 token/menit · Gemini Flash-Lite longgar/429 harian →
  besok · OpenRouter ±20 request/hari); pesan hasil tes terakhir pindah ke
  `title` badge status. Area sentuh diperlebar tak terlihat (`p-1.5` − `my-1.5`,
  tanpa geser layout). Fungsi toggle (localStorage `readFallback`/`writeFallback`) tak berubah.

### 3. Label "TEMA UNTUK FRAME INI (OPSIONAL)" → "TEMA UNTUK FRAME INI"

- `CaptionSheet.tsx` (+ penyesuaian asersi `CaptionSheet.test.ts`): hanya teks label;
  field tetap opsional secara fungsi.

### 4. Berkas sampah: `src/components/LabelRow.tsx` dihapus

- Audit seluruh repo (di luar `node_modules`/`.next`): **nol** file `.log`/`.bak`/
  `.tmp`/`*~`, **nol** skrip `.mjs`/`.cjs` di luar `src/`+`scripts/` (helper CDP hanya
  di direktori temp OS), **nol** nama `copy`/`old`/`temp`/`backup`; semua file `src/`
  terimpor/aktif kecuali satu: `LabelRow.tsx` (baris label generik sisa refactor —
  `Field`/`KeywordEditor` tidak pernah memakainya; grep hanya menemukan definisi +
  sebutan di README) → **dihapus**, dan daftar struktur folder di `README.md`
  diperbarui. `scripts/live-test.ts`, `docs/` (termasuk seluruh
  `docs/screenshots-mobile/` yang dirujuk bagian M23/M25/M26 ini), konfigurasi resmi,
  `Footer.tsx`, dan `tsconfig.tsbuildinfo` (cache compiler) **dipertahankan**.

### 5. Verifikasi M26

- `npm run test` **223/223**, `npx tsc --noEmit` 0, `npm run lint` 0, `npm run build`
  sukses. Overflow ulang 360/375/390: `scrollWidth == innerWidth`, 0 offender.
- Bukti screenshot: `docs/screenshots-mobile/m26-before/` vs `m26-after/`
  (`before/after-375/390/1440.png`, profil ber-frame agar tombol wrap & strip
  terlihat). Tinggi halaman 375px **2883 → 2541px (−342px)**.

## Perbaikan pasca-M26 (M27) — audit responsif menyeluruh 9 lebar × 2 mode, bukan tahap migrasi baru

Tanpa e2e Playwright; verifikasi via Chrome headless + CDP sungguhan
(`Emulation.setDeviceMetricsOverride` + `mobile`, `setEmulatedMedia`
`prefers-color-scheme`, `getBoundingClientRect`): `scrollWidth` vs `innerWidth`,
pemindaian elemen `right > viewport`, inventaris `nowrap`/flex-baris-tanpa-wrap,
rect semua target sentuh, dan `font-size` semua teks — di 360/375/390/414/768/1024/
1120/1440/1920px × terang/gelap, keadaan kosong + ber-frame (seed 3 frame, 49 keyword,
nama-sangat-panjang).

### Tahap 1 — temuan (before)

Overflow: **NOL di semua 18 kombinasi** (`scrollWidth == innerWidth` di mobile;
di desktop `== innerWidth − 10`, yaitu lebar scrollbar vertikal — normal, 0 offender).
`nowrap` baris-asli (>2 item, arah-row): **NOL** — yang terdeteksi hanya `flex-col`
(arah kolom, tidak bisa overflow horizontal) dan grid tersegmentasi by-design.
Font <12px untuk teks bermakna: **NOL** (lantai `text-meta` 12px via clamp terbukti).

| Temuan sentuh <40px di <640px | Ukuran terukur | Keputusan Tahap 2 |
| --- | --- | --- |
| `ThemeToggle` (`h-9 w-9`) | 36×44 (lebar <40; tinggi diselamatkan CSS) | **Diperbaiki**: `h-10 w-10 sm:h-9 sm:w-9` → 40×44 mobile, 36×36 desktop tetap |
| Checkbox fallback (`h-4 w-4`, label `p-1.5`) | glyph 16×44, hit label ±28×44 | **Diperbaiki**: label `p-3 -m-3` + input `min-h-4!` → hit **40×40**, baris 17px, glyph tak bergeser |
| `Mulai sesi baru` (29.5px, `btn-compact` + `before:-inset-1.5`) | hit efektif ±41.5 | By-design, dipertahankan (pola pseudo-area resmi) |
| Ikon tile 28px / hapus chip 20px (`btn-compact` + pseudo) | hit efektif 40 / 44 | By-design, dipertahankan |
| Temuan saat audit: input checkbox ikut kena `min-height:44px` global → baris label sempat membengkak 17→44px | — | `min-h-4!` (Tailwind important) mengalahkan aturan global khusus di sini; hit 40×40 sudah dijamin label |

### Tahap 3 — verifikasi (after, berdampingan dengan before)

| Lebar | Mode | Before `SW==VW` | After `SW==VW` | Touch <640 | Font <12px |
| --- | --- | --- | --- | --- | --- |
| 360px | gelap/terang | 360==360 ✓ | 360==360 ✓ | toggle 40×44 ✓, fallback 40×40 ✓, sisa pseudo ✓ | nihil |
| 375px | gelap/terang | 375==375 ✓ | 375==375 ✓ | sama ✓ | nihil |
| 390px | gelap/terang | 390==390 ✓ | 390==390 ✓ | sama ✓ | nihil |
| 414px | gelap/terang | 414==414 ✓ | 414==414 ✓ | sama ✓ | nihil |
| 768px | gelap/terang | 758 (scrollbar) ✓ | 758 ✓ | n/a (≥640) | nihil |
| 1024px | gelap/terang | 1014 (scrollbar) ✓ | 1014 ✓ | n/a | nihil |
| 1120px | gelap/terang | 1110 (scrollbar) ✓ | 1110 ✓ | n/a | nihil |
| 1440px | gelap/terang | 1430 (scrollbar) ✓ | 1430 ✓ | n/a | nihil |
| 1920px | gelap/terang | 1910 (scrollbar) ✓ | 1910 ✓ | n/a | nihil |

- Scorecard desktop 1440px **identik**: header 1440×65, worksheet 797×437, kolom
  caption 569×579, h1 20px, segmen 14px, judul panel 16px, dropzone 176px,
  generate 44px/14px, toggle 36×36. `min-[1120px]:grid-cols-5` dan clearance ikon
  M15b **tidak disentuh** (tanpa overflow di desktop → tanpa alasan mengubah).
- Interaksi kunci **7/7 lolos** di 390px-gelap DAN 1440px-gelap: klik generate saat
  disabled = no-op; upload via input → 1 tile + caption aktif; toggle platform ⇄;
  ganti provider via select (persist `stockmeta_provider`); tes koneksi (fetch
  di-stub) → `Aktif`; generate → `Batch selesai — 1 siap · 0 gagal` + badge SIAP;
  scroll kotak 49 keyword (`scrollHeight > clientHeight`, `scrollTop` bergerak).
- Masalah tersisa eksplisit (bukan temuan baru, di luar cakupan): toggle tema 36px
  di 640–1119px dan tombol compact <40px di desktop ≥1120 (konteks mouse, by-design);
  jalur generate-akti diuji dengan fetch stub (tanpa API key asli).
- Verifikasi: `npm run test` **223/223**, `npx tsc --noEmit` 0, `npm run lint` 0,
  `npm run build` sukses. Berkas diubah: `ThemeToggle.tsx`, `ProviderPanel.tsx`
  (logika `src/lib`/hooks **tidak disentuh**).

<<<<<<< HEAD
=======
## Perbaikan pasca-M27 (M28) — koreksi FINAL batas deskripsi Shutterstock, bukan tahap migrasi baru

Sumber: **SCREENSHOT LANGSUNG dari form upload Shutterstock sungguhan** (sumber paling
akurat — mengalahkan semua artikel web): field Description bertuliskan
**maksimal 2048 karakter, minimal 5 kata**.

> **JANGAN ubah angka ini lagi tanpa bukti sekuat screenshot form asli.**
> Riwayat salah: batas deskripsi Shutterstock sempat salah **2 kali** — awalnya memakai
> **200** (M11 bonus "±200 karakter", M13 penghitung `n/200`, M18 `n/200` di baris label),
> lalu sempat disebut **150** (komentar lama `validate.ts` soal "editor Portfolio") —
> **keduanya SALAH** dan kini dikoreksi total ke **2048**. (Angka 70 yang kadang
> disebut-sebut adalah batas *judul Adobe*, bukan deskripsi Shutterstock — jangan
> dicampuradukkan.)

| Sebelum (salah) | Sesudah (M28, screenshot form asli) | File |
| --- | --- | --- |
| `MAX_DESCRIPTION = 200` | `MAX_DESCRIPTION = 2048` | `src/lib/limits.ts` |
| Prompt: "minimal 5 kata dan maksimal sekitar 200 karakter" | "satu-dua kalimat deskriptif alami minimal 5 kata dan maksimal 2048 karakter (BUKAN daftar kata — jangan bertele-tele/spam hanya karena batasnya longgar)" | `src/lib/prompt.ts` |
| Parser: deskripsi mentah model dipotong `slice(0, 500)` | dipotong `slice(0, MAX_DESCRIPTION)` (= 2048) | `src/lib/prompt.ts` |
| Komentar "ambang 200 … editor 150 … penanda praktis" | komentar M28: 2048 dari screenshot, 200/150 salah | `src/lib/validate.ts` |
| UI: penghitung `n/200`, hint "Tulis kalimat deskriptif utuh …" | penghitung `n/2048`, **tanpa** hint statis (minimal 5 kata tetap divalidasi via "Saran perbaikan"); label "Kategori tambahan (opsional)" → "Kategori tambahan" | `src/components/CaptionSheet.tsx` |
| Tes: `/200`, `> 200 karakter` (string pendek `repeat(6)`) | `/2048`, `> 2048 karakter` (string `repeat(40)` agar benar-benar > 2048), + regresi parser 2048 & saran min-5-kata tanpa hint | `prompt.test.ts`, `validate.test.ts`, `CaptionSheet.test.ts` |

- Validasi minimal **5 KATA** (dihitung per kata via `countWords`, bukan karakter) tidak
  berubah — tetap saran non-pemblokir, terpisah dari batas maksimal karakter.
- Bagian historis M11/M13/M18 di dokumen ini **sengaja tidak ditulis ulang** (catatan
  masa lalu); yang berlaku kini hanya angka M28 ini + kontrak CaptionSheet di bawah.
- Verifikasi: `npm run test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — lolos.

## Perbaikan pasca-M28 (M29) — Mode Analisis, bukan tahap migrasi baru

> **Catatan penomoran**: brief awal meminta label "M28 — Mode Analisis", tetapi M28 sudah
> dipakai koreksi 2048 di atas — fitur ini dicatat sebagai **M29** agar tidak tabrakan.

Fitur besar pertama di luar migrasi: **Mode Analisis** berdampingan dengan **Mode Metadata**.
Aturan keras: **logika Mode Metadata tidak berubah** — upload, generate, edit, salin,
export CSV berfungsi identik saat mode metadata aktif; M29 hanya MENAMBAH.

- **Alur**: Analisis dulu (Mode Analisis → `Jalankan Analisis`) → baru generate metadata
  (Mode Metadata → `Buat metadata`). Generate metadata BARU digerbang: frame yang
  `analysisStatus` platform aktifnya bukan `siap` DILEWATI dengan pesan
  `Jalankan Analisis dulu di Mode Analisis` (status metadata jadi `gagal` + pesan itu,
  isi slot TIDAK diubah). Data lama tetap boleh diedit manual — gerbang hanya berlaku
  saat MEMULAI generate, bukan mengunci data yang sudah ada.
- **Mode** (`AppMode = 'analisis' | 'metadata'`, default metadata) disimpan page.tsx,
  persist `localStorage` kunci `stockmeta_mode` (`readMode`/`writeMode` di `storage.ts`).

| Baru / ubah | Isi | File |
| --- | --- | --- |
| Tipe: `AppMode`, `AnalysisVerdict` (`layak`/`berpotensi-ditolak`/`perlu-tinjau`), `AnalysisIssueCategory` (8 kategori), `AnalysisIssue`, `AnalysisResult`, `Frame.analysis` / `analysisStatus` / `analysisError` (slot per platform, opsional — sesi lama tetap terbaca) | `src/lib/types.ts` |
| `buildAnalysisPrompt({platform})` — AI sebagai REVIEWER kelayakan upload (kriteria: kualitas teknis, konten generik→`perlu-tinjau`, watermark/logo/merek, properti/model-release disebut eksplisit, komposisi, nilai komersial; larangan mengarang masalah) + `parseAnalysisResponse` (fence-strip, verdict/kategori tak dikenal → error kind `json` supaya di-retry) | `src/lib/analysisPrompt.ts` (**baru**) |
| `ProviderAdapter.analyzeImage` + `AnalyzeArgs` (tanpa theme; `model?` diterima tapi diabaikan — satu model per provider) | `src/lib/providers/types.ts` |
| HTTP tidak diduplikasi: tiap provider mengekstrak helper `postChat` internal (endpoint/retry/error mapping identik), `generateForImage` & `analyzeImage` hanya beda prompt + parser | `gemini.ts`, `groq.ts`, `openrouter.ts` |
| `analyzeWithFallback` — mesin fallback generik yang sama (`withFallback<T>`) | `src/lib/providers/fallback.ts` |
| `runBatch<T = ParsedMetadata>` generik (jalur metadata memakai default → perilaku identik) | `src/lib/batch.ts` |
| `applyAnalysis` / `failAnalysis` (cermin `applyGenerated`/`failFrame`) | `src/hooks/useSession.ts` |
| `useAnalysisBatch` (**baru**, cermin `useBatch`): `startAnalysis` (hanya analysisStatus menunggu/gagal), jeda via `readBatchDelay`, retry sabar, progress, cancel, `regenerateAnalysisFrame` + konfirmasi | `src/hooks/useAnalysisBatch.ts` |
| Gerbang di `startBatch`/`regenerateAll`/`regenerateFrame` (`NEED_ANALYSIS_MSG`) | `src/hooks/useBatch.ts` |
| `ModeToggle` (**baru**, segmented Analisis/Metadata segaya toggle platform, di Header, terkunci saat batch jalan) | `src/components/ModeToggle.tsx` |
| `AnalysisPanel` (**baru**, pengganti CaptionSheet saat mode analisis): badge verdict besar (warna + ikon + teks, tak hanya warna), daftar issues (label kategori Indonesia + deskripsi), ringkasan, state `Belum dianalisis`/gagal/kosong; `id="lembar-caption"` dipertahankan supaya scroll mobile dari tile tetap tiba | `src/components/AnalysisPanel.tsx` |
| Prop opsional `mode` (default metadata) + `analysis`; tombol utama `Jalankan Analisis` vs `Buat metadata`; tile & progress & coba-lagi mengikuti status mode aktif; blok `Buat ulang semua` khusus metadata; guard struktural mengunci bila batch mana pun berjalan | `src/components/Worksheet.tsx` |
| Prop `mode`/`onModeChange` + `ModeToggle` berdampingan toggle platform; `busy` = batch mana pun | `src/components/Header.tsx` |
| Render kondisional (satu panel kanan saja) + instance `useAnalysisBatch` | `src/app/page.tsx` |
| Persist `stockmeta_mode`; `coerceFrame` membawa slot analisis (rusak → dibuang, `memproses` → `menunggu`) | `src/lib/storage.ts` |
| Tes: `analysisPrompt` (9), `AnalysisPanel` (8), `useAnalysisBatch` (6), `WorksheetAnalysis` (4), gerbang `useBatch` (5), `useSession` analisis (3), `storage` mode + coerce (4), `analyzeWithFallback` (2), `groq.analyzeImage` (1); fake adapter 4 file tes dilengkapi `analyzeImage`; `blank()` `useBatch`/`Worksheet` diset analysis-siap supaya alur metadata lama teruji identik | `*.test.ts` |

- Bagian historis M1–M28 di dokumen ini **sengaja tidak ditulis ulang**.
- Verifikasi: `npm run test` **265/265**, `npx tsc --noEmit` 0, `npm run lint` 0,
  `npm run build` sukses. Bukti screenshot: `docs/screenshots-m29/mode-analisis.png` &
  `mode-metadata.png` (halaman awal kosong, mode gelap).

## Perbaikan pasca-M29 (M30) — prompt metadata jujur soal batas, bukan tahap migrasi baru

Audit menemukan teks prompt metadata (`buildMetadataPrompt`) masih menyuruh model hal yang
sudah tidak benar sejak M24/M28, sementara dua tes `prompt.test.ts` (yang menulis spek
M24/M28 dengan benar) gagal — **kodenya yang basi, bukan tesnya**, jadi yang diperbaiki
adalah prompt, bukan ekspektasi tes. Verifikasi akhir: `npm run test` **268/268**,
`npx tsc --noEmit` 0, `npm run lint` 0, `npm run build` sukses.

- `src/lib/prompt.ts` (`parseMetadataResponse`): potong judul non-Adobe `slice(0, 200)`
  literal → **`slice(0, MAX_TITLE_CSV)`** (nilai sama 200, angka kini tunggal di `limits.ts`;
  `MAX_TITLE_CSV` memang sudah diimpor).
- `src/lib/prompt.ts` (`buildMetadataPrompt`, Adobe): instruksi `TANPA koma (ganti koma
  dengan kata sambung atau spasi)` **dihapus** — koma aman sejak M24 (CSV di-quote di
  `csv.ts`/`metadata.ts`). Penggantinya: `koma dibiarkan (JANGAN dihapus atau diganti)`,
  batas `maks 200 karakter` tetap disebut via `MAX_TITLE_CSV`.
- Prompt kini menyampaikan batas asli ke model (ini yang meloloskan 2 tes lama tanpa
  mengubah tesnya): Adobe `keywords ... (maksimal 49 kata, yang paling penting dulu)`;
  Shutterstock `satu-dua kalimat deskriptif ... maksimal 2048 karakter` (kata "sekitar"
  yang tidak akurat dibuang — parser/validator memakai 2048 eksak).
- Koreksi tabel M29: `AnalysisIssueCategory` kini **9 kategori** (tambah
  `ai-generated-disclosure` + kebijakan AI per platform di `buildAnalysisPrompt` —
  Adobe menerima-dengan-disclosure, Shutterstock menolak tegas). Perubahan itu masuk
  bersama perbaikan prompt analisis sebelumnya dan belum tercatat di bagian M29.

## Kontrak perilaku (WAJIB sama dengan legacy)

Sumber: `legacy/docs/PROGRESS.md` + `legacy/js/*.js`. Tanda **[BARU]** = perilaku baru yang
belum ada di legacy (atau berubah dari legacy) — legacy tetap jadi acuan untuk hal lain.

### Upload & frame

- Upload **JPG / PNG / WEBP** (dropzone + tombol pilih file), **maksimal 20 frame** per batch
  **[BARU: M6 sempat mematok 10; M15 mengembalikan 20 — sama dengan legacy]** — batch penuh →
  frame dilewati + pesan.
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

- **[M14] Lembar tidak pernah kosong**: struktur field (Judul/Deskripsi, Kata kunci, Kategori,
  Tema untuk frame ini, Saran bila relevan, footer Export CSV) **selalu dirender**; belum ada
  frame terpilih → semua `disabled` + placeholder tetap tampil, tombol salin per field mati,
  header `Frame -- / --`. Kotak kosong "Belum ada frame dipilih" (M13) **tidak ada lagi**;
  frame terpilih otomatis setelah upload pertama. Export CSV memakai `aria-disabled` + `title`
  (alasan: belum ada frame / belum ada metadata) + guard klik.
- Field editable (ikut platform), **tombol salin per field** (feedback `Disalin`, reset 1.4s).
- Keyword sebagai **chip** + input; salin daftar (dipisah koma) lewat **satu tombol salin di
  samping label `Kata kunci`** **[M12: kotak teks `KEYWORDS (SIAP TEMPEL)`/cerminan dihapus]**.
  **[M13 → M18]** penghitung `0/50` + badge `min N`/`penuh` **sebaris dengan label
  `Kata kunci`** (grup `#kw-count` di kiri tombol salin; posisi lama M13 di dalam kotak dan
  ruang cadangan `pr-24` dihapus, input kini `aria-describedby="kw-count"`), dan daftar chip
  dibatasi **`max-height` 200px + scroll** — satu-satunya scroll internal di aplikasi
  (pengecualian terdokumentasi M13).
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
  **[M13 → M18]** petunjuk batas + penghitung judul kini **sebaris dengan label `Judul`
  (di atas textarea)** — bukan di dalam kotak (M13) dan bukan baris terpisah (M9a); deskripsi
  punya penghitung `n/2048` di baris label `Deskripsi` **[M28]** tanpa hint statis
  (minimal 5 kata tetap divalidasi via "Saran perbaikan"). Baris label memakai `flex-wrap`:
  label kiri, keterangan + `Salin` kanan, dan grup kanan turun ke baris kedua yang tetap
  rata kanan bila layar sempit.
- Footer **`N baris punya saran perbaikan`** **[M9a]**: jumlah frame (baris) yang punya saran
  untuk platform aktif — tampil di dekat tombol `Export CSV` bila > 0, **tidak memblokir
  ekspor**. Footer **`N baris`** = jumlah baris yang **benar-benar diekspor** (slot berisi),
  bukan jumlah frame **[audit F2]**.

### Mode Analisis [M29 — BARU, di luar legacy]

- **Sakelar mode** di Header (`ModeToggle`: segmented `Analisis | Metadata`, segaya toggle
  platform, terkunci saat batch berjalan), persist `stockmeta_mode`, default `metadata`.
- **Mode Analisis**: Worksheet tombol utama `Jalankan Analisis` (batch: hanya analysisStatus
  menunggu/gagal, jeda/retry/progress/batal sama seperti metadata; ikon tile
  `Analisis ulang untuk <nama>` + konfirmasi `Jalankan analisis ulang?`; `Buat ulang semua`
  disembunyikan); panel kanan = `AnalysisPanel` (badge verdict warna+ikon+teks, issues +
  ringkasan, state `Belum dianalisis`/gagal/kosong).
- **Mode Metadata** (perilaku lama identik): tombol `Buat metadata`/`Buat ulang semua`/ikon
  `Buat ulang metadata` tidak berubah — **kecuali gerbang**: generate BARU hanya untuk frame
  yang analysisStatus-nya `siap` (`Jalankan Analisis dulu di Mode Analisis` bila belum);
  edit manual & data lama tidak dikunci.
- Hasil + status + error analisis tersimpan **per platform** (`analysis`/`analysisStatus`/
  `analysisError`), slot metadata tidak tersentuh batch analisis dan sebaliknya.

### CSV

- Export **sesuai template resmi per platform** **[BARU — M9a, spesifikasi resmi, bukan legacy]**.
  Sumber: dokumentasi kontributor resmi Adobe Stock dan Shutterstock (template/aturan impor CSV).
  **Impor CSV nyata ke portal masing-masing masih perlu uji manual** — verifikasi dengan impor
  CSV uji sebelum dipakai produksi.
  - **Adobe Stock** — header **persis** `Filename,Title,Keywords,Category,Releases`:
    `Filename` maks **30 karakter** (termasuk ekstensi); `Title` maks **200 karakter**
    **[M24: koreksi dari 70]** dan **boleh berkoma** (setiap sel di-quote `"`, koma aman —
    tidak ada lagi pembersihan koma saat ekspor; judul **tidak dipotong diam-diam** —
    kelebihan jadi saran); `Keywords` satu sel bertanda kutip dipisah koma (urut relevansi,
    **maks 49, yang paling penting dulu** **[M24: koreksi dari 50]**); `Category` = **nomor**
    kategori (`ADOBE_CATEGORY_IDS`, 1–21; kosong bila belum dipilih); `Releases` selalu
    kosong (fitur releases/model release di luar cakupan tools ini).
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
- Prompt & parser judul Adobe (M9a, **dikoreksi M24 — lihat di bawah**): **maks 70 karakter
  dan tanpa koma** (asumsi spesifikasi CSV resmi Adobe saat itu) menggantikan batas legacy
  200 — **tes prompt yang dibandingkan persis dengan legacy sengaja diperbarui**; parser
  merapikan koma → spasi lalu memotong di 70, ekspor CSV hanya merapikan koma tanpa
  memotong (kelebihan dikasih tahu lewat saran validasi).
- Koreksi batas Adobe (M24): contoh CSV resmi Adobe Stock yang **diverifikasi langsung oleh
  user** menyatakan Title "Up to 200 characters" dan Keywords "Max 49 keywords, most
  important first" — angka M9a (70 + tanpa koma, maks 50) ternyata asumsi salah. Sejak M24:
  `MAX_TITLE_CSV = 200`, `MAX_KEYWORDS_ADOBE = 49` (Shutterstock tetap 50); koma judul
  dipertahankan di prompt, parser (`cleanAdobeTitle` tinggal merapikan spasi), ekspor CSV
  (quoting sudah benar), dan validasi (saran koma dihapus); parser memotong judul mentah
  model di 200; UI (`n/200`, `n/49`, tanpa "tanpa koma") + README + tes ikut diperbarui.
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
- Keterangan bantu (M13 → **sebagian dibatalkan oleh M18**): hint batas & penghitung karakter
  sempat **menempel di dalam kotak isian** (pojok kanan bawah); sejak **M18** penghitung
  **sebaris dengan label di atas kotak**, hanya petunjuk instruksional yang tetap di bawah
  kotak agar kolom isian tidak kehilangan ruang teks.
- Keterangan baris (M14): tiga hint di bawah field (`Tema utama`, `Jeda antar foto`,
  `Tema untuk frame ini`) dihapus — labelnya sudah menjelaskan; hanya petunjuk instruksional
  Deskripsi Shutterstock yang tersisa.
- Layout tinggi (M14): M11–M13 membiarkan kedua kolom beda tinggi → kini **≥1024px kedua panel
  disamakan tingginya** (`lg:items-stretch` + body Panel `grow`); tetap satu dokumen yang
  menggulir, tanpa scroll internal.
- Keadaan awal (M14): lembar caption **tidak pernah menampilkan kotak kosong** — field lengkap
  nonaktif menunggu frame terpilih (legacy menampilkan panel caption kosong/default).
- Satuan (M14): lima nilai piksel tetap pada elemen struktural diganti rem (grid `9.375rem`,
  popover `2.625rem`, batas chip `12.5rem`, radius panel `0.875rem`, radius dot `0.1875rem`);
  ukuran font tetap px sebagai skala tipografi yang disengaja.
