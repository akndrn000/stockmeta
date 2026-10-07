# DESIGN.md — Sistem desain StockMeta "Phosphor"

Sumber kebenaran: `src/app/globals.css` (token) + komponen di `src/components/`.
Dokumen ini catatan; kalau code dan dokumen beda, code menang.

Tema M17: **modern professional SaaS dashboard, terminal-inspired** — latar hijau-gelap,
satu aksen hijau untuk elemen aktif/interaktif, border tipis hijau gelap, mono di seluruh
halaman, badge bergaya bracket `[ … ]`, glow **hanya** tombol utama. Palet warna ditetapkan
ulang di M17 (bagian "Token warna" di bawah adalah sumber kebenaran; token M15/M16 sudah
dihapus, tidak ada dua sistem token berjalan bersama). M16 menetapkan **tiga skala**
(border, ukuran font, spasi) yang mengikat seluruh komponen — lihat bagian "Skala M16".

## Token warna — "Phosphor" (palet M17)

Satu skema warna untuk seluruh halaman, dua mode. Pergantian `data-theme` di `<html>`
mengganti seluruh halaman sekaligus (dibaca script anti-flash di `layout.tsx`).
Komponen **hanya** memakai token lewat utilitas Tailwind (`bg-surface`, `text-text`, …) —
tanpa warna hard-coded di komponen.

### Palet inti mode gelap (diberikan M17)

| Token | Utilitas | Nilai | Peran |
| --- | --- | --- | --- |
| `--bg` | `bg-bg` | `#050907` | Latar halaman |
| `--bg-secondary` | `bg-bg-secondary` | `#090f0b` | Chrome (Header, ProviderPanel, dropzone kosong) |
| `--surface` | `bg-surface` | `#0b120d` | Panel/tile/badan dokumen |
| `--surface-elevated` | `bg-surface-elevated` | `#101a13` | Isian, popover, kotak saran |
| `--border` | `border-border` | `#35794e` | Garis struktur hijau (hairline) — ≥3:1 di kedua mode; mode terang `#35855a` (M29) |
| `--border-strong` | `border-border-strong` | `#3a7c51` | Batas lebih tegas: badge netral, hover sekunder (mode terang `#2e7a4e`) (M29) |
| `--border-control` | `border-border-control` | `#47955f` | **Batas elemen interaktif** (input/textarea/select/button) — ≥3:1 terhadap semua permukaan (SC 1.4.11); mode terang `#2f6e49` (M29) |
| `--accent` | `bg-accent`, `border-accent` | `#20e875` | Hijau fosfor — isian tombol utama & elemen menyala |
| `--accent-hover` | `bg-accent-hover` | `#35f58a` | Hover tombol aksen |
| `--text` | `text-text` | `#e8f2eb` | Teks utama |
| `--text-secondary` | `text-text-secondary` | `#a0b5a6` | Teks sekunder |
| `--text-muted` | `text-text-muted` | `#718578` | Label/hint/readout (≥4.5:1 di permukaan polos) |
| `--warning` | `text-warning` | `#f4c84b` | Peringatan (counter ≥60% kuota, `min 5`) |
| `--error` | `text-error` | `#f06464` | Status gagal & pesan error |
| `--success` | `text-success` | `#35d98a` | Status siap/aktif (hijau — keputusan M17) |

### Turunan (dari palet inti — keluarga aksen tunggal & status)

| Token | Utilitas | Peran |
| --- | --- | --- |
| `--accent-text` | `text-accent-text` | Teks/ikon aksen (wordmark, prompt, badge menguji) |
| `--accent-faint` | `bg-accent-faint` | Hairline pudar di bawah Header |
| `--accent-tint` | `bg-accent-tint` | Hover netral lembut, badge menguji, tile terpilih |
| `--accent-contrast` | `text-accent-contrast` | Teks di atas isian aksen (tombol utama, segmen aktif) |
| `--success-tint` / `--warning-tint` / `--error-tint` | `bg-*-tint` | Latar badge/kotak status & tombol merah saat hover |
| `--error-contrast` | `text-error-contrast` | Teks di atas isian merah (`Ya, timpa`) |
| `--focus` | outline | Focus ring keyboard |
| `--glow` | `.glow` | **Hanya** tombol utama `Buat metadata` + titik brand |

Mode terang adalah turunan palet yang sama: latar terang (`#f0f3f1`/`#e7ece9`/`#fafcfb`/
`#ffffff`), teks gelap (`#0e1a13`/`#3b4c43`/`#5a6c61`), aksen hijau jenuh `#0b7a41`
(`--accent-contrast` putih), status `#0b6b3f`/`#8a5a00`/`#b3261e`, tanpa glow.

