'use client';
// Panel kepatuhan per frame terpilih: observasi (Tahap A/C), juri multi-provider,
// perbaikan sesuai saran, dan langkah manual portal. Semua hasil AI = SARAN.
import { useState } from 'react';
import type { useBatch } from '../hooks/useBatch';
import { PROVIDER_LABELS } from '../hooks/useProvider';
import type { useJudge } from '../hooks/useJudge';
import type { useSession } from '../hooks/useSession';
import { complianceWarnings } from '../lib/observation';
import { ADOBE_MANUAL_STEPS, LOW_CONFIDENCE_THRESHOLD, SHUTTERSTOCK_MANUAL_STEPS } from '../lib/platform-rules';
import { readStrictVerify, writeStrictVerify } from '../lib/storage';
import type { Frame } from '../lib/types';
import { BADGE_LABEL, JUDGE_DISCLAIMER, type CombinedBadge } from '../lib/judge';
import { Panel } from './Panel';

type Session = ReturnType<typeof useSession>;
type BatchApi = ReturnType<typeof useBatch>;
type JudgeApi = ReturnType<typeof useJudge>;

const BADGE_CLS: Record<CombinedBadge, string> = {
  LOLOS: 'border-success text-success',
  LOLOS_DENGAN_CATATAN: 'border-warning text-warning',
  TIDAK_LOLOS: 'border-error text-error',
  PERLU_DITINJAU: 'border-dashed border-border-strong text-text-secondary'
};

const JUDGE_IDS = ['groq', 'gemini', 'openrouter'] as const;

