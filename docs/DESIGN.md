# DESIGN.md — Sistem desain StockMeta "Phosphor"

Sumber kebenaran: `src/app/globals.css` (token) + komponen di `src/components/`.
Dokumen ini catatan; kalau code dan dokumen beda, code menang.

Tema M15: **terminal / CRT hijau-hitam dua mode** — kanvas nyaris hitam, satu aksen hijau
fosfor, mono di seluruh halaman, badge bergaya bracket `[ … ]`, glow tipis pada elemen aktif.

## Token warna — "Phosphor"

Satu skema warna untuk seluruh halaman, dua mode. Pergantian `data-theme` di `<html>`
mengganti seluruh halaman sekaligus (dibaca script anti-flash di `layout.tsx`).
Komponen **hanya** memakai token lewat utilitas Tailwind (`bg-surface`, `text-ink`, …) —
tanpa warna hard-coded di komponen.

| Token | Utilitas | Mode gelap | Mode terang | Peran |
| --- | --- | --- | --- | --- |
| `--bg` | `bg-bg` | `#050805` | `#f3f2ea` | Latar halaman |
| `--surface` | `bg-surface` | `#070b07` | `#fbfaf6` | Panel/header/tile |
| `--raised` | `bg-raised` | `#0b120c` | `#edece3` | Elemen terangkat (popover konfirmasi) |
| `--well` | `bg-well` | `#0a100a` | `#ffffff` | Kotak isian & pelat sekelasnya |
| `--line` / `--line-soft` | `border-line` | hijau 22% / 11% | hijau 30% / 16% | Garis hairline |
| `--wash` | `bg-wash` | hijau 7% | hijau 7% | Hover/netral lembut |
| `--ink` | `text-ink` | `#eafff1` | `#0f1a13` | Teks utama |
| `--ink-2` | `text-ink-2` | `#86a890` | `#33513f` | Teks sekunder |
| `--ink-3` | `text-ink-3` | `#5f8d68` | `#4d6857` | Label/hint/readout (≥4.5:1 di semua permukaan) |
| `--accent` | `bg-accent` | `#39ff7a` | `#0d6b34` | Hijau fosfor — isian tombol utama & pelat aktif |
| `--accent-hover` | `bg-accent-hover` | `#5cff93` | `#0a5528` | Hover tombol aksen |
| `--accent-text` | `text-accent-text` | `#39ff7a` | `#0b6b33` | Teks/ikon aksen (wordmark, badge aktif) |
| `--accent-dim` / `--accent-faint` | `text-accent-dim`, `border-accent-faint` | `#2bbf5c` / `#1c7a3c` | `#1c7a3c` / `#5f8d68` | Aksen sekunder & garis pudar |
| `--accent-wash` | `bg-accent-wash` | hijau 13% | hijau 10% | Latar badge/pelat aksen |
| `--on-accent` | `text-on-accent` | `#050805` | `#f7fff9` | Teks di atas isian aksen (tombol utama) |
| `--success` (+`--success-wash`) | `text-success` | `#ffd24a` (amber) | `#8a5a00` | Status siap/aktif — **bukan** aksen |
| `--fail` (+`--fail-wash`) | `text-fail` | `#ff6a55` | `#b3261e` | Status gagal |
| `--on-fail` | `text-on-fail` | `#140604` | `#ffffff` | Teks di atas isian merah |
| `--focus` | outline | `#39ff7a` | `#0b6b33` | Focus ring keyboard |
| `--plate` / `--plate-ink` | `bg-plate` | `#39ff7a` / `#050805` | `#0d6b34` / `#f7fff9` | Pelat aktif (segmen platform) |

Aturan kontras: teks normal ≥ **4.5:1**, teks besar ≥ 3:1 — diuji terhadap `--bg`,
`--surface`, `--well`, `--raised`, dan latar wash yang sudah di-composite (lihat catatan
M9b di `MIGRATION.md`).

### Glow (hanya mode gelap)

Glow adalah **shadow statis**, bukan animasi — aman bagi `prefers-reduced-motion` dan tidak
pernah berdenyut. Token: `--glow` (tombol utama/pelat/tile terpilih/brand), `--glow-soft`,
`--glow-text` (wordmark), `--glow-input` (isian saat fokus), `--glow-ok` (badge Aktif, amber).
Mode terang menyetel semuanya `none` — tidak ada glow di atas latar terang.
Utilitas: `.glow`, `.glow-soft`, `.glow-ok`, `.glow-text` (kelas CSS biasa di `globals.css`,
di luar layer sehingga menang atas utilitas `shadow-*` yang tidak dipakai bersamaan).