Aturan kontras: teks normal ≥ **4.5:1** — diuji terhadap `--bg`, `--bg-secondary`,
`--surface`, `--surface-elevated` dan latar tint yang sudah di-composite. Titik terketat:
`--text-muted` di atas `--surface-elevated` = **4,52:1** dan di atas tint ≈ 4,0:1 — karena
itu teks pendukung yang bisa muncul di atas tint (sub-line dropzone saat drag-over) memakai
`--text-secondary`, bukan `--text-muted`.

### Glow (hanya mode gelap, hanya tombol utama)

Glow adalah **shadow statis**, bukan animasi — aman bagi `prefers-reduced-motion` dan tidak
pernah berdenyut. M17 membuang `--glow-soft`, `--glow-text`, `--glow-input`, `--glow-ok`:
yang tersisa `--glow` untuk tombol `Buat metadata` dan titik brand; elemen lain memakai
isian/border aksen yang bersih. Mode terang menyetel `--glow: none`.
Utilitas `.glow` (kelas CSS biasa di `globals.css`, di luar layer).

## Aksen tunggal

**Hijau fosfor (`--accent`) adalah satu-satunya aksen.** Dipakai hanya untuk:

1. Tombol commit (`Buat metadata`) — isian penuh + `--accent-contrast` + glow.
2. Elemen **aktif**: segmen platform terpilih, tile frame terpilih, isian saat fokus,
   hover border isian (`accent/60`).
3. Identitas brand (indikator fosfor + wordmark `StockMeta`).

Sinyal status memakai warnanya sendiri, **di luar** aksen: `--success` **hijau**
(SIAP, badge Aktif — keputusan M17: status positif = hijau, sejalan aksen), `--error` merah
(GAGAL, pesan error), `--warning` amber (peringatan counter). Tidak ada aksen kedua
(biru/ungu); hijau status, merah & amber hanya membaca status, bukan dekorasi. Badge status
memakai tint + kotak `border-2` (tiga tempat: ProviderPanel, tile, strip CaptionSheet —
lihat "Badge bracket"); badge meta kecil memakai teks polos tanpa kotak.

## Radius

Skala dua tingkat, tanpa nilai aneh:

- **Kontrol** (tombol, input, select, textarea, chip, badge, tombol ikon): `rounded` = 4px.
- **Kontainer** (panel, tile frame, popover, dropzone, kotak konfirmasi, kotak error,
  segmen platform): `rounded-md` = 6px.
- Hindari `rounded-sm` (2px, di bawah ambang 3px) dan `rounded-full`; pengecualian titik kecil
  non-teks (dot brand `rounded-[0.1875rem]`, thumb scrollbar 3px).

## Tipografi

- **JetBrains Mono** (`--font-jetbrains` via `next/font`) adalah **satu-satunya font** untuk
  body maupun heading — hierarki dibentuk dari ukuran, bobot, dan warna, bukan dari font
  kedua (Archivo & Courier Prime dibuang di M15). `--font-sans` dan `--font-mono` menunjuk
  font yang sama.
- Skala ukuran font: **lima tingkat** `meta 11 / small 13 / body 14 / title 16 / brand 20` —
  daftar peran lengkap di "Skala M16 → 2. Ukuran font".
- Aksen tracking: wordmark `-0.03em`, judul panel `-0.015em`, label `0.01em`, badge/readout
  mono uppercase `0.08em`; tidak ada tracking di bawah `-0.04em`.
- Angka/readout memakai `font-mono` eksplisit agar niat "data = mono" tetap terbaca walau
  seluruh halaman sudah mono.

## Skala M16

Tiga skala berikut **mengikat semua komponen** — komponen baru wajib memakai nilai di daftar,
bukan nilai baru.

### 1. Border — hanya DUA ketebalan

| Nilai | Dipakai untuk |
| --- | --- |
| **1px** (`border`, `border-b`) | Semua elemen biasa: panel, tile idle, isian, tombol sekunder, chip, hairline. |
| **2px** (`border-2`) | Elemen **menyala / ditekankan**: tile terpilih, tombol utama `Buat metadata`, badge status (ProviderPanel, tile Worksheet, strip CaptionSheet), kotak error `role="alert"`, dropzone kosong (`border-2 border-dashed`), **isian saat fokus**. |

- **Isian fokus** = `border-color: --accent` + `box-shadow: inset 0 0 0 1px var(--accent)` —
  1px border + 1px ring inset menghasilkan garis 2px **tanpa mengubah `border-width`**,
  sehingga input ber-height auto tidak bertambah tinggi (tidak ada layout shift pindah field).
- State sementara (hover, drag-over, tombol armed `Yakin? Klik lagi`) = **perubahan warna saja**,
  tidak pernah mengubah ketebalan garis. Hover isian memakai `hover:border-accent/60` —
  terlihat, tapi tetap lebih tenang daripada fokus (garis aksen penuh + ring).
- Garis berwarna status (`--success`, `--error`) hanya pada elemen status/aktif; sisanya
  `border-border` (struktur non-interaktif: pemisah panel, hairline, kotak konfirmasi,
  chip, progress track) atau `border-border-control` (batas `input`/`textarea`/`select`/
  `button` — ≥3:1 terhadap semua permukaan tempat kontrol duduk; M17b).
  `--border-strong` hanya untuk badge netral & aksen hover sekunder.

