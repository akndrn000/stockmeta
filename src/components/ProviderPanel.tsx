'use client';
import { useEffect, useState } from 'react';
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
  custom: 'Endpoint + model pilihanmu — limit mengikuti akunmu di layanan itu.',
  'coming-soon': 'Provider tambahan akan segera hadir.'
};

// Label field: kecil, tegas, uppercase — dipakai identik di seluruh halaman.
const LABEL =
  'text-meta font-semibold uppercase tracking-[0.06em] text-text-muted';

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

  return (
    <section
      aria-label="Koneksi provider"
      className="border-b border-border bg-bg-secondary"
    >
      <div className="shell flex flex-col gap-2 py-2 sm:gap-3 sm:py-3">
        {/* M19: mobile disusun vertikal selebar penuh (provider → input → tombol → status);
            satu baris flex dengan input mengisi sisa ruang mulai 1120px (sama dengan
            ambang dua kolom di bawahnya). */}
        <div className="flex flex-col gap-2 min-[1120px]:flex-row min-[1120px]:items-end min-[1120px]:gap-4 sm:gap-3">
          {/* M23: di bawah lg provider berupa <select> native tunggal (pola yang sama
              seperti slot/kategori di Worksheet/CaptionSheet) — jauh lebih ringkas
              vertikal daripada grid 2×2. ≥1024px (lg:) grid segmented seperti semula;
              ambang lg dipilih supaya rentang desktop 1024–1119px tidak berubah sama
              sekali. Satu DOM dipilih per breakpoint (hidden), perilaku & teks sama.
              M26: satu baris label dipakai bersama select & grid — "PROVIDER" +
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
            <div className="relative lg:hidden">
              <select
                id="provider-select"
                value={api.provider}
                disabled={testing || busy}
                aria-labelledby="provider-label"
                onChange={(e) => api.setProvider(e.target.value as ProviderId)}
                className="h-10 w-full appearance-none rounded border border-border-control bg-surface-elevated px-3 py-2 pr-8 text-body font-semibold text-text transition-colors duration-150 hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {PROVIDER_ORDER.map((p) => (
                  <option key={p} value={p} disabled={p === 'coming-soon'}>
                    {PROVIDER_LABELS[p]}
                  </option>
                ))}
              </select>
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted"
              >
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            {/* Provider — segmented control (bukan dropdown): pelat aktif isian aksen,
                opsi "Coming Soon" tampil redup + badge kecil + cursor not-allowed.
                M19: 4 segmen — 2 kolom × 2 baris di 1024–1119px;
                ≥1120px jadi inline-flex. M23: `max-lg:hidden` (bukan
                `hidden lg:grid`) agar cascade ≥1024px persis seperti semula.
                M26: label dipakai bersama dengan select di atas (satu #provider-label). */}
            <div
              role="group"
              aria-labelledby="provider-label"
              className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-surface-elevated p-1 max-lg:hidden min-[1120px]:inline-flex min-[1120px]:w-fit"
            >
              {PROVIDER_ORDER.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={api.provider === p}
                  disabled={testing || busy || p === 'coming-soon'}
                  onClick={() => api.setProvider(p)}
                  className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-small font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 min-[1120px]:justify-start min-[1120px]:px-3 ${
                    api.provider === p
                      ? 'bg-accent text-accent-contrast'
                      : p === 'coming-soon'
                        ? 'text-text-muted'
                        : 'text-text-secondary hover:bg-accent-tint hover:text-text'
                  }`}
                >
                  {/* teks boleh wrap (HP) — jangan truncate */}
                  <span className="min-w-0 text-center leading-tight min-[1120px]:text-left">
                    {PROVIDER_LABELS[p]}
                  </span>
                  {p === 'coming-soon' && (
                    <span className="hidden rounded-full border border-current px-1.5 py-px font-mono text-meta font-bold uppercase tracking-[0.06em] opacity-80 min-[1120px]:inline">
                      segera
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* API key */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {api.provider === 'custom' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="custom-baseurl" className={LABEL}>
                    Base URL
                  </label>
                  <input
                    id="custom-baseurl"
                    type="text"
                    value={api.customBaseUrl}
                    onChange={(e) => api.setCustomBaseUrl(e.target.value)}
                    placeholder="https://api.layanan-anda.com/v1"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    className="h-10 w-full rounded-md border border-border-control bg-surface-elevated px-3 py-2 font-mono text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <label htmlFor="custom-model" className={LABEL}>
                    Model
                  </label>
                  <input
                    id="custom-model"
                    type="text"
                    value={api.customModel}
                    onChange={(e) => api.setCustomModel(e.target.value)}
                    placeholder="nama-model-milikmu"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="none"
                    className="h-10 w-full rounded-md border border-border-control bg-surface-elevated px-3 py-2 font-mono text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
              </div>
            )}
            <label htmlFor="apikey" className={LABEL}>
              API key
            </label>
            <div className="relative">
              <input
                id="apikey"
                type={showKey ? 'text' : 'password'}
                value={api.key}
                onChange={(e) => api.setKey(e.target.value)}
                disabled={api.isSoon}
                placeholder={
                  api.isSoon ? 'Belum tersedia' : 'tempel API key di sini'
                }
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                className="h-10 w-full rounded-md border border-border-control bg-surface-elevated px-3 py-2 pr-10 font-mono text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                disabled={api.isSoon}
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

          {/* Tes koneksi (sekunder) + chip status — M19: mobile tombol selebar penuh
              dengan chip status di baris bawahnya; ≥1120px kembali sejajar di kanan. */}
          <div
            className="flex w-full flex-col items-start gap-2 min-[1120px]:w-auto min-[1120px]:flex-row min-[1120px]:items-center"
            title={busy ? 'Batch berjalan — tes koneksi setelah selesai' : undefined}
          >
            <button
              type="button"
              onClick={api.test}
              disabled={api.isSoon || testing || busy}
              aria-busy={testing}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-control bg-surface px-3 text-small font-semibold text-text transition-colors duration-150 hover:border-accent/70 hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border-control disabled:hover:bg-surface disabled:hover:text-text sm:px-4 sm:text-body min-[1120px]:w-auto"
            >
              {testing && <span className="spinner" aria-hidden="true" />}
              {testing ? 'Menguji…' : 'Tes koneksi'}
            </button>
            {/* Chip status "Belum dites" — M19 (G.1): gayanya DISERAGAMKAN dengan chip
                status di header (pil + dot), bukan bracket putus-putus. Teks asli tetap
                dibaca pembaca layar lewat role="status". M26: pesan hasil tes terakhir
                (sukses/gagal) tetap bisa dibaca lewat tooltip badge ini. */}
            <span
              role="status"
              aria-live="polite"
              title={api.note}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-meta font-medium uppercase tracking-[0.06em] transition-colors duration-150 ${
                api.status === 'ok'
                  ? 'border-success/40 bg-success-tint text-success'
                  : api.status === 'fail'
                    ? 'border-error/40 bg-error-tint text-error'
                    : api.status === 'testing'
                      ? 'border-accent/40 bg-accent-tint text-accent-text'
                      : 'border-border bg-surface text-text-secondary'
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
        </div>
      </div>
    </section>
  );
}