## Aksen tunggal

**Hijau fosfor (`--accent`) adalah satu-satunya aksen.** Dipakai hanya untuk:

1. Tombol commit (`Buat metadata`) — isian penuh + `--on-accent` + glow.
2. Elemen **aktif**: pelat platform terpilih, tile frame terpilih, isian saat fokus, hover
   border sekunder (`--accent-dim`).
3. Identitas brand (indikator fosfor + wordmark `StockMeta`).

Sinyal status memakai warnanya sendiri, **di luar** aksen: `--success` **amber** (SIAP, badge
Aktif), `--fail` **merah** (GAGAL, pesan error). Tidak ada aksen kedua (biru/ungu); amber &
merah hanya membaca status, bukan dekorasi. Badge status memakai wash + border (atau teks saja
di strip CaptionSheet), bukan blok penuh — kecuali tombol utama.

## Radius

Skala dua tingkat, tanpa nilai aneh:

- **Kontrol** (tombol, input, select, textarea, chip, badge, tombol ikon): `rounded` = 4px.
- **Kontainer** (panel, tile frame, popover, dropzone, kotak konfirmasi, kotak error,
  segmen platform): `rounded-md` = 6px.
- Hindari `rounded-sm` (2px, di bawah ambang 3px) dan `rounded-full`; pengecualian titik kecil
  non-teks (dot brand `rounded-[0.1875rem]`).

## Tipografi

- **JetBrains Mono** (`--font-jetbrains` via `next/font`) adalah **satu-satunya font** untuk
  body maupun heading — hierarki dibentuk dari ukuran, bobot, dan warna, bukan dari font
  kedua (Archivo & Courier Prime dibuang di M15). `--font-sans` dan `--font-mono` menunjuk
  font yang sama.
- Skala: wordmark `18px extrabold` (tracking `-0.03em`), judul panel `15px bold`
  (tracking `-0.015em`), teks tombol `13–13.5px semibold`, body `13.5px`, label
  `11px semibold`, readout/badge mono `10–11px bold uppercase tracking 0.08em`.
- Aksen tracking: wordmark `-0.03em`; tidak ada tracking di bawah `-0.04em`.
- Angka/readout memakai `font-mono` eksplisit agar niat "data = mono" tetap terbaca walau
  seluruh halaman sudah mono.

## Badge bracket

Badge status (`AKTIF`, `SIAP`, `GAGAL`) memakai `.badge-bracket` — bracket `[` `]` ditambahkan
lewat `::before`/`::after`, **teks asli tetap ada di DOM**: pembaca layar dan tes tetap membaca
`Aktif`/`SIAP`, tanpa label ganda. Berlaku untuk badge ProviderPanel, badge tile Worksheet, dan
strip status CaptionSheet. Chip hint (`min 5`, `penuh`) sengaja **tidak** memakai bracket agar
tidak ramai.

## Komponen utama

| Komponen | Peran |
| --- | --- |
| `Panel` | Wadah standar: judul + meta mono + aksi; radius 6px, hairline hijau, **tanpa bayangan lembut**; tinggi mengikuti isi (halaman yang menggulir); body `grow` supaya panel yang lebih pendek terisi rapi saat grid menyamakan tingginya (M14); footer opsional. Dipakai Worksheet & CaptionSheet. |
| `Header` | Title bar terminal: indikator fosfor + wordmark glow, segmen platform (`aria-pressed`, pelat aktif glow-soft), ThemeToggle, readout status mono bergaya prompt `❯`, ditutup garis tipis `--accent-faint`. |
| `ProviderPanel` | Pilih provider, API key (lihat/sembunyikan), `Tes koneksi` (outline aksen) + badge bracket `role="status"`, catatan limit. |
| `Worksheet` | Dropzone (dashed, radius 6px), grid frame (tile: pilih — border aksen + glow-soft, hapus, **ikon buat ulang per tile** — merah untuk frame gagal), tema batch, jeda antar foto, Generate (solid aksen + glow)/Batalkan + Buat ulang semua, ProgressBar (`aria-live`, radius 4px), Coba lagi. |
| `CaptionSheet` | Field edit per platform (penghitung menempel di dalam kotak), KeywordEditor (chip), kotak error `--fail-wash`, strip status bracket, footer Export CSV — **tanpa tombol buat ulang** (pindah ke tile). **M14: struktur field selalu dirender** dan hanya nonaktif sampai ada frame terpilih. |
| `KeywordEditor` | Chip kata kunci + input (Enter/koma/tempel) + satu tombol salin daftar; daftar chip dibatasi `12.5rem` + scroll vertikal (**satu-satunya scroll internal**, `overflow-x-hidden` — M15); penghitung `0/50` menempel di kotak input. |
| `CopyButton`, `ThemeToggle` | Kontrol kecil berlabel ARIA, radius 4px. |