### 2. Ukuran font — lima tingkat

Token di `@theme` (`globals.css`), peran bukan angka:

| Token | Ukuran | Peran contoh |
| --- | --- | --- |
| `text-meta` | 11px | Label field, counter (`0/50`, `45/70`), badge mono, readout header, nama model, label progress |
| `text-small` | 13px | Hint di bawah field, nama file tile/strip, chip kata kunci, catatan provider, pesan notice/limit |
| `text-body` | 14px | Nilai isian, teks semua tombol, teks dropzone, pesan error, prompt popover |
| `text-title` | 16px | Judul panel (`Panel`) |
| `text-brand` | 20px | Wordmark `StockMeta` |

- Tidak ada lagi `text-[NNpx]` hard-coded maupun `text-xs/sm/lg` bawaan Tailwind di komponen.
- Placeholder memakai **ukuran yang sama dengan nilai input** (`text-body`) + warna `--text-muted` —
  ukuran beda membuat teks "melompat" saat pengguna mulai mengetik.

### 3. Spasi — {4, 6, 8, 12, 16, 24}px

Pemakaian (dalam satuan Tailwind `1 = 4px`):

| Nilai | Peran |
| --- | --- |
| 4px (`gap-1`) | Pasangan mikro dalam satu butir (nama file ↔ catatan, chip ↔ tombol hapus) |
| 6px (`gap-1.5`, `p-1.5`) | Grup rapat label → kontrol; padding chip/badge kecil |
| 8px (`gap-2`, `py-2`, `pt/pb-2`) | Antar butir sejajar (baris tombol, grup header), ritme dalam blok |
| 12px (`gap-3`, `p-3`, `px-3/4 py-3`) | Antar elemen dalam satu komponen; padding band (Header, ProviderPanel) |
| 16px (`gap-4`, `p-4`) | Antar blok/bidang (antar-field CaptionSheet, isi panel, `main`) |
| 24px (`px-6`, `py-6`) | Ruang lega dropzone (reserve penghitung textarea dihapus — M18) |

- **Tidak ada** nilai 10px (`gap-2.5`, `py-2.5`, `pb-2.5`) — semuanya digeser ke 8px atau 12px.
  Pengganti `py-2.5` pada tombol besar = `py-2` (tinggi efektif ≈40px termasuk border).
- Reserve fungsional (bukan skala): `pr-8` (panah select), `pr-10` (tombol lihat key) —
  ruang yang sengaja dikosongkan agar tidak tertimpa. `pr-24` (penghitung keyword) **dihapus
  oleh M18**: penghitung keluar dari kotak dan pindah ke baris label.
- Offset posisi menempel pada skala yang sama (6px `1.5`, 12px `3`, 48px `12` untuk ikon tile).

## Badge bracket

Dua keluarga badge, dibedakan peran — bukan per selera:

- **Badge status** (bracket + kotak): `AKTIF`, `SIAP`, `GAGAL`, `MENUNGGU/PROSES` di
  ProviderPanel, tile Worksheet, dan strip CaptionSheet. Kotak `border-2` (status = elemen
  ditekankan), warna `--success`/`--error`, label netral memakai `border-dashed border-border-strong`
  (sama dengan badge provider saat idle). Bracket `[` `]` ditambahkan `::before`/`::after`
  lewat `.badge-bracket` — **teks asli tetap ada di DOM**, jadi pembaca layar dan tes tetap
  membaca `Aktif`/`SIAP`, tanpa label ganda.
- **Badge meta kecil** = teks polos **tanpa kotak**: penghitung `0/50`, `min 5`, `penuh`,
  nomor frame `01` (boleh memakai `bg-surface/85` demi keterbacaan di atas thumbnail),
  nama model, petunjuk `upload ulang`. Karena tanpa border, ukuran fontnya `text-meta`
  seperti label lain — tidak ada badge kecil yang justru lebih besar dari labelnya.

## Komponen utama

