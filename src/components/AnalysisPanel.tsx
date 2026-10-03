'use client';
// Panel hasil analisis (M29, Mode Analisis): pengganti CaptionSheet saat mode='analisis'.
// Read-only — menampilkan verdict + issues + ringkasan untuk frame terpilih di platform
// aktif. Aksi (jalankan/ulang analisis) tetap di Worksheet; panel ini murni pembaca.
import type { useSession } from '../hooks/useSession';
import { ANALYSIS_CATEGORY_LABELS } from '../lib/analysisPrompt';
import type { AnalysisVerdict } from '../lib/types';
import { Panel } from './Panel';

type Session = ReturnType<typeof useSession>;

const pad2 = (n: number) => String(n).padStart(2, '0');

const VERDICT_LABEL: Record<AnalysisVerdict, string> = {
  'layak': 'Layak',
  'berpotensi-ditolak': 'Berpotensi ditolak',
  'perlu-tinjau': 'Perlu tinjau'
};

// Warna + ikon + teks — verdict tidak pernah hanya mengandalkan warna (aksesibilitas).
const VERDICT_STYLE: Record<AnalysisVerdict, { cls: string; icon: 'check' | 'cross' | 'question' }> = {
  'layak': { cls: 'border-success text-success', icon: 'check' },
  'berpotensi-ditolak': { cls: 'border-error text-error', icon: 'cross' },
  'perlu-tinjau': { cls: 'border-warning text-warning', icon: 'question' }
};

function VerdictIcon({ icon }: { icon: 'check' | 'cross' | 'question' }) {
  if (icon === 'check') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3 8.5l3.2 3L13 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === 'cross') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6.2 6a1.9 1.9 0 1 1 2.6 1.8c-.7.3-.8.7-.8 1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function AnalysisPanel({ session }: {
  session: Session;
}) {
  const { frames, sel, platform } = session;

  const index = frames.findIndex((f) => f.id === sel);
  const frame = index >= 0 ? frames[index] : null;
  const result = frame?.analysis?.[platform];
  const ast = frame?.analysisStatus?.[platform] ?? 'menunggu';
  const aerr = frame?.analysisError?.[platform] ?? '';

  return (
    <Panel
      id="lembar-caption"
      title="Hasil analisis"
      // Header meta mengikuti pola CaptionSheet: posisi terpilih / jumlah frame sesi.
      meta={
        frame
          ? `Frame ${pad2(index + 1)} / ${pad2(frames.length)}`
          : frames.length > 0
            ? `Frame -- / ${pad2(frames.length)}`
            : 'Frame -- / --'
      }
    >
      <div className="flex flex-col gap-3 sm:gap-4">
        {frames.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-bg-secondary px-3 py-4 text-center sm:gap-2 sm:px-4 sm:py-8">
            <p className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
              belum ada frame
            </p>
            <p className="text-small leading-relaxed text-text-muted">
              Upload gambar dulu di lembar kerja, lalu jalankan analisis.
            </p>
          </div>
        )}

        {frame && (
          <div className="-mx-3 -mt-3 flex items-center justify-between gap-3 border-b border-border bg-surface-elevated px-3 py-1.5 sm:-mx-4 sm:-mt-4 sm:px-4 sm:py-2">
            <span className="truncate text-small font-medium text-text" title={frame.name}>
              {frame.name}
            </span>
            <span
              className={`badge-bracket shrink-0 rounded-md border-2 px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.08em] transition-colors duration-150 ${
                ast === 'siap'
                  ? 'border-success text-success'
                  : ast === 'gagal'
                    ? 'border-error text-error'
                    : 'border-dashed border-border-strong text-text-secondary'
              }`}
            >
              {ast === 'siap' ? 'Dianalisis' : ast === 'gagal' ? 'Gagal' : ast === 'memproses' ? 'Memproses' : 'Menunggu'}
            </span>
          </div>
        )}

        {/* Frame gagal analisis → pesan error asli (pola kotak error CaptionSheet) */}
        {frame && ast === 'gagal' && aerr && (
          <div role="alert" className="rounded-lg border-2 border-error bg-error-tint p-2 sm:p-3">
            <p className="text-small font-semibold leading-snug text-error sm:text-body">{aerr}</p>
          </div>
        )}

        {frame && ast === 'memproses' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated p-2 sm:p-3">
            <span className="spinner" aria-hidden="true" />
            <p className="text-small font-semibold text-text sm:text-body">Menganalisis…</p>
          </div>
        )}

        {frame && ast !== 'memproses' && !result && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-bg-secondary px-3 py-4 text-center sm:gap-2 sm:px-4 sm:py-8">
            <p className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
              Belum dianalisis
            </p>
            <p className="text-small leading-relaxed text-text-muted">
              Jalankan Analisis di lembar kerja untuk menilai kelayakan upload frame ini.
            </p>
          </div>
        )}

        {frame && result && (
          <div className="flex flex-col gap-3 sm:gap-4">
            {/* Badge verdict besar: warna + ikon + teks */}
            <div
              className={`badge-bracket flex items-center gap-2 rounded-md border-2 px-3 py-2 font-mono text-meta font-bold uppercase tracking-[0.08em] ${VERDICT_STYLE[result.verdict].cls}`}
            >
              <VerdictIcon icon={VERDICT_STYLE[result.verdict].icon} />
              {VERDICT_LABEL[result.verdict]}
            </div>

            {result.summary && (
              <p className="text-small leading-relaxed text-text sm:text-body">{result.summary}</p>
            )}

            {result.issues.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {result.issues.map((issue, i) => (
                  <li
                    key={`${issue.category}-${i}`}
                    className="flex items-start gap-2 rounded-md border border-border bg-surface-elevated p-2 text-small leading-relaxed text-text-secondary sm:p-2.5"
                  >
                    <span className="shrink-0 rounded border border-border-strong px-1.5 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.06em] text-text-muted">
                      {ANALYSIS_CATEGORY_LABELS[issue.category]}
                    </span>
                    <span>{issue.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small leading-relaxed text-text-muted">
                Tidak ada masalah yang terdeteksi — gambar ini layak diupload.
              </p>
            )}
          </div>
        )}

        {!frame && frames.length > 0 && (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong bg-bg-secondary px-3 py-4 text-center sm:gap-2 sm:px-4 sm:py-8">
            <p className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
              belum ada frame terpilih
            </p>
            <p className="text-small leading-relaxed text-text-muted">
              Pilih frame di lembar kerja untuk melihat hasil analisisnya.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}
