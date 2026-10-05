# Berkontribusi ke StockMeta

Terima kasih sudah mau membantu. Dokumen ini menjelaskan cara melapor, mengusulkan perubahan, dan mengirim kode.

## Melaporkan bug

Buka [Issue](https://github.com/akndrn000/stockmeta/issues) baru dan sertakan:

- Platform yang dipakai (Adobe Stock atau Shutterstock) dan provider AI-nya.
- Langkah untuk memunculkan masalah, hasil yang diharapkan, dan hasil yang terjadi.
- Browser dan sistem operasi.
- Tangkapan layar atau pesan error, **tanpa menyertakan API key**.

Untuk metadata yang tidak sesuai gambar, sertakan juga tema yang diisi dan, bila bisa dibagikan, gambar contohnya.

## Mengusulkan fitur

Buka Issue dan jelaskan masalah yang ingin diselesaikan, bukan hanya solusinya. Perubahan besar sebaiknya didiskusikan dulu sebelum dikerjakan.

## Menyiapkan lingkungan

```bash
git clone https://github.com/akndrn000/stockmeta.git
cd stockmeta
npm install
npm run dev
```

## Alur kerja

1. Buat branch dari `main`, misalnya `fix/validasi-kata-kunci` atau `feat/provider-baru`.
2. Kerjakan perubahan kecil dan fokus. Satu Pull Request untuk satu tujuan.
3. Jalankan pemeriksaan berikut sebelum push, semuanya harus lulus:
   ```bash
   npm run typecheck
   npm run lint
   npm run test
   ```
4. Buka Pull Request ke `main`, jelaskan apa yang berubah dan alasannya.

## Standar kode

- TypeScript mode strict. Hindari `any`.
- Logika murni (batch, csv, prompt, validate) ditaruh di `src/lib/` dan wajib punya unit test.
- Aturan platform (batas panjang, jumlah kata kunci, daftar kategori) dikumpulkan di satu tempat per platform, jangan disebar.
- Warna dan garis lewat token di `globals.css`, jangan menulis warna langsung di komponen. Ikuti [`docs/DESIGN.md`](docs/DESIGN.md).
- Jangan memotong teks hasil AI secara diam-diam. Tampilkan peringatan atau tandai gagal dengan alasan yang jelas.

## Pesan commit

Memakai format singkat:

```
fix: tolak generate saat tema kosong
feat: tambah provider OpenRouter
docs: perbarui README
style: samakan warna garis mode siang dan malam
test: tambah kasus validator kategori
```

## Keamanan

Jangan mengirim API key ke Issue, Pull Request, atau log. Kalau menemukan celah keamanan, laporkan lewat tab **Security** di repo ini, bukan lewat Issue publik.
