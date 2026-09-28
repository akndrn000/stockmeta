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

- Dropdown: **Gemini**, **Groq**, **Coming Soon** (nonaktif: field key + tombol Test disabled,
  Generate tetap mati, catatan `Provider tambahan akan segera hadir`).
- **Tes koneksi wajib lulus sebelum API key disimpan** ke `localStorage` (kunci
  `stockmeta_gemini_key` / `stockmeta_groq_key`); key di-restore saat pindah provider tapi status
  sengaja reset ke `Belum dites` (harus tes ulang).
- **Gemini**: model **auto-detect** dari `GET /v1beta/models` (preferensi flash terbaru), bukan
  hardcode; key salah dilaporkan Gemini sebagai HTTP 400 `API_KEY_INVALID` — jangan cek 401 saja.
- **Groq**: model tunggal **`qwen/qwen3.8-27b`**, **tanpa fallback**; pesan error body dibawa utuh
  ke UI.
- API key **hanya di browser** (localStorage), **tidak pernah dikirim ke server** — semua panggilan
  dari `fetch` di client.

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
  Levenshtein 45%).
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
  `menunggu`/`gagal`); otomatis hilang begitu tak ada frame gagal.

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
