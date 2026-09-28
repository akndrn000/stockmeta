// Panel dokumen: header (judul + readout meta mono + aksi opsional) + body yang tingginya
// mengikuti isi (M11: tanpa scroll internal — halaman yang menggulir) + footer opsional
// (mis. tombol Export CSV). overflow tetap dipertahankan hanya untuk merapikan sudut membulat.
// M14: body `grow` — saat grid menaikkan tinggi panel (lg:items-stretch di page.tsx), panel
// yang lebih pendek terisi rapi: konten tetap di atas, footer menempel di bawah, tanpa scroll.
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
      className={`flex flex-col overflow-hidden rounded-[0.875rem] border border-line bg-surface shadow-panel ${className}`}
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h2 className="truncate text-[15px] font-bold tracking-[-0.015em] text-ink">
            {title}
          </h2>
          <span className="shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
            {meta}
          </span>
        </div>
        {actions && <div className="ml-auto shrink-0">{actions}</div>}
      </div>
      <div className="grow p-4">{children}</div>
      {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
    </section>
  );
}
