'use client';
import { useEffect, useRef, useState } from 'react';
import { PROVIDER_LABELS, PROVIDER_ORDER, STATUS_LABELS } from '../hooks/useProvider';
import type { useProvider } from '../hooks/useProvider';
import { readFallback, writeFallback } from '../lib/storage';
import type { ProviderId } from '../lib/types';

type ProviderApi = ReturnType<typeof useProvider>;

// M26: versi SANGAT ringkas dari catatan limit per provider — bukan paragraf, hanya
// tooltip pada checkbox fallback (info kritis tetap ada jejaknya setelah kotak
// keterangan dihapus).
const LIMIT_TIP: Record<ProviderId, string> = {
  groq: 'Limit gratis Groq ketat (8.000 token/menit).',
  gemini: 'Kuota gratis Gemini longgar (Flash-Lite); 429 harian → lanjutkan besok.',
  openrouter: 'Free tier OpenRouter ±20 request/hari — cadangan, bukan andalan.'
};

// Label field: kecil, tegas, uppercase — hijau satu hue di kedua mode
// (accent-text: terang #20e875 / siang #0a6633; hijau persis sama gagal 4.5:1
// untuk teks kecil — lihat laporan kontras).
const LABEL =
  'text-meta font-semibold uppercase tracking-[0.06em] text-accent-text';

