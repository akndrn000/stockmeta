'use client';
// Penyambung M8: batch & generate-ulang satu frame → sesi (useSession) + provider (useProvider).
// Keputusan urutan/jeda/batal ada di lib/batch.ts; hook ini hanya state, guard, dan wiring.
import { useEffect, useRef, useState } from 'react';
import { MISSING_FILE_MSG, runBatch, type BatchSummary } from '../lib/batch';
import { fileStore } from '../lib/fileStore';
import { prepareImage } from '../lib/image';
import { defaultMetadata, hasContent } from '../lib/metadata';
import { getProvider } from '../lib/providers';
import { generateWithFallback } from '../lib/providers/fallback';
import { readBatchDelay, writeBatchDelay } from '../lib/storage';
import { BATCH_DELAY_DEFAULT_SEC } from '../lib/limits';
import type { Platform, ProviderId } from '../lib/types';
import { PROVIDER_LABELS, type useProvider } from './useProvider';
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
  // konfirmasi "Ganti semua hasil yang sudah ada?" untuk Buat ulang semua — per platform
  const [regenAllConfirm, setRegenAllConfirm] = useState<Platform | null>(null);
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

  // wajib tes dulu; model provider tetap (satu model per provider) sehingga tak perlu dicek
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
    setRegenAllConfirm(null);
    setCurrentId(null);
    setProgress({ done: 0, failed: 0, total: ids.length });

    // input di-snapshot saat mulai: platform & API key terkunci sampai batch selesai
    const apiKey = provider.key.trim();
    const activeProvider: ProviderId = provider.provider;
    const delayMs = opts?.delayMs ?? delaySec * 1000;
    let limitHit = false;
    // provider yang akhirnya memproses frame terakhir (fallback antar provider) → tampil di catatan
    let usedVia = '';

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
          if (!getProvider(activeProvider)) throw new Error('Provider tidak tersedia');
          const out = await generateWithFallback({
            provider: activeProvider,
            apiKey,
            image,
            platform: args.platform,
            theme: args.theme,
            signal: args.signal,
            onWait: args.onWait
          });
          usedVia = out.usedFallback ? PROVIDER_LABELS[out.provider] : '';
          return out.meta;
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
          session.setNote(id, usedVia ? `Diproses via ${usedVia} (fallback)` : '');
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

  // M11: "Buat ulang semua" — jalankan generate untuk SEMUA frame platform aktif (menimpa
  // hasil yang sudah ada) memakai file yang tersimpan di fileStore; frame tanpa file asli
  // dilewati runBatch dengan pesan upload ulang seperti biasa. Sekali klik = minta konfirmasi.
  function regenerateAll() {
    if (busyRef.current) return;
    setNotice('');
    const platform = session.platform;
    if (!providerReady()) {
      setNotice(NEED_TEST_MSG);
      return;
    }
    const ids = session.snapshot().frames.map((f) => f.id);
    if (!ids.length) {
      setNotice(ALL_DONE_MSG);
      return;
    }
    if (regenAllConfirm !== platform) {
      setRegenAllConfirm(platform);   // "Ganti semua hasil yang sudah ada?"
      return;
    }
    setRegenAllConfirm(null);
    void run(ids, platform);
  }

  function dismissRegenAll() {
    setRegenAllConfirm(null);
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
    regenAllConfirm,
    startBatch,
    regenerateFrame,
    regenerateAll,
    cancel,
    dismissRegen,
    dismissRegenAll,
    delaySec,
    setDelay
  };
}
