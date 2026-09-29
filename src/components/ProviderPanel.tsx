'use client';
import { useState } from 'react';
import { PROVIDER_LABELS, PROVIDER_ORDER, STATUS_LABELS } from '../hooks/useProvider';
import type { useProvider } from '../hooks/useProvider';

type ProviderApi = ReturnType<typeof useProvider>;

const GROQ_NOTE =
  'Limit gratis Groq ketat (8.000 token/menit); batch besar bisa lebih lambat karena menunggu limit reset.';
const GEMINI_NOTE =
  'Kadang lebih sering terkena limit/sibuk dibanding Groq — coba Groq dulu kalau sering gagal.';
const OPENROUTER_NOTE =
  'Free tier OpenRouter sangat terbatas (sekitar 20 request/hari tanpa isi saldo) — cocok sebagai cadangan, bukan andalan utama. Model dipilih otomatis oleh OpenRouter dari daftar model gratis yang mendukung gambar.';

// Label field: kecil, tegas, uppercase — dipakai identik di seluruh halaman.
const LABEL =
  'text-meta font-semibold uppercase tracking-[0.06em] text-text-muted';

// Teks hasil tes diberi nada sesuai kondisi (netral / sukses / gagal / menguji).
const NOTE_TONE: Record<string, string> = {
  ok: 'text-success',
  fail: 'text-error',
  testing: 'text-accent-text',
  idle: 'text-text-secondary'
};

export function ProviderPanel({ api, busy }: { api: ProviderApi; busy?: boolean }) {
  const [showKey, setShowKey] = useState(false);
  const testing = api.status === 'testing';

  return (
    <section
      aria-label="Koneksi provider"
      className="border-b border-border bg-bg-secondary"
    >
      <div className="shell flex flex-col gap-3 py-3">
        {/* M19: mobile disusun vertikal selebar penuh (provider → input → tombol → status);
            satu baris flex dengan input mengisi sisa ruang mulai 1120px (sama dengan
            ambang dua kolom di bawahnya). */}
        <div className="flex flex-col gap-3 min-[1120px]:flex-row min-[1120px]:items-end min-[1120px]:gap-4">
          {/* Provider — segmented control (bukan dropdown): pelat aktif isian aksen,
              opsi "Coming Soon" tampil redup + badge kecil + cursor not-allowed. */}
          <div
            className="flex flex-col gap-1.5 min-w-0"
            title={busy ? 'Batch berjalan — ganti provider setelah selesai' : undefined}
          >
            <span id="provider-label" className={LABEL}>
              Provider
            </span>
            {/* M19: 4 segmen (Groq, Gemini, OpenRouter, Coming Soon) — 2 kolom × 2 baris
                di bawah 1120px supaya teks "OpenRouter" muat tanpa meluber di layar 360px
                (4 kolom selebar layar hanya ±88px per segmen); ≥1120px jadi inline-flex. */}
            <div
              role="group"
              aria-labelledby="provider-label"
              className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-surface-elevated p-1 min-[1120px]:inline-flex min-[1120px]:w-fit"
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
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border-control bg-surface px-4 text-body font-semibold text-text transition-colors duration-150 hover:border-accent/70 hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-border-control disabled:hover:bg-surface disabled:hover:text-text min-[1120px]:w-auto"
            >
              {testing && <span className="spinner" aria-hidden="true" />}
              {testing ? 'Menguji…' : 'Tes koneksi'}
            </button>
            {/* Chip status "Belum dites" — M19 (G.1): gayanya DISERAGAMKAN dengan chip
                status di header (pil + dot), bukan bracket putus-putus. Teks asli tetap
                dibaca pembaca layar lewat role="status". */}
            <span
              role="status"
              aria-live="polite"
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

        {/* Catatan (key tersimpan di browser + limit provider) dalam callout lembut
            berikon kecil; baris pertama = pesan hasil tes, diwarnai sesuai kondisi. */}
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-text-muted"
          >
            <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.2" />
            <path d="M7 6.2v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="7" cy="4.2" r="0.8" fill="currentColor" />
          </svg>
          <div className="flex min-w-0 flex-col gap-1">
            {/* pesan hasil tes (sukses/gagal) diumumkan pembaca layar saat berubah */}
            <p
              aria-live="polite"
              className={`text-small leading-relaxed ${NOTE_TONE[api.status] ?? 'text-text-secondary'}`}
            >
              {api.note}
            </p>
            {api.status === 'ok' && api.model && (
              <span className="font-mono text-meta text-text-muted tabular-nums">
                Model: <span className="font-bold text-text">{api.model}</span>
              </span>
            )}
            {api.provider === 'groq' && (
              <p className="font-mono text-small leading-relaxed text-text-muted">{GROQ_NOTE}</p>
            )}
            {api.provider === 'gemini' && (
              <p className="font-mono text-small leading-relaxed text-text-muted">{GEMINI_NOTE}</p>
            )}
            {api.provider === 'openrouter' && (
              <p className="font-mono text-small leading-relaxed text-text-muted">{OPENROUTER_NOTE}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