## Layout & responsif (M15)

- **Satu dokumen, satu scroll** (M12): tidak ada tinggi dikunci ke viewport — semua elemen
  tingginya = isi.
- **≥1024px**: `main` = dua kolom `3fr / 2fr` dengan `items-stretch` → Worksheet & CaptionSheet
  sama tinggi.
- **Grid thumbnail**: `auto-fill minmax(9.375rem,1fr)` sebagai dasar, dikunci **`min-[1120px]:grid-cols-5`**
  (bukan `lg`) — 20 frame pas menjadi 4 baris × 5 kolom penuh. Ambang 1120px dihitung dari
  geometri tile: pada V ≥1024 lebar tile = `0,12V − 20,56px`; badge nomor berakhir di 28px dari
  kiri, bayangan klik ikon regen mulai di 82px dari kanan → baru aman saat lebar dalam ≥110px
  (V ≈1105px). Dengan ambang 1120px tersisa ≈1,9px, sehingga di seluruh rentang **1024–1920px
  tidak ada tumpang tindih**; di bawah 1120px tetap auto-fill (2–4 kolom).
- **Satuan relatif**: spasi & lebar memakai rem / % / fr — `minmax(9.375rem,1fr)` (grid),
  `max-h-[12.5rem]` (chip), `top-[2.625rem]` (popover). Ukuran font tetap px sebagai **skala
  tipografi yang disengaja**.
- **Uji rentang (analisis statis, tanpa server)**: lebar 360px → >1920px dan zoom 50–150% —
  grid `auto-fill` menambah/mengurangi kolom, `lg` menumpuk jadi satu kolom pada zoom tinggi/
  layar sempit, footer & konfirmasi memakai `flex-wrap`, nama file/chip `truncate`.

## Aksesibilitas (lantai mutu)

- Focus ring global `2px --focus` + offset 2px (`:focus-visible`), di kedua mode; isian saat
  fokus juga dapat glow tipis (mode gelap saja).
- Semua input punya `<label for>`; tombol ikon punya `aria-label` + `title`.
- `prefers-reduced-motion`: animasi (spinner) dimatikan; glow statis sehingga tidak perlu
  dimatikan; **transisi warna/lebar tetap** — itu umpan balik state, bukan dekorasi.
- Target sentuh ≥ 40px di layar kecil (`<1024px`) lewat satu blok CSS; tombol ikon ringkas
  (`.btn-compact`) memakai area klik pseudo-element agar tidak membesar visual.
- Status hidup: progress bar, notice batch, hasil tes koneksi, dan pesan dilewati chip
  memakai `aria-live`/`role="status"`; bracket badge tidak mengubah teks yang dibacakan.
- Semua teks terpotong (nama file, chip panjang) punya `title` tooltip.

## Keputusan sadar M15

- **Titik traffic-light (merah/kuning/hijau) di header tidak dipakai** — menambah dua warna
  di luar palet status di baris yang sama dengan brand; sebagai gantinya header ditutup garis
  tipis `--accent-faint` (title bar) dan readout memakai glyph prompt `❯`.
- **`--fail` tetap merah** meski palet aksen hijau: merah = gagal adalah konvensi yang tidak
  boleh dikorbankan demi keseragaman warna.
- `docs/AUDIT.md` sengaja dibiarkan tanpa nilai warna hard-coded (dokumen audit masa lalu).
- Verifikasi: `impeccable detect src` → **0 temuan** (exit 0).