| Komponen | Peran |
| --- | --- |
| `Panel` | Wadah standar: judul + meta mono + aksi; radius 6px, hairline hijau, **tanpa bayangan lembut**; tinggi mengikuti isi (halaman yang menggulir); body `grow` supaya panel yang lebih pendek terisi rapi saat grid menyamakan tingginya (M14); footer opsional. Dipakai Worksheet & CaptionSheet. |
| `Header` | Title bar terminal: indikator fosfor + wordmark (tanpa glow — M17), segmen platform (`aria-pressed`, pelat aktif isian aksen), ThemeToggle, readout status mono bergaya prompt "❯" — pemisah `/` `aria-hidden`, status berwarna (`--success`/`--error`/`--accent-text`), ditutup garis tipis `--accent-faint`. Band `bg-bg-secondary`. |
| `ProviderPanel` | Band `bg-bg-secondary`: pilih provider, API key (lihat/sembunyikan), `Tes koneksi` (outline aksen, `h-10`) + badge bracket `role="status"` berisi titik indikator warna (sukses/gagal/menguji/idle), catatan limit `text-muted`. |
| `Worksheet` | Dropzone kosong (dashed `border-border-control` + `bg-bg-secondary` + ikon unggah), grid frame (tile: pilih — border aksen 2px + tint, tanpa glow; badge status `MENUNGGU`/`SIAP`/`GAGAL`, hapus, **ikon buat ulang per tile** — merah untuk frame gagal), tema batch, jeda antar foto, Generate (solid aksen + glow, `h-11`)/Batalkan (merah) + Buat ulang semua, ProgressBar (`aria-live`, radius 4px), Coba lagi. |
| `CaptionSheet` | Field edit per platform (penghitung **sebaris dengan label** di atas kotak — M18; nada warna netral → `--warning` ≥60% kuota → `--error` lewat batas, dirujuk `aria-describedby`), KeywordEditor (chip), kotak error `bg-error-tint border-error`, strip status bracket, footer Export CSV (jumlah baris `text-secondary`) — **tanpa tombol buat ulang** (pindah ke tile). **M14: struktur field selalu dirender** dan hanya nonaktif sampai ada frame terpilih. |
| `KeywordEditor` | Chip kata kunci + input (Enter/koma/tempel) + satu tombol salin daftar; daftar chip dibatasi `12.5rem` + scroll vertikal (**satu-satunya scroll internal**, `overflow-x-hidden` — M15); penghitung `0/50` sebaris dengan label (grup `#kw-count` di kiri tombol salin — M18). |
| `CopyButton`, `ThemeToggle` | Kontrol kecil berlabel ARIA, radius 4px. |

## Layout & responsif (M15)

- **Satu dokumen, satu scroll** (M12): tidak ada tinggi dikunci ke viewport — semua elemen
  tingginya = isi.
- **≥1120px**: `main` = dua kolom `minmax(0,1.4fr) / minmax(24rem,1fr)` (M19: ambang naik
  dari `lg`/1024 ke 1120 agar satu sistem dengan grid thumbnail & header lengket);
  kolom caption `sticky top-28`, `items-start` (tinggi kartu = isi). Di bawah 1120px
  panel menumpuk satu kolom.
- **Grid thumbnail**: `auto-fill minmax(9.375rem,1fr)` sebagai dasar, dikunci **`min-[1120px]:grid-cols-5`**
  (bukan `lg`) — 20 frame pas menjadi 4 baris × 5 kolom penuh. Ambang 1120px dihitung dari
  geometri tile; setelah M16 gap grid memakai skala spasi (8px), lebar tile = `0,12V − 18,96px`.
  Titik tabrakan: badge nomor di kiri atas (6px + 21,2px = 27,2px, `text-meta` tanpa kotak)
  vs bayangan klik ikon regen di kanan (mulai 82px dari kanan) → aman bila lebar dalam ≥109,2px,
  yaitu **V ≥1068px**. Dengan ambang 1120px tersisa ≈6,2px, sehingga di seluruh rentang
  **1024–1920px tidak ada tumpang tindih**; di bawah 1120px tetap auto-fill (2–4 kolom).
- **Satuan relatif**: spasi & lebar memakai rem / % / fr — `minmax(9.375rem,1fr)` (grid),
  `max-h-[12.5rem]` (chip), `top-[2.625rem]` (popover). Ukuran font tetap px sebagai **skala
  tipografi yang disengaja**.
- **Uji rentang (analisis statis, tanpa server)**: lebar 360px → >1920px dan zoom 50–150% —
  grid `auto-fill` menambah/mengurangi kolom, `lg` menumpuk jadi satu kolom pada zoom tinggi/
  layar sempit, footer & konfirmasi memakai `flex-wrap`, nama file/chip `truncate`.

## Aksesibilitas (lantai mutu)

- Focus ring global `2px --focus` + offset 2px (`:focus-visible`), di kedua mode; isian saat
  fokus menampilkan garis 2px aksen (1px border + 1px ring inset), tanpa glow — komposisi
  ini tidak mengubah tinggi isian (lihat "Skala M16 → 1. Border").
- Semua input punya `<label for>`; tombol ikon punya `aria-label` + `title`.
- `prefers-reduced-motion`: animasi (spinner) dimatikan; glow statis sehingga tidak perlu
  dimatikan; **transisi warna/lebar tetap** — itu umpan balik state, bukan dekorasi.
- Target sentuh ≥ 40px di layar kecil (`<1024px`) lewat satu blok CSS; tombol ikon ringkas
  (`.btn-compact`) memakai area klik pseudo-element agar tidak membesar visual.
