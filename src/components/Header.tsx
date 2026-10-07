'use client';
import type { Platform } from '../lib/types';
import type { useSession } from '../hooks/useSession';
import { ThemeToggle } from './ThemeToggle';

const PLATFORM_LABELS: Record<Platform, string> = {
  adobe: 'Adobe Stock',
  shutterstock: 'Shutterstock'
};
const PLATFORM_IDS: readonly Platform[] = ['adobe', 'shutterstock'];

export function Header({
  session,
  disabled
}: {
  session: ReturnType<typeof useSession>;
  /** true saat batch berjalan — platform terkunci */
  disabled?: boolean;
}) {
  const { platform, setPlatform } = session;

  return (
    // M19: lengket HANYA di ≥1120px — di bawah itu header menggulir bersama halaman
    // (ruang vertikal HP tidak terpotong). Container `.shell` dipakai juga ProviderPanel
    // dan main, sehingga tepi kiri/kanan semuanya sejajar.
    // <1120px: baris 1 = logo + toggle tema (kanan); baris 2 = segmented platform
    // selebar penuh, 2 kolom sama lebar, tinggi minimum 44px. Susunan baris diatur lewat
    // `order` + `w-full` responsif — satu DOM, tanpa duplikasi markup.
    <header className="z-40 border-b border-line bg-bg-secondary/85 backdrop-blur-md min-[1120px]:sticky min-[1120px]:top-0">
      {/* M23: disiplin mobile — baris atas lebih rapat di <640px (sm: mengembalikan
          nilai desktop); target sentuh tetap ≥44px lewat blok CSS globals. */}
      <div className="shell flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-2 pt-2 sm:gap-x-4 sm:gap-y-2 sm:pb-3 sm:pt-3">
        {/* Brand: penanda ikon (geometri sama dengan favicon icon.svg) + wordmark
            hijau — satu-satunya aksen utama. Ukuran ikon 20px: setinggi wordmark
            sehingga tinggi baris header tidak berubah. */}
        <div className="order-1 flex items-center gap-2">
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 64 64"
            className="glow h-5 w-5"
          >
            <rect width="64" height="64" rx="14" fill="#20e875" />
            <rect
              x="14"
              y="13"
              width="28"
              height="27"
              fill="none"
              stroke="#04120a"
              strokeWidth="6"
            />
            <rect x="14" y="36" width="37" height="11" rx="2" fill="#04120a" />
          </svg>
          <h1 className="text-title font-extrabold tracking-[-0.03em] text-accent-text sm:text-brand">
            StockMeta
          </h1>
        </div>

        <div className="order-2 ml-auto min-[1120px]:order-3 min-[1120px]:ml-0">
          <ThemeToggle />
        </div>

        <div className="order-3 w-full min-[1120px]:order-2 min-[1120px]:ml-auto min-[1120px]:w-auto">
          {/* Segmented platform: pelat aktif = aksen fosfor (mode siang: solid kontras AA).
              M23: di <640px tombol memakai font small + padding rapat (segmented ringkas,
              bukan pil raksasa); sm: mengembalikan ukuran desktop. Tinggi sentuh ≥40px
              dijamin blok min-height CSS di globals (44px di <1120px / pointer kasar). */}
          <div
            role="group"
            aria-label="Platform"
            title={disabled ? 'Batch berjalan — ganti platform setelah selesai' : undefined}
            className="grid w-full grid-cols-2 gap-1 rounded-md border border-line bg-surface-elevated p-1 min-[1120px]:inline-flex min-[1120px]:w-auto"
          >
            {PLATFORM_IDS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={platform === p}
                disabled={disabled}
                onClick={() => setPlatform(p)}
                className={`flex items-center justify-center gap-1 rounded-md px-2 py-1 text-small font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-1.5 sm:px-3 sm:text-body min-[1120px]:justify-start ${
                  platform === p
                    ? 'bg-accent text-accent-contrast'
                    : 'text-accent-text hover:bg-accent-tint hover:text-text'
                }`}
              >
                {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* M26: baris status/breadcrumb (❯ …) dihapus seluruhnya — header kini hanya
          baris brand + toggle platform. */}
      {/* Garis tipis kedua tepat di bawah header — tepi title bar terminal */}
      <div aria-hidden="true" className="h-px bg-accent-faint" />
    </header>
  );
}