export function CompliancePanel({ session, batch, judge }: {
  session: Session;
  batch: BatchApi;
  judge: JudgeApi;
}) {
  const { frames, sel, platform } = session;
  const frame: Frame | null = frames.find((f) => f.id === sel) ?? null;
  const [strict, setStrict] = useState(readStrictVerify());
  const [fixOpen, setFixOpen] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState('');
  const [proposal, setProposal] = useState<null | Awaited<ReturnType<JudgeApi['requestFix']>>>(null);

  const obs = frame?.observation;
  const comp = obs ? complianceWarnings(obs, platform) : null;
  const entry = frame ? judge.entryOf(frame, platform) : null;
  const needsReview = obs !== undefined && obs.confidence < LOW_CONFIDENCE_THRESHOLD;
  const busy = batch.busy || judge.busy;
  const manualSteps = platform === 'adobe' ? ADOBE_MANUAL_STEPS : SHUTTERSTOCK_MANUAL_STEPS;

  async function onFix() {
    if (!frame) return;
    setFixing(true);
    setFixError('');
    try {
      const p = await judge.requestFix(frame.id, platform);
      setProposal(p);
      setFixOpen(true);
    } catch (err) {
      setFixError(err instanceof Error ? err.message : 'Perbaikan gagal');
    } finally {
      setFixing(false);
    }
  }

  function removeUnsupported(kw: string) {
    if (!frame) return;
    const m = frame.metadata[platform];
    if (!m || !('keywords' in m)) return;
    const kept = (m.keywords as string[]).filter((k) => k.toLowerCase() !== kw.toLowerCase());
    session.updateMetadata(frame.id, platform, { keywords: kept });
  }

  return (
    <Panel
      id="panel-kepatuhan"
      title="Kepatuhan"
      meta={entry ? BADGE_LABEL[entry.badge] : frame?.observation ? 'teramati' : 'belum dinilai'}
    >
      <div className="flex flex-col gap-3">
        {!frame && <p className="text-small text-text-muted">Pilih frame untuk melihat hasil pengamatan dan juri.</p>}

        {frame && (
          <>
            {/* Observasi Tahap A + peringatan Tahap C */}
            <details open={obs !== undefined} className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-small font-semibold text-text">
                Pengamatan gambar {obs ? `— ${obs.main_subject} (${obs.media_type}, ${Math.round(obs.confidence * 100)}%)` : '(belum ada)'}
              </summary>
              <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
                {obs ? (
                  <>
                    {needsReview && (
                      <span className="w-fit rounded-md border-2 border-dashed border-border-strong px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-secondary">
                        perlu ditinjau
                      </span>
                    )}
                    {comp && comp.warnings.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {comp.warnings.map((w, i) => (
                          <li key={i} className="text-small leading-relaxed text-text-secondary">• {w.message}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-small text-text-secondary">Tidak ada peringatan pengamatan.</p>
                    )}
                    {comp?.illustrationSuggested && (
                      <p className="text-small text-warning">Saran: aktifkan toggle Ilustrasi bila sesuai.</p>
                    )}
                    {comp?.editorialSuggested && (
                      <p className="text-small text-warning">Saran: pertimbangkan Editorial atau siapkan release.</p>
                    )}
                  </>
                ) : (
                  <p className="text-small text-text-muted">Observation dibuat otomatis saat Buat metadata berjalan.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!frame || busy}
                    onClick={() => batch.reobserveFrame(frame.id)}
                    title="Hapus cache observation dan amati ulang gambar"
                    className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Analisis ulang gambar
                  </button>
                  <button
                    type="button"
                    disabled={!frame || busy}
                    onClick={() => batch.regenerateFrame(frame.id)}
                    title="Buat ulang metadata memakai cache observation"
                    className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Buat ulang metadata
                  </button>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 text-small font-semibold text-text-secondary">
                  <input
                    type="checkbox"
                    checked={strict}
                    onChange={(e) => {
                      setStrict(e.target.checked);
                      writeStrictVerify(e.target.checked);
                    }}
                    className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                  />
                  Verifikasi ketat (grounding)
                </label>
              </div>
            </details>

            {/* Juri kepatuhan */}
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <p className="text-small font-semibold text-text">Juri kepatuhan AI</p>
              {!judge.privacyAcked && (
                <div role="alert" className="rounded-lg border border-warning/45 bg-warning-tint p-2">
                  <p className="text-small text-text-secondary">
                    Gambar dan metadata dikirim ke SEMUA juri aktif.
                  </p>
                  <button
                    type="button"
                    onClick={judge.ackPrivacy}
                    className="mt-1.5 rounded-md border border-warning/60 px-3 py-1 text-small font-semibold text-warning"
                  >
                    Saya mengerti, lanjutkan
                  </button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {JUDGE_IDS.map((id) => (
                  <label key={id} className="inline-flex cursor-pointer items-center gap-1.5 text-small text-text-secondary">
                    <input
                      type="checkbox"
                      checked={judge.judges.includes(id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...judge.judges, id]
                          : judge.judges.filter((x) => x !== id);
                        judge.setJudges(next);
                      }}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                    />
                    {PROVIDER_LABELS[id]}
                  </label>
                ))}
                <span className="font-mono text-meta text-text-muted tabular-nums">{judge.judgeNote}</span>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-small text-text-secondary">
                <input
                  type="checkbox"
                  checked={judge.sendImage}
                  onChange={(e) => judge.setSendImage(e.target.checked)}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
                />
                Kirim gambar ke juri (bila mati: observasi saja, ditandai “tanpa gambar”)
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!frame || busy}
                  onClick={() => frame && judge.judgeFrame(frame.id)}
                  className="rounded-md border-2 border-accent bg-accent px-3 py-1.5 text-small font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Periksa kepatuhan
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={judge.judgeAll}
                  className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Periksa semua
                </button>
              </div>
              {judge.notice && <p role="status" className="text-small text-text-secondary">{judge.notice}</p>}
              {judge.busy && (
                <p role="status" className="font-mono text-meta text-text-secondary tabular-nums">
                  Menilai {judge.progress.done + judge.progress.failed + 1} dari {judge.progress.total}…
                </p>
              )}

              {entry && (
                <div className="flex flex-col gap-2 border-t border-border pt-2">
                  <span className={`w-fit rounded-md border-2 px-2 py-0.5 font-mono text-meta font-bold uppercase tracking-[0.08em] ${BADGE_CLS[entry.badge]}`}>
                    {BADGE_LABEL[entry.badge]}
                  </span>
                  <p className="text-small text-text-muted">{JUDGE_DISCLAIMER} — {entry.consensus.judgeNote}</p>
                  {entry.consensus.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {entry.consensus.checks.filter((c) => c.status === 'fail' || c.status === 'warn').map((c) => (
                        <li key={c.rule_id} className="text-small leading-relaxed text-text-secondary">
                          <span className="font-mono font-bold">{c.rule_id} [{c.status}]</span>
                          {c.evidence.length > 0 && <> — {c.evidence.join('; ')}</>}
                          {c.fix && <><br />Saran: {c.fix}</>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {entry.consensus.unsupported.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <p className="text-small font-semibold text-text">Tak didukung gambar:</p>
                      {entry.consensus.unsupported.map((kw) => (
                        <span key={kw} className="flex items-center gap-2 text-small text-text-secondary">
                          {kw}
                          <button
                            type="button"
                            onClick={() => removeUnsupported(kw)}
                            className="rounded-md border border-error px-2 py-0.5 text-small font-semibold text-error hover:bg-error-tint"
                          >
                            hapus keyword ini
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {entry.consensus.needsEditorialOrRelease && (
                    <p className="text-small text-warning">Butuh editorial atau release — periksa panel Rilis di portal.</p>
                  )}
                  <details className="rounded-md border border-border">
                    <summary className="cursor-pointer px-2 py-1.5 text-small font-semibold text-text-secondary">
                      Matriks juri × aturan ({entry.judges.length} juri)
                    </summary>
                    <div className="overflow-x-auto border-t border-border p-2">
                      <table className="w-full border-collapse text-small">
                        <thead>
                          <tr>
                            <th className="border border-border px-2 py-1 text-left font-mono text-meta text-text-muted">aturan</th>
                            {entry.judges.map((j) => (
                              <th key={j.provider} className="border border-border px-2 py-1 font-mono text-meta text-text-muted">
                                {PROVIDER_LABELS[j.provider]}{j.withoutImage ? ' (tanpa gambar)' : ''}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {entry.consensus.checks.map((c) => (
                            <tr key={c.rule_id}>
                              <td className="border border-border px-2 py-1 font-mono">{c.rule_id}</td>
                              {entry.judges.map((j) => (
                                <td key={j.provider} className="border border-border px-2 py-1 text-center font-mono">
                                  {j.output.checks.find((x) => x.rule_id === c.rule_id)?.status ?? 'n/a'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || fixing}
                      onClick={onFix}
                      className="rounded-md border border-border-control px-3 py-1.5 text-small font-semibold text-text-secondary hover:bg-accent-tint hover:text-text disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {fixing ? 'Memperbaiki…' : 'Perbaiki sesuai saran juri'}
                    </button>
                  </div>
                  {fixError && <p role="alert" className="text-small text-error">{fixError}</p>}
                  {fixOpen && proposal && (
                    <div role="dialog" aria-label="Konfirmasi perbaikan" className="rounded-lg border border-accent/40 bg-accent-tint/40 p-2">
                      <p className="text-small font-semibold text-text">
                        Usulan perbaikan (cek keras: {proposal.hardErrors} error, {proposal.hardWarnings} warning)
                      </p>
                      <ul className="mt-1 flex flex-col gap-1">
                        {proposal.diff.map((d, i) => (
                          <li key={i} className="text-small text-text-secondary">• {d}</li>
                        ))}
                      </ul>
                      {proposal.hardErrors > 0 && (
                        <p className="mt-1 text-small text-error">Masih ada error cek keras — perbaiki manual dulu.</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={proposal.hardErrors > 0}
                          onClick={() => {
                            if (frame) judge.applyFix(frame.id, platform, proposal.candidate);
                            setFixOpen(false);
                            setProposal(null);
                          }}
                          className="rounded-md border-2 border-accent bg-accent px-3 py-1 text-small font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          Terapkan (minta periksa ulang)
                        </button>
                        <button
                          type="button"
                          onClick={() => { setFixOpen(false); setProposal(null); }}
                          className="rounded-md border border-border-control px-3 py-1 text-small font-semibold text-text-secondary"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Langkah manual di portal */}
            <details className="rounded-lg border border-border">
              <summary className="cursor-pointer px-3 py-2 text-small font-semibold text-text">
                Langkah manual di portal {platform === 'adobe' ? 'Adobe Stock' : 'Shutterstock'}
              </summary>
              <ul className="flex flex-col gap-1 border-t border-border px-3 py-2">
                {manualSteps.map((s, i) => (
                  <li key={i} className="text-small leading-relaxed text-text-secondary">• {s}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </Panel>
  );
}
