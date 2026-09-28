'use client';
// Penyambung M8: batch & generate-ulang satu frame → sesi (useSession) + provider (useProvider).
// Keputusan urutan/jeda/batal ada di lib/batch.ts; hook ini hanya state, guard, dan wiring.
import { useEffect, useRef, useState } from 'react';
import { MISSING_FILE_MSG, runBatch, type BatchSummary } from '../lib/batch';
import { fileStore } from '../lib/fileStore';
import { prepareImage } from '../lib/image';
import { defaultMetadata, hasContent } from '../lib/metadata';
import { getProvider } from '../lib/providers';
import { readBatchDelay, writeBatchDelay } from '../lib/storage';
import { BATCH_DELAY_DEFAULT_SEC } from '../lib/limits';
import type { Platform } from '../lib/types';
import type { useProvider } from './useProvider';
import type { useSession } from './useSession';

type Session = ReturnType<typeof useSession>;
type ProviderApi = ReturnType<typeof useProvider>;

export const ALL_DONE_MSG = 'Semua frame sudah selesai.';
export const NEED_TEST_MSG = 'Tes koneksi dulu.';
export const LIMIT_TIP_MSG =
  "Beberapa frame gagal — coba lagi sebentar lagi lewat 'Buat metadata', hanya frame yang gagal yang diproses ulang.";

const LIMIT_RE = /429|kuota|limit/i;

export function useBatch(session: Session, provider: ProviderApi, opts?: { delayMs?: number }) {
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [notice, setNotice] = useState('');
  const [regenConfirm, setRegenConfirm] = useState<number | null>(null);
  // jeda antar foto (detik); direstore dari localStorage setelah mount (hindari mismatch SSR)
  const [delaySec, setDelaySec] = useState(BATCH_DELAY_DEFAULT_SEC);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setDelaySec(readBatchDelay());
  }, []);

  // batch yang masih jalan dibatalkan saat komponen dilepas (mis. sesi baru dipaksa)
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // wajib tes dulu; Gemini juga wajib punya model hasil tes (Groq modelnya tetap)
  function providerReady(): boolean {
    if (provider.isSoon || provider.status !== 'ok') return false;
    if (provider.provider === 'gemini' && !provider.model) return false;
    return true;
  }

  async function run(ids: number[], platform: Platform) {
    const ac = new AbortController();
    abortRef.current = ac;
    busyRef.current = true;
    setBusy(true);
    setSummary(null);
    setNotice('');
    setCurrentId(null);
    setProgress({ done: 0, failed: 0, total: ids.length });

    // input di-snapshot saat mulai: platform & API key terkunci sampai batch selesai
    const apiKey = provider.key.trim();
    const model = provider.model;
    const adapter = getProvider(provider.provider);
    const delayMs = opts?.delayMs ?? delaySec * 1000;
    let limitHit = false;

    try {
      const result = await runBatch({
        frameIds: ids,
        platform,
        delayMs,
        signal: ac.signal,
        generate: async (_id, args) => {
          const file = fileStore.get(_id);
          if (!file) throw new Error(MISSING_FILE_MSG);
          const image = await prepareImage(file);
          if (!adapter) throw new Error('Provider tidak tersedia');
          return adapter.generateForImage({
            apiKey,
            model,
            image,
            platform: args.platform,
            theme: args.theme,
            signal: args.signal,
            onWait: args.onWait
          });
        },
        getImage: (id) => fileStore.get(id),
        getTheme: (id) => {
          const snap = session.snapshot();
          const f = snap.frames.find((x) => x.id === id);
          return (f?.tema ?? '').trim() || snap.tema.replace(/\s+/g, ' ').trim();
        },
        onStart: (id) => {
          setCurrentId(id);
          const f = session.snapshot().frames.find((x) => x.id === id);
          if (f) session.updateFrame(id, { status: { ...f.status, [platform]: 'memproses' } });
        },
        onCancel: (id) => {
          const f = session.snapshot().frames.find((x) => x.id === id);
          if (f) session.updateFrame(id, { status: { ...f.status, [platform]: 'menunggu' } });
          session.setNote(id, '');
          setCurrentId(null);
        },
        onWait: (id, info) => {
          const detik = Math.round(info.waitMs / 1000);
          session.setNote(id, `Menunggu limit reset (percobaan ${info.attempt + 1}/${info.maxAttempts}, ~${detik} dtk)`);
        },
        onSuccess: (id, meta) => {
          session.applyGenerated(id, platform, meta);
          session.setNote(id, '');
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        },
        onError: (id, message) => {
          session.failFrame(id, platform, message);
          session.setNote(id, '');
          if (LIMIT_RE.test(message)) limitHit = true;
          setProgress((p) => ({ ...p, failed: p.failed + 1 }));
        }
      });
      setSummary(result);
      setProgress({ done: result.done, failed: result.failed, total: result.total });
      if (result.failed > 0 && limitHit) setNotice(LIMIT_TIP_MSG);
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      setCurrentId(null);
      setBusy(false);
    }
  }

  function startBatch() {
    if (busyRef.current) return;
    setNotice('');
    const platform = session.platform;
    if (!providerReady()) {
      setNotice(NEED_TEST_MSG);
      return;
    }
    const ids = session.snapshot().frames
      .filter((f) => f.status[platform] === 'menunggu' || f.status[platform] === 'gagal')
      .map((f) => f.id);
    if (!ids.length) {
      setNotice(ALL_DONE_MSG);
      return;
    }
    void run(ids, platform);
  }

  function regenerateFrame(id: number) {
    if (busyRef.current) return;
    setNotice('');
    const platform = session.platform;
    if (!providerReady()) {
      setNotice(NEED_TEST_MSG);
      return;
    }
    const f = session.snapshot().frames.find((x) => x.id === id);
    if (!f) return;
    const filled = hasContent(platform, f.metadata[platform] ?? defaultMetadata(platform));
    if (filled && regenConfirm !== id) {
      setRegenConfirm(id);          // slot sudah berisi → minta konfirmasi "Timpa hasil yang ada?"
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

  function setDelay(sec: number) {
    writeBatchDelay(sec);
    setDelaySec(readBatchDelay());
  }

  // peringatan tutup tab hanya selama batch berjalan (legacy: tidak ada peringatan sama sekali)
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
    startBatch,
    regenerateFrame,
    cancel,
    dismissRegen,
    delaySec,
    setDelay
  };
}
