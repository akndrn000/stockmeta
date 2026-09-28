// Panel layar penuh: header (judul + readout meta mono + aksi opsional) + body scroll sendiri
// + footer opsional di luar area scroll (mis. tombol Export CSV).
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
      className={`flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line bg-surface shadow-panel ${className}`}
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
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
    </section>
  );
}
