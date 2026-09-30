# StockMeta

*Metadata AI untuk Adobe Stock & Shutterstock — upload foto, biarkan AI menulis judul, deskripsi, kata kunci, dan kategori secara batch, lalu ekspor CSV sesuai format portal.*

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)

![Screenshot StockMeta](./docs/screenshot.png)

**[Demo Live](https://stockmeta-one.vercel.app)** • [Laporkan Bug](https://github.com/akndrn000/stockmeta/issues) • [Struktur Folder](#-struktur-folder)

## 📑 Daftar Isi

- [💡 Kenapa StockMeta?](#-kenapa-stockmeta)
- [✨ Fitur](#-fitur)
- [🚀 Cara pakai](#-cara-pakai)
- [🤖 Provider gratis](#-provider-gratis)
- [📋 Format CSV](#-format-csv)
- [🔐 Keamanan](#-keamanan)
- [💻 Menjalankan lokal](#-menjalankan-lokal)
- [🌐 Deploy ke Vercel](#-deploy-ke-vercel)
- [🧰 Tech stack](#-tech-stack)
- [📁 Struktur folder](#-struktur-folder)
- [⚠ Batasan yang diketahui](#-batasan-yang-diketahui)
- [📄 Lisensi](#-lisensi)
- [🙏 Dibuat dengan](#-dibuat-dengan)

## 💡 Kenapa StockMeta?

Kontributor stock photo perlu metadata yang cepat dan akurat untuk Adobe Stock dan Shutterstock:
judul, deskripsi, kata kunci, dan kategori harus tersedia untuk setiap foto. StockMeta
mengerjakannya secara batch: upload
foto, biarkan Groq atau Gemini menulis metadatanya, lalu sunting, salin, atau ekspor CSV sesuai
format portal. Berjalan sepenuhnya di browser Anda: API key tidak pernah menyentuh server
aplikasi ini.

## ✨ Fitur

- Upload sampai **20 frame** per batch (JPG/PNG/WEBP) lewat drag-drop atau tombol pilih file.
- Dua platform dalam satu sesi: **Adobe Stock** dan **Shutterstock** — ganti platform tanpa
  kehilangan hasil (metadata tersimpan per platform).
- Generate metadata batch: berurutan, bisa dibatalkan, retry sabar saat kena limit, dan
  status per frame (menunggu / memproses / siap / gagal).
- Fallback antar provider: kuota harian habis atau `503` setelah retry → frame lanjut ke
  provider lain yang key-nya tersimpan (toggle di panel provider, default aktif).
- Edit manual per frame: judul atau deskripsi, kata kunci berbentuk chip, kategori resmi,
  tema per foto, saran perbaikan non-pemblokir.
- Ekspor CSV sesuai template resmi, atau salin per field dengan satu klik.
- Jeda antar foto dapat diatur (3/6/12/20 detik, default 6) untuk menghindari limit.
- Mode siang/malam (mengikuti sistem, bisa di-override), sesi tersimpan otomatis di browser.

## 🚀 Cara pakai

1. **Upload** foto ke Lembar kerja (drag-drop atau klik area upload).
2. **Pilih platform** (Adobe Stock / Shutterstock) di header.
3. **Pilih provider** (Groq — default, atau Gemini) lalu **tempel API key** Anda.
4. Klik **Tes koneksi** — key hanya disimpan kalau tes lulus.
5. Isi **tema batch** (opsional), misalnya `Halloween`.
6. Klik **Buat metadata** — progress tampil per frame; bisa **Batalkan** kapan saja.
7. **Edit** hasilnya di Lembar caption (judul/deskripsi, kata kunci, kategori).
8. **Salin** per field, atau klik **Export CSV** untuk unduh file CSV.

## 🤖 Provider gratis

| Provider | Model | Catatan limit gratis |
| --- | --- | --- |
| **Groq** (default) | `qwen/qwen3.8-27b` | Limit gratis ketat (**±8.000 token/menit**) — batch besar bisa lambat karena menunggu limit reset. |
| **Gemini** | `gemini-3.5-flash-lite` | **Flash-Lite**: kuota gratis lebih longgar daripada flash biasa. `429` per hari berarti kuota hari itu habis — lanjut besok atau biarkan frame dialihkan ke Groq lewat fallback. |
| **OpenRouter** | `openrouter/free` (alias vision) | Cadangan: free tier sangat terbatas (**±20 request/hari** tanpa isi saldo). |

Tiap provider memakai **satu model tetap** — tanpa pemilihan model dinamis, tanpa daftar
model kandidat. Kalau provider aktif gagal karena **kuota harian (`429`)**
atau **`503` setelah retry habis**, frame itu diproses lewat **provider lain** yang API
key-nya tersimpan (status frame menampilkan provider yang akhirnya dipakai). Fallback bisa
dimatikan lewat toggle **Fallback antar provider** di panel provider (default: aktif);
tanpa key provider lain, frame gagal dengan pesan jelas.

Saran: kalau sering muncul pemberitahuan **“Menunggu limit reset”**, naikkan **Jeda antar
foto** (misalnya 12 atau 20 detik) di Lembar kerja. Retry berjalan otomatis (maksimal **3**
percobaan: tunggu limit per menit, backoff untuk `503`, tanpa retry untuk kuota harian);
frame yang tetap gagal bisa diproses ulang lewat tombol **Coba lagi frame gagal**.

## 📋 Format CSV

Impor CSV mengikuti template resmi masing-masing portal:

| | **Adobe Stock** | **Shutterstock** |
| --- | --- | --- |
| Kolom | `Filename, Title, Keywords, Category, Releases` | `Filename, Description, Keywords, Categories` |
| Judul / deskripsi | **Maks 70 karakter, tanpa koma** (koma otomatis diganti spasi saat ekspor) | Deskripsi: kalimat utuh, bukan daftar kata |
| Kategori | Berupa **nomor** (1–21) sesuai daftar resmi Adobe; `Releases` kosong | **1–2 nama** resmi dalam satu sel, dipisah koma |
| Kata kunci | Satu sel, dipisah koma, maksimal 50 | Satu sel, dipisah koma |

Catatan: hanya baris yang sudah punya isi untuk platform tersebut yang diekspor. **Sebaiknya
impor CSV hasil unduhan ke portal masing-masing sekali dulu** untuk memastikan formatnya
diterima sebelum dipakai untuk banyak file.

## 🔐 Keamanan

- API key disimpan di **localStorage browser Anda** dan dikirim **langsung ke server
  Gemini/Groq** dari browser — **tidak pernah lewat server aplikasi ini**.
- Gunakan **API key khusus** untuk aplikasi ini (bukan key utama Anda) dan batasi haknya
  di konsol provider.
- **Jangan memakai komputer bersama** tanpa menghapus sesi: siapa pun yang membuka browser
  yang sama bisa melihat key tersimpan (Ada tombol lihat/sembunyikan key dan Anda bisa
  menghapusnya dari field).

## 💻 Menjalankan lokal

```bash
npm install
npm run dev      # buka http://localhost:3000
npm run test     # unit test (vitest)
npm run typecheck
npm run lint
```

## 🌐 Deploy ke Vercel

Tidak ada environment variable yang dibutuhkan — semua key diisi pengguna di browser:

```bash
vercel deploy
```

Atau hubungkan repo ini ke Vercel Dashboard. Build default: `npm run build`.

## 🧰 Tech stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (token warna lewat `@theme`)
- **Vitest** + jsdom untuk unit test, **ESLint** untuk lint
- Font: **JetBrains Mono** (satu font untuk teks & readout) via `next/font`

## 📁 Struktur folder

```text
src/
  app/          layout, halaman, globals.css (token warna), icon.svg
  components/   Header, ProviderPanel, Worksheet, CaptionSheet, KeywordEditor, …
  hooks/        useSession, useProvider, useBatch, useTheme
  lib/          logika murni: batch, csv, prompt, validate, storage, providers/
scripts/        live-test.ts (tes provider manual, tidak ikut build)
docs/           DESIGN.md (sistem desain), MIGRATION.md (riwayat migrasi)
```

## ⚠ Batasan yang diketahui

- **Maksimal 20 frame per batch.**
- **File asli tidak disimpan setelah refresh** — sesi menyimpan thumbnail + metadata saja;
  untuk generate ulang, upload ulang gambar dengan nama yang sama.
- **Hasil AI tetap perlu ditinjau manual**: subjek bisa salah baca, kata kunci perlu
  dikurasi, dan batas portal (misalnya judul Adobe 70 karakter) hanya disarankan, tidak
  dipotong diam-diam.

## 📄 Lisensi

Dilisensikan di bawah **MIT** — lihat file [LICENSE](./LICENSE) untuk teks lengkapnya.

## 🙏 Dibuat dengan

Next.js • React • TypeScript • Tailwind CSS • Vitest — diproses di browser Anda, tanpa server backend.