- Status hidup: progress bar, notice batch, hasil tes koneksi, dan pesan dilewati chip
  memakai `aria-live`/`role="status"`; bracket badge tidak mengubah teks yang dibacakan.
- Semua teks terpotong (nama file, chip panjang) punya `title` tooltip.
- Kontras diukur terhadap permukaan TINT yang sudah di-composite (bukan hanya latar polos):
  sub-line dropzone memakai `--text-secondary` supaya tetap ≥4,5:1 saat drag-over mengubah
  latarnya ke `--accent-tint` (lihat catatan di bagian Token warna).

## Breakpoint & audit responsif (acuan resmi, M27)

Tabel ambang yang mengikat (semua terverifikasi nol-overflow di 360–1920px × 2 mode):

| Rentang | Kolom `main` | Provider | Grid thumbnail | Header |
| --- | --- | --- | --- | --- |
| <640px (mobile) | 1 kolom, rapat (`gap-3`, `py-3`) | `<select>` (`lg:hidden`) | `auto-fill minmax(7.5rem,1fr)` | tidak lengket, toggle `grid-cols-2` |
| 640–1023px (tablet) | 1 kolom | `<select>` | auto-fill | tidak lengket |
| 1024–1119px | 1 kolom | grid 2×2 | auto-fill | tidak lengket |
| ≥1120px (desktop) | 2 kolom `minmax(0,1.4fr)/minmax(24rem,1fr)`, caption `sticky` | `inline-flex` 1 baris | **kunci 5 kolom** (`min-[1120px]:grid-cols-5`, clearance M15b) | `sticky top-0` |

Aturan audit (cara M25/M27 memverifikasi, wajib diulang tiap mengubah responsif):

1. `scrollWidth === innerWidth` di tiap lebar × mode (desktop boleh `−10px` =
   scrollbar vertikal); nol elemen `right > viewport` di luar scroll-container sengaja.
2. Target sentuh ≥40px di <640px: tombol/isian via blok `min-height` CSS; elemen
   ringkas (`.btn-compact`, checkbox) via area pseudo/padding tak terlihat yang
   dikompensasi margin — tidak boleh menggeser layout; pengecualian input
   `min-height` global hanya via `min-h-4!` bila hit area sudah dijamin pembungkus.
3. Font teks bermakna ≥12px (`text-meta` clamp), isian/select/textarea 16px
   (anti auto-zoom iOS — blok CSS, jangan di-override Tailwind).
4. `flex` arah-baris tanpa `wrap` yang berisi >2 item = kandidat overflow; arah-kolom
   tidak dihitung. `truncate` aman (overflow hidden → minimum flex 0).
5. Scorecard desktop 1440px (header 1440×65, worksheet 797×437, kolom caption
  569×579, h1 20px, dropzone 176px, generate 44px) harus identik sebelum/sesudah.

## Keputusan sadar M15

- **Titik traffic-light (merah/kuning/hijau) di header tidak dipakai** — menambah dua warna
  di luar palet status di baris yang sama dengan brand; sebagai gantinya header ditutup garis
  tipis `--accent-faint` (title bar) dan readout memakai glyph prompt `❯`.
- **Status gagal tetap merah** (`--error`, dulu `--fail`) meski palet aksen hijau: merah = gagal adalah konvensi yang tidak
  boleh dikorbankan demi keseragaman warna.
- `docs/AUDIT.md` sengaja dibiarkan tanpa nilai warna hard-coded (dokumen audit masa lalu).
- Verifikasi: `impeccable detect src` → **0 temuan** (exit 0).

## Keputusan sadar M16

- **M16 = konsistensi visual murni** — struktur HTML, perilaku, dan teks sama sekali tidak
  disentuh; perubahan hanya kelas styling + token CSS (daftar file di `MIGRATION.md` M16).
- **Fokus isian diberi garis 2px lewat ring inset**, bukan `border-width: 2px` — aturan lantai
  "state sementara tidak boleh mengubah geometri": menaikkan border akan menambah tinggi
  input ber-height auto tiap pindah field.
- **Tombol utama `Buat metadata` memakai `border-2 border-accent`** (se-warna isian fill):
  ambang "garis 2px" tercapai tanpa membuat tombol terlihat berbingkai, dan `py-2.5 → py-2`
  mengimbangi tingginya (≈40px, tetap memenuhi target sentuh).
- **Badge meta kecil dilepas kotaknya** — lima gaya kotak berbeda untuk label seukuran 10–11px
  adalah kebisingan; tanpa border, labelnya pun bisa ikut skala `text-meta` sehingga tidak ada
  badge yang lebih besar dari labelnya sendiri. Kotak hanya dipertahankan untuk **status**.
- Gap grid 10px → 8px menggeser geometri tile (`0,12V − 18,96px`) — matematika ambang
  dihitung ulang (V ≥1068px, sisa ≈6,2px di 1120px) dan ditulis di `Worksheet.tsx` + bagian
  Layout dokumen ini.
