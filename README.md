<div align="center">

<img src="./docs/banner.svg" alt="StockMeta" width="100%">

<br>

[![Demo](https://img.shields.io/badge/demo-live-2ea44f?style=flat-square)](https://stockmeta-phi.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/tested_with-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square)](./LICENSE)

**[Demo Live](https://stockmeta-phi.vercel.app) · [Fitur](#fitur) · [Cara Pakai](#cara-pakai) · [Mode Analisis](#mode-analisis) · [Provider AI](#provider-ai) · [Format CSV](#format-csv) · [Keamanan](#keamanan-dan-privasi) · [FAQ](#faq) · [Laporkan Bug](https://github.com/akndrn000/stockmeta/issues)**

<br>

<a href="https://stockmeta-phi.vercel.app">
  <img src="./docs/hero.png" alt="StockMeta: Mode Analisis, Mode Metadata (gelap dan terang), dan tampilan ponsel" width="100%">
</a>

<br>

**2** mode &nbsp;·&nbsp; **3** provider AI &nbsp;·&nbsp; **2** platform stok &nbsp;·&nbsp; **20** frame per batch &nbsp;·&nbsp; **0** server perantara

<sub>Gambar, hasil analisis, dan metadata pada tangkapan layar adalah data contoh untuk ilustrasi.</sub>

</div>

<br>

## Tentang StockMeta

Kontributor foto stok perlu memastikan fotonya layak diterima, lalu menyiapkan judul, kata kunci, dan kategori yang sesuai aturan tiap portal. StockMeta mengerjakan keduanya secara batch langsung di browser, lewat dua mode:

- **Mode Analisis** menilai kelayakan upload tiap foto.
- **Mode Metadata** menulis judul atau deskripsi, kata kunci, dan kategori, lalu mengekspornya sebagai **CSV** siap impor untuk **Adobe Stock** atau **Shutterstock**.

API key milikmu (Groq, Gemini, atau OpenRouter) dikirim dari browser langsung ke provider, tanpa server perantara.

```mermaid
flowchart LR
    A([Upload foto]) --> B[Mode Analisis<br/>cek kelayakan upload]
    B --> C[Mode Metadata<br/>judul, kata kunci, kategori]
    C --> D[Edit manual<br/>+ saran validasi]
    D --> E([Export CSV<br/>Adobe Stock / Shutterstock])
```

## Fitur

| | |
| --- | --- |
| **Batch sampai 20 frame** | Upload JPG, PNG, atau WEBP lewat drag-drop atau tombol pilih file. |
| **Mode Analisis** | AI berperan sebagai reviewer stok dan menilai tiap foto: Layak, Berpotensi ditolak, atau Perlu tinjau, lengkap dengan daftar masalah. |
| **Dua platform** | Adobe Stock dan Shutterstock dalam satu sesi. Hasil tersimpan per platform, jadi berganti platform tidak menghilangkan pekerjaan. |
| **Batch yang tangguh** | Berurutan, bisa dibatalkan, retry otomatis saat kena limit, dengan status per frame (menunggu, memproses, siap, gagal). |
| **Fallback antar provider** | Saat kuota harian habis atau terjadi `503` setelah retry habis, frame dialihkan ke provider lain yang key-nya tersimpan. Bisa dimatikan. |
| **Edit manual** | Judul atau deskripsi, kata kunci berbentuk chip, kategori resmi, tema per foto, dan saran perbaikan yang tidak memblokir. |
| **Ekspor CSV** | Mengikuti template resmi portal, atau salin per field dengan satu klik. |
| **Jeda antar foto** | Dapat diatur 3, 6, 12, atau 20 detik (default 6) untuk menghindari limit. |
| **Nyaman dipakai** | Mode siang/malam (mengikuti sistem, bisa di-override) dan sesi tersimpan otomatis di browser. |

## Cara Pakai

1. **Upload** foto ke *Lembar kerja* (drag-drop atau klik area upload).
2. **Pilih platform**, Adobe Stock atau Shutterstock, di header.
3. **Pilih provider** (Groq sebagai default, atau Gemini/OpenRouter) lalu **tempel API key**.
4. Klik **Tes koneksi**. Key hanya disimpan kalau tes lulus, dan key yang tersimpan dites ulang otomatis saat halaman dimuat ulang.
5. Buka **Mode Analisis**, lalu klik **Jalankan Analisis**. Hasil tiap foto tampil di panel *Hasil analisis*.
6. Pindah ke **Mode Metadata**, isi **tema batch** (opsional, misalnya `Halloween`), lalu klik **Buat metadata**. Progres tampil per frame dan bisa **Batalkan** kapan saja.
7. **Edit** hasilnya di *Lembar caption*.
8. **Salin** per field, atau klik **Export CSV** untuk mengunduh file.

> [!NOTE]
> Pembuatan metadata **digerbang oleh analisis**. Frame yang belum dianalisis pada platform aktif dilewati dengan pesan *"Jalankan Analisis dulu di Mode Analisis"*. Gerbang ini hanya berlaku saat memulai pembuatan; data yang sudah ada tetap bisa diedit manual.

> [!TIP]
> Bila sering muncul **"Menunggu limit reset"**, naikkan **Jeda antar foto** (pilihan 3, 6, 12, atau 20 detik; default 6). Frame yang tetap gagal bisa diproses ulang lewat tombol **Coba lagi frame gagal**.

## Mode Analisis

Mode ini berperan berlawanan dengan Mode Metadata: AI menjadi **reviewer stok** yang hanya menilai, tanpa membuat judul, deskripsi, atau kata kunci. Prompt dan parser ada di `src/lib/analysisPrompt.ts`.

| Verdict | Arti |
| --- | --- |
| **Layak** | Tidak ada masalah yang terlihat pada gambar. |
| **Berpotensi ditolak** | Ada masalah yang jelas terlihat dan berisiko membuat foto ditolak. |
| **Perlu tinjau** | Ada hal yang perlu diperiksa manusia, misalnya kemiripan dengan konten lain. |

Setiap masalah dikelompokkan ke salah satu dari delapan kategori: kualitas gambar, konten serupa, watermark/logo, hak cipta/merek, properti/model release, komposisi, nilai komersial, dan lainnya.

- Penilaian hanya berdasarkan apa yang **terlihat di gambar**. AI diminta tidak mengarang masalah, dan verdict ditampilkan dengan warna, ikon, dan teks sekaligus.
- Hasil tersimpan **per platform**, jadi analisis Adobe Stock tidak menimpa analisis Shutterstock.
- Analisis memakai provider, jeda antar foto, retry, dan fallback yang sama dengan Mode Metadata. Tiap foto bisa dianalisis ulang lewat tombol ulang di tile.
- Mode terakhir yang dipakai diingat di browser, dan mode terkunci selama batch berjalan.

> [!WARNING]
> Hasil analisis adalah **saran AI, bukan jaminan** diterima atau ditolak. AI tidak punya akses ke database platform, sehingga kemiripan dengan konten lain hanya dapat ditandai sebagai *perlu tinjau*, bukan dipastikan.

## Provider AI

Setiap provider memakai **satu model tetap**, tanpa pemilihan model dinamis (lihat `src/lib/providers/models.ts`).

| Provider | Model | Batas gratis |
| --- | --- | --- |
| **Groq** (default) | `qwen/qwen3.8-27b` | Perkiraan ±8.000 token/menit, dapat berubah sewaktu-waktu. [Dokumentasi limit](https://console.groq.com/docs/rate-limits) |
| **Gemini** | `gemini-3.5-flash-lite` | Kuota harian gratis; `429` bertanda kuota harian berarti kuota hari itu habis. [Dokumentasi rate limit](https://ai.google.dev/gemini-api/docs/rate-limits) |
| **OpenRouter** (cadangan) | `openrouter/free` | Perkiraan ±20 request/hari tanpa isi saldo, dapat berubah sewaktu-waktu. [Dokumentasi](https://openrouter.ai/docs) |

<details>
<summary><b>Perilaku retry dan fallback</b></summary>

<br>

Berdasarkan `src/lib/providers/retry.ts` dan `src/lib/providers/fallback.ts`:

- Limit per menit (`429` biasa) di-retry otomatis dengan total maksimal **3 percobaan**, menunggu ±20 detik atau sesuai header `retry-after`.
- Error `503` atau sibuk di-retry dengan backoff 5 detik lalu 10 detik.
- Kuota **harian** habis (`429` bertanda kuota harian) tidak di-retry. Frame dialihkan ke provider lain yang key-nya tersimpan, atau gagal dengan pesan yang jelas bila tidak ada key cadangan.
- Fallback bisa dimatikan lewat kotak centang di samping label **Provider** (default aktif).

</details>

## Format CSV

Ekspor mengikuti template resmi tiap portal (lihat `src/lib/csv.ts` dan `src/lib/validate.ts`).

| Aturan | **Adobe Stock** | **Shutterstock** |
| --- | --- | --- |
| Kolom | `Filename, Title, Keywords, Category, Releases` | `Filename, Description, Keywords, Categories` |
| Judul / deskripsi | Judul maks 200 karakter (koma aman, sel CSV di-quote) | Deskripsi berupa kalimat utuh, bukan daftar kata |
| Kategori | Berupa **nomor** (1-21) sesuai daftar resmi Adobe; kolom `Releases` dikosongkan | **1-2 nama** resmi dalam satu sel, dipisah koma |
| Kata kunci | Satu sel dipisah koma, maksimal 49 (yang paling penting dulu) | Satu sel dipisah koma, maksimal 50 |
| Nama file | Saran bila melebihi 30 karakter (termasuk ekstensi) | Tidak ada batas khusus di aplikasi |

- Judul Adobe yang dihasilkan AI dibatasi 200 karakter saat parsing. Edit manual yang melebihi batas tidak dipotong diam-diam saat ekspor, melainkan memunculkan saran validasi.
- Hanya baris yang sudah punya isi untuk platform tersebut yang diekspor. File dikirim sebagai UTF-8 dengan BOM dan baris CRLF, plus proteksi injeksi formula untuk sel berawalan `=`, `+`, `-`, atau `@`.
- Saran validasi lain (kata kunci minimal 5 untuk Adobe dan 7 untuk Shutterstock, deskripsi minimal 5 kata, kategori wajib diisi) bersifat non-pemblokir.

> [!IMPORTANT]
> Impor CSV hasil unduhan ke portal masing-masing **sekali dulu** untuk memastikan formatnya diterima sebelum dipakai untuk banyak file.

## Keamanan dan Privasi

- **Tanpa server perantara.** Key dan gambar dikirim langsung dari browser ke server provider (`api.groq.com`, `generativelanguage.googleapis.com`, `openrouter.ai`). Repo ini tidak memiliki API route backend, dan tidak ada analytics atau pelacak di kode.
- **Yang dikirim ke provider**, baik di Mode Analisis maupun Metadata: API key (sebagai otorisasi), teks prompt, dan gambar dalam format base64.
- **API key** disimpan di localStorage browser (`stockmeta_groq_key`, `stockmeta_gemini_key`, `stockmeta_openrouter_key`) dan hanya ditulis setelah tes koneksi lulus.
- **Preferensi non-sensitif** juga disimpan di localStorage: sesi (`stockmeta_session`, berisi thumbnail dan metadata, bukan file asli), tema (`stockmeta_theme`), jeda antar foto (`stockmeta_batch_delay`), provider terpilih (`stockmeta_provider`), status fallback (`stockmeta_fallback`), dan mode aktif (`stockmeta_mode`).
- **Gunakan API key khusus** untuk aplikasi ini (bukan key utamamu) dan batasi haknya di konsol provider.

> [!WARNING]
> **Jangan memakai komputer bersama** tanpa menghapus sesi. Siapa pun yang membuka browser yang sama dapat melihat key yang tersimpan. Tersedia tombol lihat/sembunyikan key, dan key dapat dihapus dari field-nya.

## FAQ

<details>
<summary><b>Apakah gambar saya diunggah ke server StockMeta?</b></summary>

<br>

Tidak. Aplikasi ini tidak punya backend. Gambar dikirim langsung dari browser ke provider AI yang kamu pilih. Setelah halaman dimuat ulang, sesi hanya menyimpan thumbnail dan metadata, bukan file aslinya.

</details>

<details>
<summary><b>Apakah saya perlu API key sendiri?</b></summary>

<br>

Ya. Kamu membawa key milikmu (Groq, Gemini, atau OpenRouter). Batas pemakaian mengikuti kuota akun provider masing-masing, bukan batas dari StockMeta.

</details>

<details>
<summary><b>Kenapa tombol "Buat metadata" melewati sebagian frame?</b></summary>

<br>

Pembuatan metadata digerbang oleh analisis. Frame yang belum dianalisis pada platform aktif dilewati sampai kamu menjalankan **Mode Analisis** terlebih dahulu.

</details>

<details>
<summary><b>Apa yang terjadi bila kuota provider habis di tengah batch?</b></summary>

<br>

Limit per menit di-retry otomatis. Bila kuota harian habis, frame dialihkan ke provider lain yang key-nya tersimpan (jika fallback aktif). Tanpa key cadangan, frame ditandai gagal dengan pesan yang jelas dan bisa dicoba lagi nanti.

</details>

<details>
<summary><b>Apakah verdict "Layak" menjamin foto diterima?</b></summary>

<br>

Tidak. Analisis adalah saran AI atas apa yang terlihat di gambar. Keputusan penerimaan tetap ada pada platform, dan kemiripan dengan konten lain tidak bisa dipastikan oleh AI.

</details>

## Pengembangan

**Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4, Vitest + jsdom, ESLint, dan font JetBrains Mono via `next/font`.

Prasyarat: Node.js (versi LTS disarankan) dan npm.

```bash
git clone https://github.com/akndrn000/stockmeta.git
cd stockmeta
npm install
npm run dev      # buka http://localhost:3000
```

| Script | Fungsi |
| --- | --- |
| `npm run dev` | Server development Next.js |
| `npm run build` | Build produksi |
| `npm run start` | Menjalankan hasil build produksi |
| `npm run lint` | Cek ESLint |
| `npm run test` | Unit test sekali jalan (Vitest) |
| `npm run typecheck` | Cek tipe TypeScript tanpa emit (`tsc --noEmit`) |

Sebelum membuka pull request, pastikan semua cek lolos:

```bash
npm run lint && npm run typecheck && npm run test
```

Konvensi kode ada di [`AGENTS.md`](./AGENTS.md): satu modul satu seam dengan interface kecil. `src/lib/*` berisi logika murni tanpa DOM/React, `src/hooks/*` berisi state React, dan `src/components/*` berisi UI. Logika murni tidak mengimpor React, dan provider tidak mengimpor komponen.

<details>
<summary><b>Struktur folder</b></summary>

<br>

```text
src/
  app/            layout.tsx, page.tsx, globals.css (token warna), icon.svg
  components/     Header, ModeToggle, ProviderPanel, Worksheet, CaptionSheet,
                  AnalysisPanel, KeywordEditor, Panel, CopyButton, ThemeToggle,
                  Footer, InlineScript
  hooks/          useSession, useProvider, useBatch, useAnalysisBatch, useTheme
  lib/            batch, csv, prompt, analysisPrompt, validate, storage, limits,
                  categories, metadata, keywords, frames, image, fileStore, types
  lib/providers/  groq, gemini, openrouter, fallback, retry, models, types, index, http
scripts/          live-test.ts (tes provider manual, tidak ikut build)
docs/             DESIGN.md, MIGRATION.md, banner.svg, hero.png,
                  screenshots-mobile/ dan screenshots-m29/ (bukti audit)
```

</details>

<details>
<summary><b>Live-test provider manual</b></summary>

<br>

Skrip ini tidak ikut build. Key hanya dibaca dari environment variable.

```bash
GEMINI_KEY=... npx tsx scripts/live-test.ts gemini foto.jpg adobe "Halloween"
GROQ_KEY=... npx tsx scripts/live-test.ts groq foto.jpg shutterstock
OPENROUTER_KEY=... npx tsx scripts/live-test.ts openrouter foto.jpg adobe
```

</details>

## Deploy

Tidak ada environment variable yang dibutuhkan, karena semua key diisi pengguna di browser.

```bash
vercel deploy
```

Atau hubungkan repo ini ke Vercel Dashboard dengan build default `npm run build`.

## Batasan yang Diketahui

- **Maksimal 20 frame per batch.**
- **File asli tidak disimpan setelah refresh.** Sesi menyimpan thumbnail dan metadata saja. Untuk generate ulang, upload ulang gambar dengan nama yang sama.
- **Hasil AI tetap perlu ditinjau manual.** Subjek bisa salah baca dan kata kunci perlu dikurasi. Batas portal (misalnya judul Adobe 200 karakter) hanya berupa saran, kecuali pemotongan 200 karakter pada output mentah model.
- **Kategori bisa terisi otomatis oleh sistem** bila nama dari model tidak cocok dengan daftar resmi. Hasil seperti ini ditandai dengan saran *"Kategori dipilih otomatis oleh sistem, periksa kembali."*

## Kontribusi

1. Fork repo ini dan buat branch dari `main`.
2. Baca [`AGENTS.md`](./AGENTS.md) dan ikuti konvensi modul yang ada.
3. Jalankan `npm run lint && npm run typecheck && npm run test` sampai semuanya lolos.
4. Buka pull request dengan deskripsi singkat tentang perubahanmu.

Menemukan bug atau punya usulan? Buka [issue](https://github.com/akndrn000/stockmeta/issues).

## Lisensi dan Disclaimer

Dilisensikan di bawah **MIT**. Lihat [LICENSE](./LICENSE) (© 2026 akndrn000).

"Adobe Stock", "Shutterstock", "Groq", dan "Gemini/Google" adalah merek dagang pemiliknya masing-masing. Proyek ini tidak berafiliasi dengan, disponsori, atau didukung oleh mereka.
