# DESIGN.md — Sistem desain StockMeta (versi Next.js)

Sumber kebenaran: `src/app/globals.css` (token) + komponen di `src/components/`.
Dokumen ini catatan; kalau code dan dokumen beda, code menang.

## Token warna — “Darkroom”

Satu skema warna untuk seluruh halaman, dua mode. Pergantian `data-theme` di `<html>`
mengganti seluruh halaman sekaligus (dibaca script anti-flash di `layout.tsx`).
Komponen **hanya** memakai token lewat utilitas Tailwind (`bg-surface`, `text-ink`, …) —
tanpa warna hard-coded di komponen.

| Token | Utilitas | Mode gelap | Mode terang | Peran |
| --- | --- | --- | --- | --- |
| `--bg` | `bg-bg` | `#0f1116` | `#f1f0ec` | Latar halaman |
| `--surface` | `bg-surface` | `#171a21` | `#fcfcfa` | Panel/header |
| `--raised` | `bg-raised` | `#1c202a` | `#f4f3ef` | Elemen terangkat |
| `--well` | `bg-well` | `#12151b` | `#ffffff` | Kotak isian |
| `--line` / `--line-soft` | `border-line` | putih 14% / 8% | hitam 17% / 10% | Garis |
| `--wash` | `bg-wash` | putih 8% | hitam 5% | Hover/hover state |
| `--ink` | `text-ink` | `#e9ebf0` | `#16181c` | Teks utama |
| `--ink-2` | `text-ink-2` | `#9aa2b1` | `#5c6169` | Teks sekunder |
| `--ink-3` | `text-ink-3` | `#838b9b` | `#676b73` | Label/hint (≥4.5:1 di semua permukaan) |
| `--accent` | `bg-accent` | `#d93a22` | `#c1321c` | Merah tombol commit & brand |
| `--accent-hover` | `bg-accent-hover` | `#c1321c` | `#a82115` | Hover tombol aksen |
| `--accent-text` | `text-accent-text` | `#ff6a4f` | `#c0281a` | Teks/ikon aksen |
| `--accent-wash` | `bg-accent-wash` | merah 16% | merah 10% | Latar badge gagal |
| `--success` (+wash) | `text-success` | `#5cd79a` | `#12724a` | Status siap/berhasil |
| `--fail` | `text-fail` | `#ff6a4f` | `#c0281a` | Status gagal |
| `--focus` | outline | `#ff6a4f` | `#c0281a` | Focus ring keyboard |
| `--plate` / `--plate-ink` | `bg-plate` | `#ffffff` / `#16181c` | `#16181c` / `#fcfcfa` | Pelat aktif (segmen platform) |

Aturan kontras: teks normal ≥ **4.5:1**, teks besar ≥ 3:1 — diuji terhadap `--bg`,
`--surface`, `--well`, `--raised`, dan latar wash yang sudah di-composite (lihat catatan
M9b di `MIGRATION.md`).

## Aksen tunggal

**Merah (`--accent`) adalah satu-satunya aksen.** Dipakai hanya untuk:

1. Tombol commit (`Buat metadata`) dan state menghubungi provider (`Tes koneksi` saat aktif).
2. Identitas brand (kotak logo + wordmark `StockMeta`).
3. Status gagal (`--fail` adalah turunan merah yang sama).

Tidak ada aksen kedua: tidak ada biru/hijau/ungu dekoratif. `--success` hijau **bukan**
aksen — hanya sinyal status. Badge status memakai warna wash + border, bukan blok penuh.

## Tipografi

- **Archivo** (`--font-archivo`) untuk seluruh teks UI; angka/readout memakai
  **Courier Prime** (`--font-mono`) — mono dipakai untuk data & readout mesin
  (`05 frame / Adobe Stock / Gemini / Aktif`), bukan sebagai kostum.
- Skala: judul panel `15px bold` (tracking `-0.015em`), teks tombol `13–13.5px semibold`,
  body `13.5px`, label `11px semibold`, readout mono `11px bold uppercase tracking 0.08em`.
- Aksen tracking: wordmark `-0.03em`; tidak ada tracking di bawah `-0.04em`.