- Verifikasi M16: `vitest` **185/185**, `tsc --noEmit` **0**, `eslint` **0**, `next build`
  sukses, `impeccable detect --json src` → **`[]`** (exit 0).


## Keputusan sadar M17

- **Palet diganti utuh, token lama dihapus** — `--raised/--well/--line/--wash/--ink*/
  --fail*/--plate*/--on-*` dan utilitasnya tidak tersisa (tabel palet di atas menggantikan
  M15/M16 sepenuhnya; tidak ada dua sistem token yang berjalan bersama). Pemetaan rinci
  ada di `MIGRATION.md` bagian M17.
- **Status positif = hijau `--success`** (SIAP, badge Aktif) — keputusan desain dari probe:
  hijau terbaca sebagai "berhasil", amber dipertahankan **hanya** sebagai `--warning`
  (counter ≥60%, `min 5`), merah tetap `--error` untuk gagal.
- **Glow hanya tombol utama `Buat metadata`** (+ titik brand). Segmen platform, tile
  terpilih, wordmark, badge, dan fokus isian kini memakai isian/border aksen yang bersih —
  glow-soft/glow-text/glow-input/glow-ok dihapus, `--glow` satu-satunya token glow.
- **Batas kontrol dipisah dari garis struktur (M17b)**: token `--border-control`
  dipakai khusus di kelas input/textarea/select/button sehingga batas elemen interaktif
  mencapai ≥3:1 — kedua peran tidak lagi berbagi satu token.
- **Semua garis wajib hijau terbaca di kedua mode (M29, revisi M17b)**: `--border`
  (`#35794e` gelap / `#35855a` terang), `--border-strong` (`#3a7c51` / `#2e7a4e`),
  `--border-control` (`#47955f` / `#2f6e49`) — hue ≈140–148°, saturasi ≥34% (bukan
  abu-abu), kontras minimum terhadap permukaan terketat masing-masing mode: gelap
  3,39 / 3,55 / 4,86 dan terang 3,78 / 4,38 / 5,10 (diukur WCAG vs `--surface-elevated`).
  Garis semantik `--error`/`--warning` dipertahankan (makna fungsional). `border-transparent`
  hanya sebagai cadangan layout tak terlihat (CopyButton idle) — semua garis yang
  terlihat memakai token hijau atau semantik.
- **Hover isian = `hover:border-accent/60`** (lebih tenang dari fokus penuh), hover kontrol
  netral = `hover:border-border-control` / `bg-accent-tint` (salin: `hover:border-accent/70`);
  `--accent-dim` tidak diperlukan lagi.
- **Semua 4 status frame kini terbaca di tile**: `MENUNGGU` (badge putus-putus netral),
  `MEMPROSES` (overlay spinner), `SIAP`/`GAGAL` (badge warna status).
- **Counter isian memberi nada**: netral `--text-muted` → `--warning` mulai 60% kuota →
  `--error` melewati batas, dirujuk lewat `aria-describedby`.
- Verifikasi M17: `vitest` **185/185**, `tsc --noEmit` **0**, `eslint` **0**, `next build`
  sukses, `impeccable detect --json src` → **`[]`** (exit 0).

## Keputusan sadar M18

- **Keterangan & penghitung keluar dari kotak → sebaris dengan LABEL** — membalik keputusan
  M13 ("menempel di dalam kotak") karena masukan langsung: penghitung memakai ruang yang
  dibutuhkan teks yang diketik, dan `0/70 · TANPA KOMA` lebih cepat ditemukan bila
  berdampingan dengan labelnya. Baris label =
  `flex flex-wrap items-center justify-between gap-x-2 gap-y-1`: **label kiri**, **grup
  kanan** `ml-auto` berisi keterangan + tombol `Salin`; saat layar/zoom sempit grup kanan
  turun ke baris kedua dan **tetap rata kanan**, sehingga tombol salin tidak pernah berpindah
  ke tengah atau meluber.
- **Ruang cadangan ikut dihapus**: `pb-6` (textarea judul & deskripsi) dan `pr-24` (input kata
  kunci) → kotak kembali `py-2` / `px-3` seragam dengan kotak isian lain; pembungkus
  `relative` ketiganya dihapus (`<select>` tetap `relative` — untuk panahnya).
- **`pointer-events-none` tidak diperlukan lagi**: teks yang dulu menumpang di atas kolom
  isian kini berada di luar kotak.
- **Aksesibilitas naik, tidak turun**: penghitung judul & deskripsi tetap dirujuk
  `aria-describedby`; input kata kunci kini punya `aria-describedby="kw-count"` **(baru)**
  karena penghitungnya pindah ke luar kotak.
- **Field tanpa keterangan tidak dipaksakan**: Kategori & Tema tetap hanya label + `Salin` —
  counter hanya muncul bila memang ada kuota (judul, deskripsi, kata kunci).
- Verifikasi M18: `vitest` **188/188**, `tsc --noEmit` **0**, `eslint` **0**, `next build`
  sukses, `impeccable detect --json src` → **`[]`** (exit 0).

