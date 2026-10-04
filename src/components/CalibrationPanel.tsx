'use client';
// Panel "Akurasi": matriks prediksi vs hasil nyata per platform, korelasi metrik,
// rekomendasi ambang (diff + konfirmasi manual; tidak mengubah otomatis).
import { useState } from 'react';
import {
  clearSamples,
  confusionMatrix,
  exportCalibration,
  importCalibration,
  loadSamples,
  recommendThresholds,
  rejectionCorrelation
} from '../lib/calibration';
import { CALIBRATION_MIN_SAMPLES } from '../lib/quality/thresholds';
import { Panel } from './Panel';

export function CalibrationPanel() {
  const [platform, setPlatform] = useState<'adobe' | 'shutterstock'>('adobe');
  const [tick, setTick] = useState(0);
  const [msg, setMsg] = useState('');
  void tick;

  const matrix = confusionMatrix(platform);
  const corr = rejectionCorrelation(platform);
  const recs = recommendThresholds(platform);
  const samples = loadSamples().filter((s) => s.platform === platform);

  function refresh(): void {
    setTick((t) => t + 1);
  }

  return (
    <Panel id="panel-akurasi" title="Akurasi" meta={samples.length + ' sampel'}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={platform}
            onChange={(e) => {
              setPlatform(e.target.value as typeof platform);
              refresh();
            }}
            className="h-9 rounded-md border border-border-control bg-surface-elevated px-2 text-small text-text"
          >
            <option value="adobe">Adobe Stock</option>
            <option value="shutterstock">Shutterstock</option>
          </select>
          <button
            type="button"
            onClick={() => {
              clearSamples();
              setMsg('Sampel kalibrasi dihapus.');
              refresh();
            }}
            className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary"
          >
            Hapus sampel
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                const blob = new Blob([exportCalibration()], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'stockmeta_calibration.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              } catch { /* diabaikan */ }
            }}
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
                if (!f) return;
                const r = new FileReader();
                r.onload = () => {
                  try {
                    const n = importCalibration(String(r.result ?? '[]'));
                    setMsg(n + ' sampel diimpor.');
                    refresh();
                  } catch (err) {
                    setMsg(err instanceof Error ? err.message : 'Impor gagal');
                  }
                };
                r.readAsText(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {matrix.tooFew && (
          <p role="note" className="rounded-lg border border-warning/45 bg-warning-tint p-2 text-small text-text-secondary">
            Sampel terlalu sedikit ({matrix.samples}; minimal {CALIBRATION_MIN_SAMPLES} per platform) — matriks belum bermakna.
          </p>
        )}

        {matrix.cells.length > 0 ? (
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                <th className="border border-border px-2 py-1 text-left font-mono text-meta text-text-muted">prediksi</th>
                <th className="border border-border px-2 py-1 text-left font-mono text-meta text-text-muted">hasil nyata</th>
                <th className="border border-border px-2 py-1 text-right font-mono text-meta text-text-muted">n</th>
              </tr>
            </thead>
            <tbody>
              {matrix.cells.map((c, i) => (
                <tr key={i}>
                  <td className="border border-border px-2 py-1">{c.predicted}</td>
                  <td className="border border-border px-2 py-1">{c.actual}</td>
                  <td className="border border-border px-2 py-1 text-right font-mono tabular-nums">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-small text-text-muted">Belum ada sampel berpasangan (prediksi + hasil nyata) untuk platform ini.</p>
        )}

        {corr.length > 0 && matrix.samples > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-small font-semibold text-text">Korelasi metrik dengan penolakan</p>
            <ul className="flex flex-col gap-1">
              {corr.slice(0, 4).map((c) => (
                <li key={c.metric} className="font-mono text-small text-text-secondary">
                  {c.metric}: Δ {Math.round(c.delta * 100) / 100}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <p className="text-small font-semibold text-text">Rekomendasi ambang (perlu konfirmasi manual)</p>
          {recs.map((r, i) => (
            <p key={i} className="text-small text-text-secondary">
              • {r.text}
              {r.diff && <span className="font-mono"> [{r.diff}]</span>}
            </p>
          ))}
          <p className="text-small text-text-muted">Rekomendasi tidak diterapkan otomatis — ubah ambang di kode setelah meninjau.</p>
        </div>
        {msg && <p role="status" className="text-small text-text-secondary">{msg}</p>}
      </div>
    </Panel>
  );
}
