# Changelog

Semua perubahan penting pada proyek ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/).

## [Belum dirilis]

### Ditambahkan
- Provider **OpenRouter** di samping Groq dan Gemini.
- Badge status koneksi (`AKTIF`, `GAGAL`, dan sebagainya) di samping label **API key**.
- README baru dengan banner, diagram alur kerja dan privasi, pratinjau mode siang dan malam, serta versi bahasa Inggris.
- `CONTRIBUTING.md` dan `LICENSE` (MIT).

### Diubah
- **Tema utama sekarang wajib** diisi sebelum metadata dibuat.
- Tab **Metadata** bisa dipakai langsung tanpa menjalankan analisis gambar terlebih dulu.
- Batas judul Adobe Stock mengikuti aturan portal: maksimal 200 karakter, dengan kata kunci 5 sampai 49.
- Warna garis dan tulisan diseragamkan antara mode siang dan malam.

### Diperbaiki
- Kecocokan metadata dengan isi gambar dan relevansinya terhadap aturan Adobe Stock dan Shutterstock.

## [0.1.0]

### Ditambahkan
- Unggah sampai 20 frame per batch (JPG, PNG, WEBP).
- Pembuatan metadata batch dengan Groq dan Gemini, termasuk retry otomatis dan status per frame.
- Editor per frame: judul atau deskripsi, kata kunci berbentuk chip, kategori resmi.
- Ekspor CSV untuk Adobe Stock dan Shutterstock.
- Mode siang dan malam, serta sesi yang tersimpan di browser.
