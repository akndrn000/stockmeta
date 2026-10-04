'use client';
// Panel "Risiko penolakan" per frame per platform (ESTIMASI): badge risiko,
// penyebab utama, bukti angka, saran perbaikan; Shutterstock tiga arah dengan
// label persis "Data licensing saja (tidak masuk marketplace)".
import { useState } from 'react';
import type { useRisk } from '../hooks/useRisk';
import type { useSession } from '../hooks/useSession';
import { cropCostEstimate } from '../lib/quality/cropInspect';
import { QUALITY_THRESHOLDS } from '../lib/quality/thresholds';
import { clearHistory, exportHistory, importHistory, loadHistory } from '../lib/similarityStore';
import type { AdobeActual, ShutterstockActual } from '../lib/calibration';
import type { Frame } from '../lib/types';
import type { RiskLevel } from '../lib/outcome';
import { Panel } from './Panel';

type Session = ReturnType<typeof useSession>;
type RiskApi = ReturnType<typeof useRisk>;

export const RISK_BANNER =
  'Ini estimasi. Keputusan moderator Adobe/Shutterstock tidak bisa diprediksi pasti; ambang kualitas adalah heuristik yang dikalibrasi dari hasil Anda.';
export const ESTIMATE_LABEL = 'Data licensing saja (tidak masuk marketplace)';

const RISK_CLS: Record<RiskLevel, string> = {
  rendah: 'border-success text-success',
  sedang: 'border-warning text-warning',
  tinggi: 'border-error text-error',
  'tidak diketahui': 'border-dashed border-border-strong text-text-secondary'
};

const ADOBE_ACTUAL: AdobeActual[] = ['Diterima', 'Ditolak-Similar content', 'Ditolak-Quality', 'Ditolak-IP', 'Ditolak-lainnya'];
const SS_ACTUAL: ShutterstockActual[] = ['Marketplace', 'Data licensing saja', 'Ditolak'];

