'use client';
// Sakelar mode Analisis | Metadata (M29) — gaya segmented control yang sama persis dengan
// toggle platform Adobe Stock/Shutterstock di Header (pelat aktif = aksen fosfor).
// Murni presentasional: mode disimpan page.tsx (persist `stockmeta_mode`).
import type { AppMode } from '../lib/types';

const MODE_LABELS: Record<AppMode, string> = {
  analisis: 'Analisis',
  metadata: 'Metadata'
};
const MODE_IDS: readonly AppMode[] = ['analisis', 'metadata'];

export function ModeToggle({
  mode,
  onChange,
  disabled
}: {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
  /** true saat batch berjalan — mode terkunci */
  disabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Mode"
      title={disabled ? 'Batch berjalan — ganti mode setelah selesai' : undefined}
      className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-surface-elevated p-1 min-[1120px]:inline-flex min-[1120px]:w-auto"
    >
      {MODE_IDS.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          disabled={disabled}
          onClick={() => onChange(m)}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1 text-small font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-3 sm:text-body min-[1120px]:justify-start ${
            mode === m
              ? 'bg-accent text-accent-contrast'
              : 'text-text-secondary hover:bg-accent-tint hover:text-text'
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
