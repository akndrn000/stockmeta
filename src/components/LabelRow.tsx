'use client';
// Baris label field: label di kiri, keterangan (penghitung/status) + tombol salin di kanan.
// Satu tempat untuk pola yang sebelumnya diduplikasi di Field (CaptionSheet) dan KeywordEditor —
// flex-wrap + ml-auto bila layar sempit: grup kanan turun ke baris kedua dan tetap rata kanan.
import type { ReactNode } from 'react';

export function LabelRow({ id, label, right, fill }: {
  /** id input yang dilabeli (untuk htmlFor) */
  id?: string;
  label: string;
  /** isi grup kanan; undefined = tidak ada (label saja, tanpa ruang kosong) */
  right?: ReactNode;
  /** true → baris ikut mengisi tinggi field (dipakai saat dua field berdampingan) */
  fill?: boolean;
}) {
  return (
    <div
      className={`flex min-h-7 flex-nowrap items-center justify-between gap-x-2 ${fill ? 'flex-1' : ''}`}
    >
      <label htmlFor={id} className="min-w-0 flex-1 whitespace-nowrap text-meta font-semibold uppercase tracking-[0.06em] text-text-muted overflow-hidden text-ellipsis">
        {label}
      </label>
      {right !== undefined && <span className="ml-auto flex shrink-0 items-center gap-1.5">{right}</span>}
    </div>
  );
}