## Komponen utama

| Komponen | Peran |
| --- | --- |
| `Panel` | Wadah standar: judul + meta mono + aksi; tinggi mengikuti isi (halaman yang menggulir); body `grow` supaya panel yang lebih pendek terisi rapi saat grid menyamakan tingginya (M14); footer opsional. Dipakai Worksheet & CaptionSheet. |
| `Header` | Brand (h1), segmen platform (`aria-pressed`), ThemeToggle, readout status mono. |
| `ProviderPanel` | Pilih provider, API key (lihat/sembunyikan), Tes koneksi + badge `role="status"`, catatan limit. |
| `Worksheet` | Dropzone, grid frame (tile: pilih, hapus, **ikon buat ulang per tile** — aksen untuk frame gagal), tema batch, jeda antar foto, Generate/Batalkan + Buat ulang semua, ProgressBar (`aria-live`), Coba lagi. |
| `CaptionSheet` | Field edit per platform (penghitung menempel di dalam kotak), KeywordEditor (chip), saran validasi, footer Export CSV — **tanpa tombol buat ulang** (pindah ke tile). **M14: struktur field selalu dirender** (Judul/Deskripsi, Kata kunci, Kategori, Tema) dan hanya nonaktif sampai ada frame terpilih — tanpa kotak kosong; header `Frame -- / --`. |
| `KeywordEditor` | Chip kata kunci + input (Enter/koma/tempel) + satu tombol salin daftar; daftar chip dibatasi `12.5rem` (200px di root 16px) + scroll (**satu-satunya scroll internal**); penghitung `0/50` menempel di kotak input. |
| `CopyButton`, `ThemeToggle` | Kontrol kecil berlabel ARIA. |

## Layout & responsif (M14)

- **Satu dokumen, satu scroll** (M12): tidak ada tinggi dikunci ke viewport — semua elemen
  tingginya = isi.
- **≥1024px**: `main` = dua kolom `3fr / 2fr` dengan `items-stretch` → Worksheet & CaptionSheet
  **selalu sama tinggi** mengikuti panel yang lebih tinggi; panel yang lebih pendek terisi rapi
  lewat body Panel yang `grow` (konten di atas, footer menempel di bawah) — tanpa scroll
  internal, kecuali daftar chip kata kunci (pengecualian M13).
- **Satuan relatif**: spasi & lebar memakai rem / % / fr — skala spacing Tailwind memang rem,
  ditambah `minmax(9.375rem,1fr)` (grid), `max-h-[12.5rem]` (chip), `top-[2.625rem]` (popover),
  `rounded-[0.875rem]` (panel). Ukuran font tetap px sebagai **skala tipografi yang disengaja**
  (lihat bagian Tipografi).
- **Uji rentang (analisis statis, tanpa server)**: lebar 360px → >1920px dan zoom 50–150% —
  grid `auto-fill` menambah/mengurangi kolom, `lg` menumpuk jadi satu kolom pada zoom tinggi/
  layar sempit, footer & konfirmasi memakai `flex-wrap`, nama file/chip `truncate`, dan
  elemen absolut (keterangan dalam kotak, ikon tile, popover) menempel pada anchor-nya karena
  memakai rem.

## Aksesibilitas (lantai mutu)

- Focus ring global `2px --focus` + offset 2px (`:focus-visible`), di kedua mode.
- Semua input punya `<label for>`; tombol ikon punya `aria-label` + `title`.
- `prefers-reduced-motion`: animasi (spinner) dimatikan; **transisi warna/lebar tetap** —
  itu umpan balik state, bukan dekorasi; scroll `smooth` dijaga di JS.
- Target sentuh ≥ 40px di layar kecil (`<1024px`) lewat satu blok CSS; tombol ikon ringkas
  (`.btn-compact`) memakai area klik pseudo-element agar tidak membesar visual.
- Status hidup: progress bar, notice batch, hasil tes koneksi, dan pesan dilewati chip
  memakai `aria-live`/`role="status"`.
- Semua teks terpotong (nama file, chip panjang) punya `title` tooltip.
