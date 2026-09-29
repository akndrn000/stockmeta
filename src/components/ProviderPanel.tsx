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
      className="border-b border-line bg-surface px-4 py-3"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
        {/* Provider */}
        <div
          className="flex flex-col gap-1.5 lg:w-44"
          title={busy ? 'Batch berjalan — ganti provider setelah selesai' : undefined}
        >
          <label
            htmlFor="provider"
            className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3"
          >
            Provider
          </label>
          <div className="relative">
            <select
              id="provider"
              value={api.provider}
              onChange={(e) => api.setProvider(e.target.value as ProviderId)}
              disabled={testing || busy}
              className="w-full appearance-none rounded border border-line bg-well px-3 py-2 pr-8 text-[13.5px] font-semibold text-ink transition-colors hover:border-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
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
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-dim"
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
            className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3"
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
              className="w-full rounded border border-line bg-well px-3 py-2 pr-10 font-mono text-[13px] text-ink placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              disabled={api.isSoon}
              aria-label={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
              title={showKey ? 'Sembunyikan API key' : 'Tampilkan API key'}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-accent-dim transition-colors hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-50"
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
          className="flex shrink-0 items-center gap-3"
          title={busy ? 'Batch berjalan — tes koneksi setelah selesai' : undefined}
        >
          <button
            type="button"
            onClick={api.test}
            disabled={api.isSoon || testing || busy}
            aria-busy={testing}
            className="inline-flex items-center gap-2 rounded border border-accent px-4 py-2 text-[13.5px] font-semibold text-accent-text transition-colors hover:bg-accent-wash disabled:cursor-not-allowed disabled:border-line disabled:opacity-45 disabled:hover:bg-transparent"
          >
            {testing && <span className="spinner" aria-hidden="true" />}
            {testing ? 'Menguji…' : 'Tes koneksi'}
          </button>
          {/* Badge status bergaya bracket terminal (M15) — teks asli tetap untuk pembaca layar;
              amber glow hanya untuk status Aktif (elemen aktif), tanpa rotasi supaya segaris. */}
          <span
            role="status"
            aria-live="polite"
            className={`badge-bracket inline-flex items-center rounded border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] ${
              api.status === 'ok'
                ? 'glow-ok border-success bg-success-wash text-success'
                : api.status === 'fail'
                  ? 'border-fail bg-fail-wash text-fail'
                  : api.status === 'testing'
                    ? 'border-accent bg-accent-wash text-accent-text'
                    : 'border-dashed border-ink-2 bg-wash text-ink-2'
            }`}
          >
            {STATUS_LABELS[api.status]}
          </span>
        </div>

        {/* Catatan: fallback KEY_NOTES / pesan hasil tes */}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:min-w-56">
          {/* pesan hasil tes (sukses/gagal) diumumkan pembaca layar saat berubah */}
          <p aria-live="polite" className="font-mono text-[12px] leading-relaxed text-ink-2">
            {api.note}
          </p>
          {api.status === 'ok' && api.model && (
            <span className="w-fit rounded border border-line bg-well px-2 py-1 font-mono text-[11px] text-ink-2">
              Model: <span className="font-bold text-ink">{api.model}</span>
            </span>
          )}
          {api.provider === 'groq' && (
            <p className="font-mono text-[12px] leading-relaxed text-ink-3">
              {GROQ_NOTE}
            </p>
          )}
          {api.provider === 'gemini' && (
            <p className="font-mono text-[12px] leading-relaxed text-ink-3">
              {GEMINI_NOTE}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
