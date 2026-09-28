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
    <header className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 pt-3">
        {/* Brand: satu-satunya pemakaian merah sebagai identitas di luar tombol commit */}
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-[3px] bg-accent ring-2 ring-accent-wash"
          />
          <h1 className="text-lg font-extrabold tracking-[-0.03em] text-accent-text">
            StockMeta
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          {/* Segmented platform: pelat aktif dibalik per mode (dark: putih, light: gelap) */}
          <div
            role="group"
            aria-label="Platform"
            title={disabled ? 'Batch berjalan — ganti platform setelah selesai' : undefined}
            className="inline-flex items-center gap-0.5 rounded-full border border-line bg-well p-1"
          >
            {PLATFORM_IDS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                disabled={disabled}
                onClick={() => setPlatform(p)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  platform === p
                    ? 'bg-plate text-plate-ink'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Readout mesin gaya legacy: pemisah slash, mono, uppercase, di bawah brand */}
      <p className="px-4 pb-2.5 pt-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {pad2(frames.length)} frame / {PLATFORM_LABELS[platform]} /{' '}
        {PROVIDER_LABELS[provider]} / {STATUS_LABELS[status]}
      </p>
    </header>
  );
}