## Ikon dan merek

Konsep: **bingkai foto + batang label** — kotak hijau solid berisi bingkai
foto bergaris tebal yang ditembus batang caption di kanan bawah (foto stok +
metadata). Dua bentuk glif, tanpa gradasi/bayangan/teks, garis ≥4 unit di
kanvas 64 — terbaca sampai 16 px. Pemenang dipilih dari render 16–180 px di
bilah gelap/terang (bingkai+label menang atas varian tag-lubang dan monogram S
yang detailnya hilang di 16 px).

| Berkas | Peran |
| --- | --- |
| `src/app/icon.svg` | Sumber kebenaran (hijau `#20e875`, glif `#04120a`) → favicon tab |
| `src/app/favicon.ico` | 16/32/48 px untuk bookmark & browser lama |
| `src/app/apple-icon.png` | 180 px full-bleed (iOS membulatkan sendiri) |
| `public/icon-192.png`, `public/icon-512.png` | Ikon PWA full-bleed |
| `public/icon-maskable-512.png` | Maskable, glif di dalam safe-area 80% |
| `src/app/manifest.ts` | Web manifest (`/manifest.webmanifest`) |
| `src/app/opengraph-image.png` | Pratinjau tautan 1200×630 |
| Header `Header.tsx` | SVG inline 20 px, geometri sama dengan favicon |

Warna ikon memakai token malam (`--accent #20e875`, `--accent-contrast
#04120a`) supaya menyala di bilah gelap maupun terang; `viewport.themeColor`
di `layout.tsx` mengikuti `--bg` tiap mode (`#050907` / `#f0f3f1`).

Ekspor ulang (hanya Pillow, tanpa dep npm baru — modul python `playwright`
tidak tersedia di env ini dan tidak dibutuhkan):

```bash
python scripts/export-icons.py
```

## Motion — lapisan gerak "layar fosfor"

Gerak adalah lapisan presentasi murni: seluruh keyframes + kelas tinggal di
`src/app/globals.css` (modul dalam: antarmuka kecil = nama kelas, implementasi
besar = keyframes), komponen hanya menambah/menukar nama kelas. Tanpa library,
tanpa `src/lib/` tersentuh, tanpa teks/layout/warna/ukuran font/logika berubah.

### Token gerak (di `:root`, satu-satunya angka yang dipakai animasi)

| Token | Nilai | Pakai untuk |
| --- | --- | --- |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Entrance & mikro-interaksi |
| `--ease-soft` | `cubic-bezier(.4,0,.2,1)` | Loop denyut/mengambang |
| `--dur-fast` | `120ms` | Keluar chip, mikro tercepat |
| `--dur-base` | `200ms` | Hover/active, kilat, saran |
| `--dur-enter` | `480ms` | Entrance halaman |

### Daftar animasi (semua HANYA `transform` + `opacity`)

| Kelas | Gerak | Kapan aktif |
| --- | --- | --- |
| `.motion-enter` (`--motion-i` ms, `--enter-y`) | fade + geser 4–12px, `backwards` | Load: header 0ms, brand 80ms, provider 120ms, worksheet 180ms, caption 260ms, footer 340ms |
| `.motion-fade` | fade 160ms | Mount belakangan: Batalkan, empty state caption |
| `.brand-mark::before` | denyut cahaya 0.35→0.9 + skala 1→1.6, 3.2s alternate | Selalu (salah satu dari maks 2 loop idle) |
| `.wordmark::after` | kursor blok kedip 1.1s | Selalu; pseudo (tak terbaca AT); mati di reduced motion |
| `.theme-spin` | putar ikon 180deg, 260ms | Klik tombol tema |
| `html.theme-fade` | transisi warna elemen utama 250ms, lalu dilepas | HANYA klik manual (bukan load/sistem); baca "Tema" di bawah |
| `button:hover/active` | angkat 1px / kembali + skala 0.98 | Semua tombol non-nonaktif; garis hover via outline instan; nonaktif tanpa gerak |
| `.badge-tap` | ketuk 0.92→1.04→1, 260ms | Tiap status koneksi berubah |
| `.badge-dot-live` | denyut dot 3s | Selama badge AKTIF |
| `.spinner` | putar 0.7s | Selama tes koneksi / tombol sibuk (statis di reduced motion) |
| `.upload-float` | melayang ±3px, 4s | Ikon dropzone, hanya saat belum ada frame |
| `.dz-march` | bilah garis berjalan (translateX, periode 16px) + skala 1.005 | Selama dragover |
| `.drop-pulse` | denyut 200ms sekali | Saat file dilepas |
| `.thumb-enter` (`--thumb-i` = min(index,11)) | fade + skala 0.96→1, 220ms, jeda 40ms/item | Tile baru mount (key stabil → tile lama tak mengulang) |
| `.thumb-scan::after` | sapuan vertikal 1.4s | Selama tile MEMPROSES |
| `.tile-tap` + `.badge-flash` | ketuk 260ms + kilat opacity | Transisi menunggu→siap |
| `.tile-shake` | getar ±3px 2 ayunan, 220ms | Transisi →gagal |
| `.tile-leave` | fade + skala 0.96, 160ms lalu unmount | Hapus frame (pencabutan ditunda timeout; logika hapus sama) |
| `.meta-pulse::after` | garis hijau menyala 160ms | Pil counter berubah (`00/20`, `Frame 01/09`) |
| `.btn-shine::after` | kilau translateX 1.6s | Tombol Buat metadata selama memproses |
| `.caption-swap` | cross-fade 0.4→1 + naik 6px, 180ms | HANYA ganti frame (mengetik tak memicu) |
| `.chip-enter` / `.chip-exit` | pop 0.9→1 160ms / keluar 0.9 120ms lalu cabut | Tambah/hapus SATU chip; bulk (ganti frame) tanpa animasi |
| `.copy-pop` | pop ikon 0.6→1.1→1, 260ms | Setelah salin; teks tombol tetap "Salin", "Disalin" via aria-live |
| `.suggest-enter` | fade + turun 6px, 200ms | Kotak saran baru muncul |
| `.export-dip` | ikon turun 3px lalu kembali, 300ms | Setelah Export CSV berhasil |

