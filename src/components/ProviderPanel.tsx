'use client';
import { useState } from 'react';
import type { ProviderId } from '../lib/types';
import { PROVIDER_LABELS, PROVIDER_ORDER, STATUS_LABELS } from '../hooks/useProvider';
import type { useProvider } from '../hooks/useProvider';

type ProviderApi = ReturnType<typeof useProvider>;

const GROQ_NOTE =
  'Limit gratis Groq ketat (8.000 token/menit); batch besar bisa lebih lambat karena menunggu limit reset.';
const GEMINI_NOTE =
  'Kadang lebih sering terkena limit/sibuk dibanding Groq — coba Groq dulu kalau sering gagal.';

export function ProviderPanel({ api, busy }: { api: ProviderApi; busy?: boolean }) {
  const [showKey, setShowKey] = useState(false);
  const testing = api.status === 'testing';

  return (
    <section
      aria-label="Koneksi provider"
      className="border-b border-border bg-bg-secondary px-4 py-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        {/* Provider */}
        <div
          className="flex flex-col gap-1.5 lg:w-44"
          title={busy ? 'Batch berjalan — ganti provider setelah selesai' : undefined}
        >
          <label
            htmlFor="provider"
            className="text-meta font-semibold leading-none tracking-[0.01em] text-text-muted"
          >
            Provider
          </label>
          <div className="relative">
            <select
              id="provider"
              value={api.provider}
              onChange={(e) => api.setProvider(e.target.value as ProviderId)}
              disabled={testing || busy}
              className="h-10 w-full appearance-none rounded border border-border-control bg-surface-elevated px-3 py-2 pr-8 text-body font-semibold text-text transition-colors hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {PROVIDER_ORDER.map((p) => (
                <option key={p} value={p}>
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
        </div>

        {/* API key */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label
            htmlFor="apikey"
            className="text-meta font-semibold leading-none tracking-[0.01em] text-text-muted"
          >
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
              className="h-10 w-full rounded border border-border-control bg-surface-elevated px-3 py-2 pr-10 font-mono text-body text-text transition-colors placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              disabled={api.isSoon}
              aria-label={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
              title={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-text-muted transition-colors hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-50"
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

        {/* Tes koneksi + badge status */}
        <div
          className="flex shrink-0 items-center gap-2"
          title={busy ? 'Batch berjalan — tes koneksi setelah selesai' : undefined}
        >
          <button
            type="button"
            onClick={api.test}
            disabled={api.isSoon || testing || busy}
            aria-busy={testing}
            className="inline-flex items-center gap-2 h-10 rounded border border-accent px-4 text-body font-semibold text-accent-text transition-colors hover:bg-accent-tint disabled:cursor-not-allowed disabled:border-border-control disabled:opacity-45 disabled:hover:bg-transparent"
          >
            {testing && <span className="spinner" aria-hidden="true" />}
            {testing ? 'Menguji…' : 'Tes koneksi'}
          </button>
          {/* Badge status bergaya bracket terminal (M15) — teks asli tetap untuk pembaca layar.
              M17: glow dihapus (hanya tombol utama); indikator status berupa titik warna di
              dalam bracket, jadi status ke-4 (dites/sukses/gagal/belum) tetap mudah dibedakan.
              M16: badge status = garis 2px (satu dari dua ketebalan yang dipakai). */}
          <span
            role="status"
            aria-live="polite"
            className={`badge-bracket inline-flex items-center gap-1.5 rounded border-2 px-3 py-1 font-mono text-meta font-bold uppercase tracking-[0.08em] transition-colors ${
              api.status === 'ok'
                ? 'border-success bg-success-tint text-success'
                : api.status === 'fail'
                  ? 'border-error bg-error-tint text-error'
                  : api.status === 'testing'
                    ? 'border-accent bg-accent-tint text-accent-text'
                    : 'border-dashed border-border-strong text-text-secondary'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
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

        {/* Catatan: fallback KEY_NOTES / pesan hasil tes */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:min-w-56">
          {/* pesan hasil tes (sukses/gagal) diumumkan pembaca layar saat berubah */}
          <p aria-live="polite" className="font-mono text-small leading-relaxed text-text-secondary">
            {api.note}
          </p>
          {api.status === 'ok' && api.model && (
            <span className="w-fit font-mono text-meta text-text-muted">
              Model: <span className="font-bold text-text">{api.model}</span>
            </span>
          )}
          {api.provider === 'groq' && (
            <p className="font-mono text-small leading-relaxed text-text-muted">
              {GROQ_NOTE}
            </p>
          )}
          {api.provider === 'gemini' && (
            <p className="font-mono text-small leading-relaxed text-text-muted">
              {GEMINI_NOTE}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