export function ProviderPanel({ api, busy }: { api: ProviderApi; busy?: boolean }) {
  const [showKey, setShowKey] = useState(false);
  // toggle fallback antar provider (default aktif); direstore setelah mount hindari mismatch SSR
  const [fallback, setFallback] = useState(true);
  const testing = api.status === 'testing';

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setFallback(readFallback());
  }, []);

  function setFallbackEnabled(on: boolean) {
    setFallback(on);
    writeFallback(on);
  }

  // Satu kontrol segmented untuk SEMUA lebar layar (3 segmen sama lebar, satu
  // baris, tanpa turun baris). Navigasi panah kiri/kanan + roving tabindex
  // mengikuti pola radiogroup; fokus terlihat via :focus-visible global.
  const segRefs = useRef<(HTMLButtonElement | null)[]>([]);
  function focusSeg(i: number) {
    segRefs.current[i]?.focus();
  }
  function stepSeg(dir: 1 | -1) {
    if (testing || busy) return;
    const cur = PROVIDER_ORDER.indexOf(api.provider);
    const next = (cur + dir + PROVIDER_ORDER.length) % PROVIDER_ORDER.length;
    api.setProvider(PROVIDER_ORDER[next]);
    focusSeg(next);
  }

  return (
    <section
      aria-label="Koneksi provider"
      className="border-b border-line bg-bg-secondary"
    >
      <div className="shell flex flex-col gap-2 py-2 sm:gap-3 sm:py-3">
        {/* M19: mobile disusun vertikal selebar penuh (provider → input → tombol → status);
            satu baris flex dengan input mengisi sisa ruang mulai 1120px (sama dengan
            ambang dua kolom di bawahnya). */}
        <div className="flex flex-col gap-2 min-[1120px]:flex-row min-[1120px]:items-stretch min-[1120px]:gap-4 sm:gap-3">
          {/* Provider memakai satu segmented control di semua lebar (lihat bawah);
              M26: satu baris label dipakai bersama kontrol — "PROVIDER" +
              checkbox fallback tanpa teks di sampingnya. */}
          <div
            className="flex min-w-0 flex-col gap-1.5"
            title={busy ? 'Batch berjalan — ganti provider setelah selesai' : undefined}
          >
            <span className="flex items-center gap-2">
              <span id="provider-label" className={LABEL}>
                Provider
              </span>
              {/* Checkbox fallback TANPA teks (M26) — nama aksesibel via aria-label,
                  fungsi + limit ringkas via title. M27: area sentuh 40×40 tanpa
                  menggeser layout (padding 12px dikompensasi margin negatif —
                  glyph & teks tetangga tetap di tempat). */}
              <label
                className="inline-flex cursor-pointer items-center p-3 -m-3"
                title={busy ? 'Batch berjalan — ubah pengaturan setelah selesai' : `Fallback antar provider saat kuota habis — bila kuota habis/error 503, frame diproses provider lain yang key-nya tersimpan. ${LIMIT_TIP[api.provider]}`}
              >
                {/* M27: `min-h-4!` mengalahkan min-height 44px global khusus untuk
                    checkbox ini — area sentuh 40×40 sudah dijamin label
                    pembungkusnya, jadi glyph boleh tetap 16px dan baris label
                    tidak ikut membengkak. */}
                <input
                  type="checkbox"
                  checked={fallback}
                  disabled={busy}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                  aria-label="Fallback antar provider saat kuota habis"
                  className="h-4 min-h-4! w-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
              </label>
            </span>
            {/* Provider — SATU segmented control untuk semua lebar layar: tiga
                segmen sama lebar (grid 3 kolom), selalu satu baris tanpa wrap,
                memenuhi lebar kolom; teks mengecil + ellipsis di layar sempit
                ("OpenRouter" muat di 360px); tinggi sentuh ≥44px.
                M28: kontainer TANPA padding/border layout (ring inset sebagai
                garis visual 1px, 0px biaya layout) sehingga tinggi totalnya
                PERSIS sama dengan tombol segmen di dalamnya (h-10 = 40px;
                44px di mode sentuh via min-height global) — dan identik dengan
                input API key / tombol Tes koneksi / chip status di sampingnya.
                Jangan kembalikan padding/border ke kontainer ini: tiap 1px chrome
                menambah tinggi total dan merusak kesejajaran 0px. */}
            <div
              role="radiogroup"
              aria-label="Provider"
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  stepSeg(1);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  stepSeg(-1);
                }
              }}
              className="grid w-full grid-cols-3 gap-1 rounded-md bg-surface-elevated ring-1 ring-inset ring-line"
            >
              {PROVIDER_ORDER.map((p, i) => {
                const checked = api.provider === p;
                return (
                  <button
                    key={p}
                    ref={(el) => {
                      segRefs.current[i] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={testing || busy ? -1 : checked ? 0 : -1}
                    disabled={testing || busy}
                    onClick={() => api.setProvider(p)}
                    className={`inline-flex h-10 min-w-0 items-center justify-center rounded-md px-2 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 sm:text-small ${
                      checked
                        ? 'bg-accent text-accent-contrast'
                        : 'text-accent-text hover:bg-accent-tint hover:text-text'
                    }`}
                  >
                    <span className="truncate">{PROVIDER_LABELS[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* API key — label sebaris dengan chip status (satu wadah flex,
              gap-2 = 8px; wrap hanya bila sempit agar turun rapi, bukan
              terpotong/menimpa kolom Provider). */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="apikey" className={LABEL}>
                API key
              </label>
              {/* Chip status seukuran label: text-meta + tracking sama, tanpa h-10
                  (h-auto! mengalahkan height 40/44px .provider-status), padding
                  ringkas px-2 py-0.5, dot 6px, border/radius tetap. Warna + teks
                  tiap state tidak berubah; tooltip = pesan tes terakhir. */}
              <span
                role="status"
                aria-live="polite"
                title={api.note}
                className={`provider-status inline-flex h-auto! shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-meta font-medium uppercase tracking-[0.06em] leading-none transition-colors duration-150 ${
                  api.status === 'ok'
                    ? 'border-success/40 bg-success-tint text-success'
                    : api.status === 'fail'
                      ? 'border-error/40 bg-error-tint text-error'
                      : api.status === 'testing'
                        ? 'border-accent/40 bg-accent-tint text-accent-text'
                        : 'border-line bg-surface text-accent-text'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    api.status === 'ok'
                      ? 'bg-success'
                      : api.status === 'fail'
                        ? 'bg-error'
                        : api.status === 'testing'
                          ? 'bg-accent'
                          : 'bg-text-muted'
                  }`}
                />
                {STATUS_LABELS[api.status]}
              </span>
            </div>
            <div className="relative">
              <input
                id="apikey"
                type={showKey ? 'text' : 'password'}
                value={api.key}
                onChange={(e) => api.setKey(e.target.value)}
                placeholder="tempel API key di sini"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                className="h-10 w-full rounded-md border border-line bg-surface-elevated px-3 py-2 pr-10 font-mono text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                aria-label={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
                title={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
                className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-text-muted transition-colors duration-150 hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                {showKey ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M1.5 8s2.6-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.6 4.5-6.5 4.5S1.5 8 1.5 8z" />
                    <circle cx="8" cy="8" r="1.8" />
                    <path d="M2.5 2.5l11 11" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M1.5 8s2.6-4.5 6.5-4.5 6.5 4.5 6.5 4.5-2.6 4.5-6.5 4.5S1.5 8 1.5 8z" />
                    <circle cx="8" cy="8" r="1.8" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Tes koneksi (sekunder) — badge status pindah sebaris label API key;
              kolom ini tinggal spacer + tombol. M19: mobile tombol selebar penuh;
              ≥1120px tombol di kanan sejajar top dengan input (spacer setinggi
              baris label + gap-1.5 sama). Input melebar via flex-1 kolom API key. */}
          <div
            className="flex w-full flex-col items-start gap-2 min-[1120px]:w-auto min-[1120px]:gap-1.5"
            title={busy ? 'Batch berjalan — tes koneksi setelah selesai' : undefined}
          >
            <span aria-hidden="true" className="hidden min-[1120px]:block text-meta select-none">
              &nbsp;
            </span>
            <button
              type="button"
            onClick={api.test}
            disabled={testing || busy}
              aria-busy={testing}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-surface px-3 text-small font-semibold text-accent-text transition-colors duration-150 hover:border-accent/70 hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-surface disabled:hover:text-accent-text sm:px-4 sm:text-body min-[1120px]:w-auto"
            >
              {testing && <span className="spinner" aria-hidden="true" />}
              {testing ? 'Menguji…' : 'Tes koneksi'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