### Aturan reduced motion (menggantikan klausa lama "transisi warna/lebar tetap")

Blok `@media (prefers-reduced-motion: reduce)` mematikan SEMUA animasi dan
transisi (`animation: none; transition: none`), sehingga
`document.getAnimations()` kosong dan tidak ada gerak saat berinteraksi. Status
tetap jelas karena nilai final langsung ada di DOM (badge berganti teks/warna,
hasil tes via `role="status"`). Spinner menjadi statis. Pengecualian: tidak
ada — semua umpan balik state bersifat instan.

### Batas yang dijaga

- Loop idle bersamaan maks 2 (denyut merek + ikon unggah saat kosong); loop lain
  hanya selama proses (spinner, progres, pindai) dan berhenti saat selesai.
- Entrance `backwards` (bukan `forwards`/`both`) — `forwards` hanya di dua
  animasi keluar yang elemennya langsung dicabut. SSR merender keadaan akhir.
- Pembungkus dekorasi ber-transform memakai `overflow: clip`; tidak ada scroll
  horizontal, CLS ≈ 0, pseudo dekoratif `pointer-events: none`.
- Deviasi tercatat: kursor wordmark 1.1s adalah loop idle ke-3 saat dropzone
  kosong (area 2px, opacity saja); durasi "masuk total ≤700ms" dibaca sebagai
  durasi animasi (480ms) — elemen terakhir selesai ±820ms karena stagger 340ms
  yang dimandatkan; ring fokus tampil instan (aksesibilitas) sementara angkat/
  tekan tombol yang bertransisi; teks tombol salin kini konstan "Salin".

### Tema (disimpan & diterapkan — tidak dirusak lapisan gerak)

Pilihan di `localStorage` (`stockmeta_theme`, via `src/lib/storage.ts`);
skrip inline di `layout.tsx` menerapkan `data-theme` sebelum paint pertama
(anti-flash); `useTheme` menerapkan ulang via effect + mengikuti sistem hanya
bila belum ada override. Lapisan gerak tidak menyentuh alur ini — hanya
menambah `.theme-fade` 250ms di `toggle()` manual.

## Keputusan sadar M29

- **Semua garis/border halaman = hijau di kedua mode** — audit `border-*`/`ring-*` di
  seluruh `src/components`: tidak ada warna hard-coded; semua garis dekoratif lewat
  `--border`/`--border-strong`/`--border-control`/`--accent*`, semua garis makna lewat
  `--success`/`--error`/`--warning`. Token netral lama yang keabu-abuan
  (`#1b3d28`/`#244b32` gelap; `#c7d3cb`/`#a3b4aa`/`#718380` terang — saturasi ≤12%,
  kontras serendah 1,29:1) diganti hijau jenuh (saturasi ≥34%) dengan kontras ≥3:1
  terhadap semua permukaan (daftar angka di "Keputusan sadar M17", butir M29).
- **Mode terang disamakan prinsipnya dengan mode malam** — tiga tingkat hijau berurutan
  (struktur < tegas < kontrol), boleh beda kejenuhan/kecerahan antar mode asal hue tetap
  ≈140–148° dan terbaca jelas sebagai hijau.
- **Semantik dipertahankan**: `border-error`/`border-warning` (termasuk varian `/40`),
  teks status, dan kotak `role="alert"` tidak diubah menjadi hijau.
- Verifikasi M29: ukur kontras WCAG via skrip (bukan perkiraan), screenshot kedua mode,
  `vitest`, `tsc --noEmit`, `eslint`, `next build` sukses.