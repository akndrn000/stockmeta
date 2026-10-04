'use client';
// Penyambung M29 (Mode Analisis): batch analisis kelayakan upload per frame.
// Cerminan useBatch.ts — mesin yang sama (runBatch: urut, jeda, gagal-lanjut, batal),
// hanya generatornya memanggil analyzeImage (reviewer) bukan generateForImage (metadata).
// Hasil masuk slot analysis[platform] via applyAnalysis/failAnalysis — slot metadata
// tidak tersentuh sama sekali.
import { useEffect, useRef, useState } from 'react';
import type { AnalysisResult } from '../lib/types';
import { MISSING_FILE_MSG, runBatch, type BatchSummary } from '../lib/batch';
import { fileStore } from '../lib/fileStore';
import { prepareImage } from '../lib/image';
import { getProvider } from '../lib/providers';
import { analyzeWithFallback } from '../lib/providers/fallback';
import { readBatchDelay } from '../lib/storage';
import type { FrameStatus, Platform, ProviderId } from '../lib/types';
import { PROVIDER_LABELS, type useProvider } from './useProvider';
import type { useSession } from './useSession';
import { NEED_TEST_MSG } from './useBatch';

type Session = ReturnType<typeof useSession>;
type ProviderApi = ReturnType<typeof useProvider>;

export const ALL_ANALYZED_MSG = 'Semua frame sudah dianalisis.';
export const ANALYSIS_LIMIT_TIP_MSG =
  "Beberapa frame gagal — coba lagi sebentar lagi lewat 'Jalankan Analisis', hanya frame yang gagal yang diproses ulang.";

const LIMIT_RE = /429|kuota|limit/i;

/** status analisis frame (sesi lama tanpa slot = belum pernah dianalisis). */
export function analysisStateOf(f: { analysisStatus?: Partial<Record<Platform, FrameStatus>> }, platform: Platform): FrameStatus {
  return f.analysisStatus?.[platform] ?? 'menunggu';
}

export function useAnalysisBatch(session: Session, provider: ProviderApi, opts?: { delayMs?: number }) {
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [notice, setNotice] = useState('');
  const [regenConfirm, setRegenConfirm] = useState<number | null>(null);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // batch yang masih jalan dibatalkan saat komponen dilepas (sama seperti useBatch)
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function providerReady(): boolean {
    return !provider.isSoon && provider.status === 'ok';
  }

  async function run(ids: number[], platform: Platform) {
    const ac = new AbortController();
    abortRef.current = ac;
    busyRef.current = true;
    setBusy(true);
    setSummary(null);
    setNotice('');
    setRegenConfirm(null);            // konfirmasi basi dibersihkan begitu batch jalan
    setCurrentId(null);
    setProgress({ done: 0, failed: 0, total: ids.length });

    // input di-snapshot saat mulai: platform & API key terkunci sampai batch selesai
    const apiKey = provider.key.trim();
    const activeProvider: ProviderId = provider.provider;
    const delayMs = opts?.delayMs ?? readBatchDelay() * 1000;
    let limitHit = false;
    let usedVia = '';

    try {
      const result = await runBatch<AnalysisResult>({
        frameIds: ids,
        platform,
        delayMs,
        signal: ac.signal,
        generate: async (_id, args) => {
          const file = fileStore.get(_id);
          if (!file) throw new Error(MISSING_FILE_MSG);
          const image = await prepareImage(file);
          if (!getProvider(activeProvider)) throw new Error('Provider tidak tersedia');
          const out = await analyzeWithFallback({
            provider: activeProvider,
            apiKey,
            image,
            platform: args.platform,
            signal: args.signal,
            onWait: args.onWait,
            customConfig: activeProvider === 'custom' ? provider.getCustomConfig() : undefined
          });
          usedVia = out.usedFallback ? PROVIDER_LABELS[out.provider] : '';
          return out.analysis;
        },
        getImage: (id) => fileStore.get(id),
        getTheme: () => '',             // analisis tidak memakai tema
        onStart: (id) => {
          setCurrentId(id);
          const f = session.snapshot().frames.find((x) => x.id === id);
          if (f) {
            session.updateFrame(id, {
              analysisStatus: { ...f.analysisStatus, [platform]: 'memproses' },
              analysisError: { ...f.analysisError, [platform]: '' }
            });
          }
        },
        onCancel: (id) => {
          const f = session.snapshot().frames.find((x) => x.id === id);
          if (f) {
            session.updateFrame(id, {
              analysisStatus: { ...f.analysisStatus, [platform]: 'menunggu' }
            });
          }
          session.setNote(id, '');
          setCurrentId(null);
        },
        onWait: (id, info) => {
          const detik = Math.round(info.waitMs / 1000);
          session.setNote(id, `Menunggu limit reset (percobaan ${info.attempt + 1}/${info.maxAttempts}, ~${detik} dtk)`);
        },
        onSuccess: (id, result) => {
          session.applyAnalysis(id, platform, result);
          session.setNote(id, usedVia ? `Diproses via ${usedVia} (fallback)` : '');
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        },
        onError: (id, message) => {
          session.failAnalysis(id, platform, message);
          session.setNote(id, '');
          if (LIMIT_RE.test(message)) limitHit = true;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      });
      setSummary(result);
      setProgress({ done: result.done, failed: result.failed, total: result.total });
      if (result.failed > 0 && limitHit) setNotice(ANALYSIS_LIMIT_TIP_MSG);
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      setCurrentId(null);
      setBusy(false);
    }
  }

  function startAnalysis() {
    if (busyRef.current) return;
    setNotice('');
    const platform = session.platform;
    if (!providerReady()) {
      setNotice(NEED_TEST_MSG);
      return;
    }
    const ids = session.snapshot().frames
      .filter((f) => {
        const st = analysisStateOf(f, platform);
        return st === 'menunggu' || st === 'gagal';
      })
      .map((f) => f.id);
    if (!ids.length) {
      setNotice(ALL_ANALYZED_MSG);
      return;
    }
    void run(ids, platform);
  }

  function regenerateAnalysisFrame(id: number) {
    if (busyRef.current) return;
    setNotice('');
    const platform = session.platform;
    if (!providerReady()) {
      setNotice(NEED_TEST_MSG);
      return;
    }
    const f = session.snapshot().frames.find((x) => x.id === id);
    if (!f) return;
    const filled = f.analysis?.[platform] !== undefined;
    if (filled && regenConfirm !== id) {
      setRegenConfirm(id);          // slot sudah berisi → minta konfirmasi dulu
      return;
    }
    setRegenConfirm(null);
    void run([id], platform);
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function dismissRegen() {
    setRegenConfirm(null);
  }

  // peringatan tutup tab hanya selama batch berjalan (sama seperti useBatch)
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  return {
    busy,
    currentId,
    progress,
    summary,
    notice,
    regenConfirm,
    startAnalysis,
    regenerateAnalysisFrame,
    cancel,
    dismissRegen
  };
}
