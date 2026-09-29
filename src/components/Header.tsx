'use client';
import type { ConnectionStatus, Platform, ProviderId } from '../lib/types';
import { PROVIDER_LABELS, STATUS_LABELS } from '../hooks/useProvider';
import type { useSession } from '../hooks/useSession';
import { ThemeToggle } from './ThemeToggle';

const PLATFORM_LABELS: Record<Platform, string> = {
  adobe: 'Adobe Stock',
  shutterstock: 'Shutterstock'
};
const PLATFORM_IDS: readonly Platform[] = ['adobe', 'shutterstock'];
const pad2 = (n: number) => String(n).padStart(2, '0');

export function Header({
  provider,
  status,
  session,
  disabled
}: {
  provider: ProviderId;
  status: ConnectionStatus;
  session: ReturnType<typeof useSession>;
  /** true saat batch berjalan — platform terkunci */
  disabled?: boolean;
}) {
  const { platform, frames, setPlatform } = session;

  return (
    // M15: header bergaya title bar terminal — dua garis tipis di bawah (hairline aksen pudar
    // + border), label mono kecil bergaya prompt. M17: glow wordmark dihapus (glow hanya
    // tombol utama); header memakai --bg-secondary sebagai chrome di atas badan panel.
    // M16 (skala spasi): ritme blok header = 12px atas → 8px → readout → 8px → hairline.
    // Semua gap di sini kelipatan {4, 6, 8, 12, 16} (tidak ada 10px).
    <header className="border-b border-border bg-bg-secondary">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3">
        {/* Brand: indikator fosfor + wordmark hijau — satu-satunya aksen utama (M15) */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="glow h-3.5 w-3.5 rounded-[0.1875rem] bg-accent"
          />
          <h1 className="text-brand font-extrabold tracking-[-0.03em] text-accent-text">
            StockMeta
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Segmented platform: pelat aktif = aksen fosfor dengan glow tipis (mode siang: solid) */}
          <div
            role="group"
            aria-label="Platform"
            title={disabled ? 'Batch berjalan — ganti platform setelah selesai' : undefined}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated p-1"
          >
            {PLATFORM_IDS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                disabled={disabled}
                onClick={() => setPlatform(p)}
                className={`rounded px-3 py-1.5 text-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  platform === p
                    ? 'bg-accent text-accent-contrast'
                    : 'text-text-secondary hover:bg-accent-tint hover:text-text'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Readout mesin gaya terminal: prompt ❯, pemisah slash, mono, uppercase.
          Pemisah dibuat aria-hidden agar pembaca layar membaca teksnya tanpa "garis miring";
          status diberi warna status (sukses/perlu perhatian) supaya terbaca sekilas. */}
      <p className="flex flex-wrap items-center gap-x-2 px-4 pb-2 pt-2 font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
        <span aria-hidden="true" className="text-accent-text">
          {'\u276F\u00A0'}
        </span>
        <span>{pad2(frames.length)} frame</span>
        <span aria-hidden="true" className="text-accent-faint">
          /
        </span>
        <span>{PLATFORM_LABELS[platform]}</span>
        <span aria-hidden="true" className="text-accent-faint">
          /
        </span>
        <span>{PROVIDER_LABELS[provider]}</span>
        <span aria-hidden="true" className="text-accent-faint">
          /
        </span>
        <span
          className={
            status === 'ok'
              ? 'text-success'
              : status === 'fail'
                ? 'text-error'
                : status === 'testing'
                  ? 'text-accent-text'
                  : 'text-text-muted'
          }
        >
          {STATUS_LABELS[status]}
        </span>
      </p>

      {/* M15: garis tipis kedua tepat di bawah header — meniru tepi title bar terminal
          (tanpa titik traffic-light: tiga warna dot akan menambah aksen di luar palet) */}
      <div aria-hidden="true" className="h-px bg-accent-faint" />
    </header>
  );
}
