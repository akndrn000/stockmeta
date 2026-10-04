'use client';
import { useCallback, useEffect, useState } from 'react';
import { AnalysisPanel } from '../components/AnalysisPanel';
import { CalibrationPanel } from '../components/CalibrationPanel';
import { CaptionSheet } from '../components/CaptionSheet';
import { CompliancePanel } from '../components/CompliancePanel';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { ProviderPanel } from '../components/ProviderPanel';
import { RiskPanel } from '../components/RiskPanel';
import { Worksheet } from '../components/Worksheet';
import { useAnalysisBatch } from '../hooks/useAnalysisBatch';
import { useBatch } from '../hooks/useBatch';
import { useJudge } from '../hooks/useJudge';
import { useRisk } from '../hooks/useRisk';
import { useProvider } from '../hooks/useProvider';
import { useSession } from '../hooks/useSession';
import { readMode, writeMode } from '../lib/storage';
import type { AppMode } from '../lib/types';

// Satu instance hook per aplikasi: useProvider dipakai ProviderPanel + Worksheet;
// useSession dipakai Header + Worksheet + CaptionSheet/AnalysisPanel; useBatch +
// useAnalysisBatch menyambungkan keduanya ke alur generate/analisis — jangan membuat
// instance baru di mana pun.
export default function Home() {
  // M29: mode Analisis/Metadata — restore sekali dari localStorage (hindari mismatch SSR).
  const [mode, setMode] = useState<AppMode>('metadata');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setMode(readMode() ?? 'metadata');
  }, []);
  const changeMode = useCallback((m: AppMode) => {
    setMode(m);
    writeMode(m);
  }, []);
  // Provider sadar mode: pilihan + status tes mengikuti mode aktif (analisis vs metadata).
  const provider = useProvider(mode);
  const session = useSession();
  const batch = useBatch(session, provider);
  const analysis = useAnalysisBatch(session, provider);
  const judge = useJudge(session, provider);
  const risk = useRisk(session, provider);
  const anyBusy = batch.busy || analysis.busy || judge.busy;

  return (
    // M11/M12: tanpa tinggi yang dipaksa ke viewport & tanpa overflow tersembunyi —
    // halaman menggulir sebagai satu dokumen; tinggi tiap elemen = isinya.
    // M19: container `.shell` (padding fluid + safe-area, max 120rem) dipakai bersama
    // Header & ProviderPanel supaya tepinya sejajar; grid baru `minmax(0,1.4fr) /
    // minmax(24rem,1fr)` mulai 1120px (satu kolom di bawahnya) dan items-start supaya
    // tinggi kartu mengikuti isi — kolom caption sticky di ≥1120px.
    <div>
      {/* M26: Header tidak lagi menerima provider/status — baris status dihapus */}
      {/* M29: Header menerima mode + pengubahnya (ModeToggle Analisis/Metadata) */}
      <Header
        session={session}
        disabled={anyBusy}
        mode={mode}
        onModeChange={changeMode}
      />
      <ProviderPanel api={provider} busy={anyBusy} mode={mode} />

      {/* M23: gap & padding vertikal diringkas di <640px (sm: kembali ke desktop) */}
      <main className="shell grid grid-cols-1 items-start gap-3 py-3 sm:gap-4 sm:py-4 min-[1120px]:grid-cols-[minmax(0,1.4fr)_minmax(24rem,1fr)] min-[1120px]:py-6 [@media(max-height:500px)]:py-2">
        <Worksheet session={session} provider={provider} batch={batch} mode={mode} analysis={analysis} />
        {/* M13: CaptionSheet tidak lagi butuh provider/batch — aksi buat ulang pindah ke tile */}
        {/* M14: tinggi kartu = isi (items-start); di ≥1120px kolom caption menempel
            saat menggulir, dengan offset di bawah header lengket. */}
        {/* M29: hanya SATU panel kanan yang dirender — AnalysisPanel (mode analisis)
            atau CaptionSheet (mode metadata), bukan dua-duanya sekaligus. */}
        <div className="min-w-0 self-start min-[1120px]:sticky min-[1120px]:top-28">
          {mode === 'analisis' ? (
            <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
              <AnalysisPanel session={session} />
              <RiskPanel session={session} risk={risk} />
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-3 sm:gap-4">
              <CaptionSheet session={session} />
              <CompliancePanel session={session} batch={batch} judge={judge} />
              <RiskPanel session={session} risk={risk} />
              <CalibrationPanel />
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