export function RiskPanel({ session, risk }: { session: Session; risk: RiskApi }) {
  const { frames, sel, platform } = session;
  const frame: Frame | null = frames.find((f) => f.id === sel) ?? null;
  const [histMsg, setHistMsg] = useState('');
  const [confirmHold, setConfirmHold] = useState(false);

  const filtered = frames.filter((f) => {
    const r = risk.riskOf(f, platform);
    if (risk.filter === 'semua') return true;
    if (risk.filter === 'ditahan') return f.held === true;
    if (risk.filter === 'data-licensing') {
      return platform === 'shutterstock' && f.riskShutterstock?.estimate === ESTIMATE_LABEL;
    }
    return r === 'tinggi';
  });
  const highCount = frames.filter((f) => risk.riskOf(f, platform) === 'tinggi').length;

  function doExportHistory(): void {
    try {
      const blob = new Blob([exportHistory()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'stockmeta_similarity_history.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { /* diabaikan */ }
  }

  function doImportHistory(file: File): void {
    const r = new FileReader();
    r.onload = () => {
      try {
        const res = importHistory(String(r.result ?? '[]'));
        setHistMsg('Riwayat: ' + res.imported + ' masuk, ' + res.skipped + ' dilewati (hanya hash).');
      } catch (err) {
        setHistMsg(err instanceof Error ? err.message : 'Impor gagal');
      }
    };
    r.readAsText(file);
  }

  const adobe = frame?.riskAdobe;
  const shut = frame?.riskShutterstock;

  return (
    <Panel
      id="panel-risiko"
      title="Risiko penolakan"
      meta={frame ? (platform === 'adobe' ? (adobe?.overall ?? 'belum diukur') : (shut?.estimate ?? 'belum diukur')) : 'belum ada frame'}
    >
      <div className="flex flex-col gap-3">
        <p role="note" className="rounded-lg border border-border bg-bg-secondary p-2 text-small leading-relaxed text-text-secondary">
          {RISK_BANNER}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={risk.busy || frames.length === 0}
            onClick={() => void risk.runAll(platform)}
            className="rounded-md border-2 border-accent bg-accent px-3 py-1.5 text-small font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-45"
          >
            {risk.busy ? 'Mengukur ' + (risk.progress.done + 1) + '/' + risk.progress.total + '…' : 'Ukur risiko batch'}
          </button>
          {risk.busy && (
            <button
              type="button"
              onClick={risk.cancel}
              className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary"
            >
              Batal
            </button>
          )}
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-small text-text-secondary">
            <input
              type="checkbox"
              checked={risk.detailInspect}
              onChange={(e) => risk.setDetailInspect(e.target.checked)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
            />
            Inspeksi kualitas detail
          </label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-small text-text-secondary">
            <input
              type="checkbox"
              checked={risk.compareHistory}
              onChange={(e) => risk.setCompareHistory(e.target.checked)}
              className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
            />
            Bandingkan dengan riwayat
          </label>
        </div>
        <p className="text-small text-text-muted">
          {cropCostEstimate(4, true)} Privasi: crop 512px dikirim ke provider aktif; kunci API tetap di localStorage dan dikirim langsung dari browser.
        </p>
        {risk.notice && <p role="status" className="text-small text-text-secondary">{risk.notice}</p>}
        {frame?.cropNote && <p className="text-small text-text-secondary">Crop: {frame.cropNote}</p>}

        {/* Filter + hitung risiko */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-small font-semibold text-text-secondary" htmlFor="risk-filter">Filter frame:</label>
          <select
            id="risk-filter"
            value={risk.filter}
            onChange={(e) => risk.setFilter(e.target.value as typeof risk.filter)}
            className="h-9 rounded-md border border-border-control bg-surface-elevated px-2 text-small text-text"
          >
            <option value="semua">Semua ({frames.length})</option>
            <option value="tinggi">Risiko tinggi ({highCount})</option>
            <option value="data-licensing">Data licensing saja</option>
            <option value="ditahan">Ditahan ({frames.filter((f) => f.held).length})</option>
          </select>
          {filtered.length > 0 && filtered[0].id !== sel && (
            <button
              type="button"
              onClick={() => session.select(filtered[0].id)}
              className="rounded-md border border-border-control px-2 py-1 text-small font-semibold text-text-secondary"
            >
              Pilih {filtered[0].name}
            </button>
          )}
          <span className="text-small text-text-muted">{filtered.length} frame cocok</span>
        </div>

        {!frame && <p className="text-small text-text-muted">Pilih frame untuk melihat risiko per platform.</p>}

        {frame && platform === 'adobe' && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-small font-semibold text-text">Adobe Stock — estimasi risiko</p>
            {adobe ? (
              <>
                <span className={`w-fit rounded-md border-2 px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.08em] ${RISK_CLS[adobe.overall]}`}>
                  risiko {adobe.overall}
                </span>
                {adobe.topCauses.length > 0 && (
                  <p className="text-small text-text-secondary">Penyebab utama: {adobe.topCauses.join(', ')}</p>
                )}
                <ul className="flex flex-col gap-1.5">
                  {adobe.perCause.map((c) => (
                    <li key={c.cause} className="text-small leading-relaxed text-text-secondary">
                      <span className="font-mono font-bold">{c.cause} [{c.level}]</span>
                      {c.evidence.length > 0 && <> — {c.evidence.join('; ')}</>}
                      <br />Saran: {c.fix} <span className="font-mono text-text-muted">({c.ruleId})</span>
                    </li>
                  ))}
                </ul>
                <p className="text-small text-text-muted">Skor kualitas: {Math.round(adobe.qualityScore)}/100 (internal, bukan peluang lolos).</p>
              </>
            ) : (
              <p className="text-small text-text-muted">Belum diukur — klik “Ukur risiko batch”.</p>
            )}
            {frame.quality && (
              <p className="text-small text-text-muted">
                {frame.quality.width}x{frame.quality.height} ({(Math.round(frame.quality.megapixels * 100) / 100)} MP)
                {(frame.observation?.media_type === 'vector_like' || frame.observation?.media_type === 'icon')
                  ? ' — ' + QUALITY_THRESHOLDS.vectorPreviewNote
                  : ''}
              </p>
            )}
          </div>
        )}

        {frame && platform === 'shutterstock' && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-small font-semibold text-text">Shutterstock — estimasi tiga arah</p>
            {shut ? (
              <>
                <span className="w-fit rounded-md border-2 border-border-control px-2 py-0.5 font-mono text-meta font-bold tracking-[0.04em] text-text">
                  {shut.estimate}
                </span>
                <ul className="flex flex-col gap-1">
                  {shut.reasons.map((r, i) => (
                    <li key={i} className="text-small text-text-secondary">• {r}</li>
                  ))}
                </ul>
                {shut.evidence.length > 0 && (
                  <p className="text-small text-text-muted">Bukti: {shut.evidence.join('; ')}</p>
                )}
                {shut.verifyNote && <p className="text-small text-warning">{shut.verifyNote}</p>}
              </>
            ) : (
              <p className="text-small text-text-muted">Belum diukur — klik “Ukur risiko batch”.</p>
            )}
          </div>
        )}

        {/* Klaster mirip */}
        {frame && (frame.similarGroup?.length ?? 0) > 1 && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-small font-semibold text-text">
              Klaster mirip ({frame.similarGroup?.length} frame){frame.similarBest ? ' — frame ini kandidat terbaik' : ' — risiko similar tinggi'}
            </p>
            <p className="text-small text-text-secondary">Anggota: {frame.similarGroup?.join(', ')}</p>
            <p className="text-small text-text-muted">Rekomendasi: hanya kirim yang terbaik atau bedakan secara nyata (sudut, subjek, komposisi).</p>
            {!confirmHold ? (
              <button
                type="button"
                onClick={() => setConfirmHold(true)}
                className="w-fit rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary"
              >
                {frame.held ? 'Batalkan tahan frame' : 'Tahan frame mirip'}
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small text-text-secondary">
                  {frame.held ? 'Kembalikan frame ini ke ekspor CSV?' : 'Sembunyikan frame ini dari ekspor CSV (bukan menghapus)?'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    session.setHeld(frame.id, !frame.held);
                    setConfirmHold(false);
                  }}
                  className="rounded-md border-2 border-accent bg-accent px-3 py-1 text-small font-semibold text-accent-contrast"
                >
                  Ya
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmHold(false)}
                  className="rounded-md border border-border-control px-3 py-1 text-small font-semibold text-text-secondary"
                >
                  Batal
                </button>
              </div>
            )}
          </div>
        )}

        {/* Kejenuhan konsep */}
        {frame?.conceptNote && (
          <p className="text-small text-text-muted">Kejenuhan konsep: {frame.conceptSaturated ? 'tinggi' : 'rendah'} — {frame.conceptNote}</p>
        )}

        {/* Hasil sebenarnya (kalibrasi) */}
        {frame && (
          <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <p className="text-small font-semibold text-text">Hasil sebenarnya (opsional, untuk kalibrasi)</p>
            {platform === 'adobe' ? (
              <select
                value={frame.actualAdobe ?? ''}
                onChange={(e) => session.setActual(frame.id, { actualAdobe: (e.target.value || undefined) as AdobeActual | undefined, actualShutterstock: frame.actualShutterstock })}
                className="h-9 w-fit rounded-md border border-border-control bg-surface-elevated px-2 text-small text-text"
              >
                <option value="">— belum ada —</option>
                {ADOBE_ACTUAL.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            ) : (
              <select
                value={frame.actualShutterstock ?? ''}
                onChange={(e) => session.setActual(frame.id, { actualShutterstock: (e.target.value || undefined) as ShutterstockActual | undefined, actualAdobe: frame.actualAdobe })}
                className="h-9 w-fit rounded-md border border-border-control bg-surface-elevated px-2 text-small text-text"
              >
                <option value="">— belum ada —</option>
                {SS_ACTUAL.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Riwayat lokal */}
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer px-3 py-2 text-small font-semibold text-text">
            Riwayat kemiripan lokal ({loadHistory().length}, hash saja — bukan gambar)
          </summary>
          <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => {
                clearHistory();
                setHistMsg('Riwayat dihapus.');
              }}
              className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary"
            >
              Hapus riwayat
            </button>
            <button
              type="button"
              onClick={doExportHistory}
              className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary"
            >
              Ekspor JSON
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary">
              Impor JSON
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) doImportHistory(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {histMsg && <p className="px-3 pb-2 text-small text-text-secondary">{histMsg}</p>}
        </details>
      </div>
    </Panel>
  );
}
