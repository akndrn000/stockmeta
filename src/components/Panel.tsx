// Panel dokumen: header (judul + readout meta mono + aksi opsional) + body yang tingginya
// mengikuti isi (M11: tanpa scroll internal — halaman yang menggulir) + footer opsional
// (mis. tombol Export CSV). overflow tetap dipertahankan hanya untuk merapikan sudut membulat.
// M14: body `grow` — saat grid menaikkan tinggi panel (lg:items-stretch di page.tsx), panel
// yang lebih pendek terisi rapi: konten tetap di atas, footer menempel di bawah, tanpa scroll.
// M15: radius 6px + border hairline hijau, TANPA bayangan lembut gaya SaaS — glow hanya di
// elemen aktif (bukan di wadah panel).
// Dipakai Worksheet (M6) dan CaptionSheet (M7).
import type { ReactNode } from 'react';

export function Panel({
  title,
  meta,
  actions,
  id,
  footer,
  children,
  className = ''
}: {
  title: string;
  meta: string;
  actions?: ReactNode;
  id?: string;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`flex min-w-0 flex-col scroll-mt-4 overflow-hidden rounded-md border border-line bg-surface min-[1120px]:scroll-mt-40 ${className}`}
    >
      {/* flex-wrap: di lebar sangat sempit (320px) baris aksi pindah ke baris kedua —
          judul & meta tetap utuh, tidak pernah terpotong.
          M19: tinggi minimum seragam untuk KEDUA panel (Lembar kerja & Lembar caption) —
          garis border-b di bawah judul jadi sejajar horizontal antar kolom. Tanpa
          min-height, baris header Worksheet lebih tinggi (tombol "Mulai sesi baru"
          35px = py-1.5 + teks 14×1.5 + border) daripada header CaptionSheet (hanya judul
          + meta ≈24px), jadi garisnya beda ±11px. 60px = py-3 (24) + border-b (1) + 35.
          Di HP / layar sentuh semua tombol dinaikkan ke target 44px (globals.css) →
          tinggi minimum ikut naik ke 69px (24 + 1 + 44) supaya tetap sejajar. Dua varian
          di bawah memakai media YANG SAMA dengan aturan tombol 44px ((max-width:1119px)
          ATAU (pointer:coarse)) supaya tidak ada celah 1px di antaranya.
          M23: padding & judul panel diringkas di <640px (sm: kembali ke desktop). */}
      <div className="flex min-h-15 flex-wrap items-center gap-2 border-b border-line px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 [@media(max-width:1119px)]:min-h-[4.3125rem] pointer-coarse:min-h-[4.3125rem]">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <h2 className="truncate text-body font-bold tracking-[-0.015em] text-accent-text sm:text-title">
            {title}
          </h2>
          {/* meta = readout berbentuk pil (bukan teks telanjang) — angka tabular */}
          <span className="shrink-0 rounded-full border border-line bg-bg-secondary px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.06em] text-accent-text tabular-nums">
            {meta}
          </span>
        </div>
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
      </div>
      <div className="grow p-3 sm:p-4">{children}</div>
      {footer && <div className="border-t border-line px-3 py-2 sm:px-4 sm:py-3">{footer}</div>}
    </section>
  );
}
