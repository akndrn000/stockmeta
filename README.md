<div align="center">

<img src="docs/images/banner.svg" alt="StockMeta: Metadata AI untuk Adobe Stock dan Shutterstock" width="100%">

<br>

[![Live demo](https://img.shields.io/badge/demo-stockmeta--gold.vercel.app-22e27a?style=for-the-badge&labelColor=08100c)](https://stockmeta-gold.vercel.app/)

![Next.js](https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React_19-20232a?style=flat-square&logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_v4-06b6d4?style=flat-square&logo=tailwindcss&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-6e9f18?style=flat-square&logo=vitest&logoColor=white)
![Deploy](https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white)

[Bahasa Indonesia](README.md) · [English](README.en.md)

**Buat judul, deskripsi, kata kunci, dan kategori untuk Adobe Stock dan Shutterstock secara batch.**
Berjalan di browser Anda. API key tidak pernah melewati server aplikasi ini.

[Coba sekarang](https://stockmeta-gold.vercel.app/) ·
[Fitur](#fitur) ·
[Cara pakai](#cara-pakai) ·
[Format CSV](#format-csv) ·
[Privasi](#privasi-dan-keamanan) ·
[Pengembangan](#pengembangan-lokal) ·
[Kontribusi](#kontribusi)

</div>

---

## Ringkasan

Mengisi metadata satu per satu untuk puluhan file adalah bagian yang paling memakan waktu bagi kontributor stok. StockMeta membaca gambar Anda lewat model AI (Groq, Gemini, atau OpenRouter), menyusun metadata sesuai aturan tiap portal, lalu mengekspornya sebagai CSV yang siap diimpor.

Ada tiga hal yang menjadi pegangan alat ini:

- **Sesuai portal.** Adobe Stock dan Shutterstock punya aturan dan format CSV yang berbeda, jadi masing-masing punya prompt, validasi, dan template ekspor sendiri.
- **Berdasarkan isi gambar.** Tema utama wajib diisi sebagai konteks, tetapi hasilnya tetap harus cocok dengan apa yang benar-benar terlihat di gambar.
- **Terkendali oleh Anda.** Semua hasil bisa disunting sebelum diekspor. Tidak ada yang dipotong atau diubah diam-diam.

## Tampilan

<table>
  <tr>
    <td width="50%" align="center"><img src="docs/images/preview-dark.png" alt="Pratinjau StockMeta mode malam"><br><sub>Mode malam</sub></td>
    <td width="50%" align="center"><img src="docs/images/preview-light.png" alt="Pratinjau StockMeta mode siang"><br><sub>Mode siang</sub></td>
  </tr>
</table>

<sub>Pratinjau antarmuka dengan contoh batch bertema Halloween. Isi gambar dan metadata hanya contoh. Antarmukanya memakai gerak halus (fade dan denyut fosfor) yang nonaktif otomatis bila Anda mengaktifkan pengurangan gerak di sistem.</sub>

## Fitur

| | |
|---|---|
| **Batch sampai 20 frame** | Unggah JPG, PNG, atau WEBP lewat seret-lepas atau tombol pilih file. |
| **Dua platform, satu sesi** | Ganti antara Adobe Stock dan Shutterstock tanpa kehilangan hasil. Metadata disimpan terpisah per platform. |
| **Tiga provider AI** | Groq, Gemini, dan OpenRouter. Key diuji dulu lewat tombol Tes koneksi. |
| **Tema utama wajib** | Satu tema untuk seluruh batch, dengan opsi mengubah tema per frame. |
| **Proses yang terkendali** | Berurutan, bisa dibatalkan, retry otomatis saat kena limit, dan status per frame: menunggu, memproses, siap, gagal. |
| **Editor per frame** | Sunting judul atau deskripsi, kata kunci berbentuk chip, kategori resmi, serta saran perbaikan yang tidak memblokir. |
| **Ekspor CSV** | Mengikuti template resmi tiap portal. Bisa juga menyalin per field dengan satu klik. |
| **Jeda antar foto** | Pilihan 3, 6, 12, atau 20 detik (bawaan 6) untuk menghindari limit provider. |
| **Mode siang dan malam** | Mengikuti sistem, bisa diganti manual. Sesi tersimpan otomatis di browser. |

## Cara pakai

<img src="docs/images/workflow.svg" alt="Alur kerja StockMeta: unggah, siapkan, buat, tinjau dan ekspor" width="100%">

1. **Unggah** gambar ke Lembar kerja, dengan seret-lepas atau klik area unggah.
2. **Pilih platform** di pojok kanan atas: Adobe Stock atau Shutterstock.
3. **Pilih provider**, tempel **API key**, lalu klik **Tes koneksi**. Key hanya disimpan kalau tes berhasil.
4. Isi **Tema utama**, misalnya `Halloween`. Kolom ini wajib, dan tombol Buat metadata tidak aktif sebelum terisi.
5. Atur **Jeda antar foto** bila provider Anda sering membatasi permintaan.
6. Klik **Buat metadata**. Progres tampil per frame dan bisa dibatalkan kapan saja.
7. **Tinjau dan sunting** hasilnya di Lembar caption.
8. **Salin** per field, atau klik **Export CSV** untuk mengunduh file yang siap diimpor.

> [!TIP]
> Untuk batch besar, mulai dengan 3 sampai 5 gambar. Periksa hasilnya dan format CSV-nya di portal, lalu lanjutkan ke batch penuh.

## Provider AI

| Provider | Kapan dipakai | Catatan |
|---|---|---|
| **Groq** | Pilihan awal yang cepat. | Paket gratis punya batas token per menit, jadi batch besar bisa menunggu limit reset. |
| **Gemini** | Alternatif bila Groq sedang penuh. | Paket gratis dibatasi per menit dan per hari, dan kadang sibuk. |
| **OpenRouter** | Akses ke berbagai model lewat satu key. | Ketersediaan, harga, dan kemampuan membaca gambar bergantung pada model yang dipilih. |

Batas gratis tiap provider berubah dari waktu ke waktu. Cek konsol provider masing-masing untuk angka terbarunya.

Bila sering muncul pemberitahuan **Menunggu limit reset**, naikkan **Jeda antar foto** ke 12 atau 20 detik. Retry berjalan otomatis (maksimal 5 percobaan), dan frame yang tetap gagal bisa diproses ulang dengan tombol **Coba lagi frame gagal**.

Kata kunci diturunkan dari fakta visual gambar: warna dan klaim spesifik (misalnya `kitten`) diverifikasi terhadap fakta itu, kata generik (`vector`, `illustration`, `cute`, dan sejenisnya) ditaruh paling akhir, dan setiap kata yang dibuang atau dipindah tercatat di **Saran perbaikan**.

Gemini memakai model tetap `gemini-3.1-flash-lite` (ubah di `src/lib/providers/gemini-config.ts`). Agar tetap gratis, pakai API key dari proyek Google tanpa billing dan cek label paketnya di `aistudio.google.com/apikey`; batas kuota dilihat di `aistudio.google.com/rate-limit`. Di free tier, Google dapat memakai input untuk memperbaiki produknya, jadi hindari mengunggah gambar yang belum dirilis.

## Format CSV

Ekspor mengikuti template resmi masing-masing portal.

| | Adobe Stock | Shutterstock |
|---|---|---|
| **Kolom** | `Filename, Title, Keywords, Category, Releases` | `Filename, Description, Keywords, Categories` |
| **Judul / deskripsi** | Judul maksimal 200 karakter, tanpa koma (koma diganti spasi saat ekspor). | Deskripsi berupa kalimat utuh, bukan daftar kata. |
| **Kata kunci** | Satu sel, dipisah koma, 5 sampai 49 kata kunci. | Satu sel, dipisah koma. |
| **Kategori** | Berupa nomor 1 sampai 21 sesuai daftar resmi Adobe. Kolom `Releases` dikosongkan. | 1 sampai 2 nama kategori resmi dalam satu sel, dipisah koma. |

Hanya baris yang sudah punya isi untuk platform terkait yang ikut diekspor.

> [!IMPORTANT]
> Impor satu atau dua file hasil ekspor ke portal terlebih dulu sebelum memakainya untuk banyak file. Aturan dan template portal bisa berubah sewaktu-waktu.

## Privasi dan keamanan

<img src="docs/images/privacy.svg" alt="API key dan gambar dikirim langsung dari browser ke provider AI, tanpa melewati server StockMeta" width="100%">

- API key disimpan di **localStorage browser** Anda dan dikirim **langsung dari browser ke provider**. Server aplikasi ini tidak menerimanya.
- Aplikasi tidak memakai pelacak.
- Gunakan **API key khusus** untuk alat ini, bukan key utama Anda, dan batasi haknya di konsol provider.
- **Jangan memakai komputer bersama** tanpa menghapus sesi. Siapa pun yang membuka browser yang sama bisa melihat key yang tersimpan. Key bisa disembunyikan atau dihapus langsung dari kolomnya.

## Batasan yang diketahui

- Maksimal **20 frame per batch**.
- **File asli tidak disimpan** setelah halaman dimuat ulang. Sesi hanya menyimpan thumbnail dan metadata. Untuk generate ulang, unggah ulang gambar dengan nama file yang sama.
- **Hasil AI tetap perlu ditinjau.** Subjek bisa salah terbaca dan kata kunci perlu dikurasi. Batas portal hanya diberi peringatan, tidak dipotong diam-diam.
- Alat ini bersifat independen dan **tidak berafiliasi dengan Adobe maupun Shutterstock**. Pastikan metadata Anda memenuhi pedoman kontributor terbaru masing-masing portal.

## Pengembangan lokal

Prasyarat: Node.js dan npm.

```bash
git clone https://github.com/akndrn000/stockmeta.git
cd stockmeta
npm install
npm run dev        # http://localhost:3000
```

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Menjalankan server pengembangan. |
| `npm run build` | Membuat build produksi. |
| `npm run test` | Menjalankan unit test (Vitest). |
| `npm run typecheck` | Memeriksa tipe TypeScript. |
| `npm run lint` | Menjalankan ESLint. |

Tidak ada environment variable yang dibutuhkan. Semua key diisi pengguna di browser.

### Struktur folder

```
src/
  app/          layout, halaman, globals.css (token warna), icon.svg
  components/   Header, ProviderPanel, Worksheet, CaptionSheet, KeywordEditor, ...
  hooks/        useSession, useProvider, useBatch, useTheme
  lib/          logika murni: batch, csv, prompt, validate, storage, providers/
scripts/        live-test.ts (tes provider manual, tidak ikut build)
docs/           DESIGN.md (sistem desain), MIGRATION.md (riwayat migrasi), images/
```

### Tech stack

- **Next.js 16** (App Router), **React 19**, dan **TypeScript** mode strict
- **Tailwind CSS v4** dengan token warna lewat `@theme`
- **Vitest** dengan jsdom untuk unit test, **ESLint** untuk lint
- **JetBrains Mono** lewat `next/font` sebagai satu-satunya font

Panduan visual ada di [`docs/DESIGN.md`](docs/DESIGN.md).

## Deploy ke Vercel

Hubungkan repo ini ke Vercel Dashboard, atau deploy dari terminal:

```bash
vercel deploy
```

Build bawaan memakai `npm run build`, dan tidak ada environment variable yang perlu diatur.

## Kontribusi

Masukan dan perbaikan sangat diterima. Baca [CONTRIBUTING.md](CONTRIBUTING.md) untuk alur kerja, standar kode, dan cara melaporkan bug. Riwayat perubahan ada di [CHANGELOG.md](CHANGELOG.md).

## Lisensi

Dirilis di bawah [Lisensi MIT](LICENSE).

---

<div align="center">
<sub>StockMeta. Alat independen untuk kontributor stok. Diproses lokal di browser.</sub>
</div>
