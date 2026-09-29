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

// Chip readout: pil netral untuk frame/platform/provider (data & teks sama seperti
// readout terminal sebelumnya — hanya presentation yang berubah jadi chip terpisah).
// shrink-0: baris status di bawah 1120px digulir horizontal, chip tidak boleh gepeng.
const CHIP =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-meta font-medium uppercase tracking-[0.06em] text-text-secondary tabular-nums';

// Baris status koneksi: dot indikator warna — abu = belum dites, hijau = terhubung,
// merah = gagal, aksen = sedang menguji (teks & sumber datanya tidak berubah).
const STATUS_CHIP: Record<ConnectionStatus, string> = {
  ok: 'border-success/40 bg-success-tint text-success',
  fail: 'border-error/40 bg-error-tint text-error',
  testing: 'border-accent/40 bg-accent-tint text-accent-text',
  idle: 'border-border bg-surface text-text-secondary'
};
const STATUS_DOT: Record<ConnectionStatus, string> = {
  ok: 'bg-success',
  fail: 'bg-error',
  testing: 'bg-accent',
  idle: 'bg-text-muted'
};

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
    // M19: lengket HANYA di ≥1120px — di bawah itu header menggulir bersama halaman
    // (ruang vertikal HP tidak terpotong). Container `.shell` dipakai juga ProviderPanel
    // dan main, sehingga tepi kiri/kanan semuanya sejajar.
    // <1120px: baris 1 = logo + toggle tema (kanan); baris 2 = segmented platform
    // selebar penuh, 2 kolom sama lebar, tinggi minimum 44px. Susunan baris diatur lewat
    // `order` + `w-full` responsif — satu DOM, tanpa duplikasi markup.
    <header className="z-40 border-b border-border bg-bg-secondary/85 backdrop-blur-md min-[1120px]:sticky min-[1120px]:top-0">
      <div className="shell flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
        {/* Brand: indikator fosfor + wordmark hijau — satu-satunya aksen utama */}
        <div className="order-1 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="glow h-3.5 w-3.5 rounded-[0.1875rem] bg-accent"
          />
          <h1 className="text-brand font-extrabold tracking-[-0.03em] text-accent-text">
            StockMeta
          </h1>
        </div>

        <div className="order-2 ml-auto min-[1120px]:order-3 min-[1120px]:ml-0">
          <ThemeToggle />
        </div>

        <div className="order-3 w-full min-[1120px]:order-2 min-[1120px]:ml-auto min-[1120px]:w-auto">
          {/* Segmented platform: pelat aktif = aksen fosfor (mode siang: solid kontras AA) */}
          <div
            role="group"
            aria-label="Platform"
            title={disabled ? 'Batch berjalan — ganti platform setelah selesai' : undefined}
            className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-surface-elevated p-1 min-[1120px]:inline-flex min-[1120px]:w-auto"
          >
            {PLATFORM_IDS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                disabled={disabled}
                onClick={() => setPlatform(p)}
                className={`flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-body font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 min-[1120px]:justify-start ${
                  platform === p
                    ? 'bg-accent text-accent-contrast'
                    : 'text-text-secondary hover:bg-accent-tint hover:text-text'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Baris status: satu baris yang digulir halus (tanpa scrollbar terlihat) di layar
          sempit — TIDAK wrap acak. Prompt "❯" tetap sejajar (shrink-0, center) di semua
          lebar. Teks tiap chip identik dengan readout sebelumnya. */}
      <div className="shell flex items-center gap-1.5 overflow-x-auto scroll-none whitespace-nowrap pb-2 pt-2">
        <span
          aria-hidden="true"
          className="mr-0.5 shrink-0 self-center font-mono text-meta font-bold leading-none text-accent-text"
        >
          {'\u276F\u00A0'}
        </span>
        <span className={CHIP}>{pad2(frames.length)} frame</span>
        <span className={CHIP}>{PLATFORM_LABELS[platform]}</span>
        <span className={CHIP}>{PROVIDER_LABELS[provider]}</span>
        <span className={`${CHIP} ${STATUS_CHIP[status]}`}>
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
          {STATUS_LABELS[status]}
        </span>
      </div>

      {/* Garis tipis kedua tepat di bawah header — tepi title bar terminal */}
      <div aria-hidden="true" className="h-px bg-accent-faint" />
    </header>
  );
}
