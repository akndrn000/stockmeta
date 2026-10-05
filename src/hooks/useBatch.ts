'use client';
// Penyambung M8: batch & generate-ulang satu frame → sesi (useSession) + provider (useProvider).
// Keputusan urutan/jeda/batal ada di lib/batch.ts; hook ini hanya state, guard, dan wiring.
import { useEffect, useRef, useState } from 'react';
import { MISSING_FILE_MSG, runBatch, type BatchSummary } from '../lib/batch';
import { generateWithEnglishRetry } from '../lib/englishRetry';
import {
  applyStageRemovals,
  expansionNote,
  finalizeModelOutput,
  hasRiskyKeywords,
  needsExpansion
} from '../lib/finalize';
import { fileStore } from '../lib/fileStore';
import { prepareImage } from '../lib/image';
import { defaultMetadata, hasContent } from '../lib/metadata';
import { observationGroundingText } from '../lib/keywordGroups';
import { buildVerifyPrompt } from '../lib/prompt';
import { getProvider } from '../lib/providers';
import { generateWithFallback } from '../lib/providers/fallback';
import { readBatchDelay, writeBatchDelay } from '../lib/storage';
import { BATCH_DELAY_DEFAULT_SEC, KEYWORD_MIN_TARGET } from '../lib/limits';
import { effectiveTheme, validateTheme } from '../lib/theme';
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
  // Fase 1: tema wajib — pesan penolakan + sorotan input tema bila tema efektif tak valid.
  const [themeError, setThemeError] = useState<string | null>(null);
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
    return provider.status === 'ok';
  }

  /** Tolak generate bila ada tema efektif tak valid — kosong selalu lolos
      (tema opsional); kembalikan pesan atau null bila lolos. */
  function checkThemes(ids: number[]): string | null {
    const snap = session.snapshot();
    for (const id of ids) {
      const f = snap.frames.find((x) => x.id === id);
      if (!f) continue;
      const eff = effectiveTheme(snap.tema, f.tema);
      const v = validateTheme(eff);
      if (!v.ok) return `${v.message} Periksa Tema utama${f.tema.trim() ? ` (frame ${f.name})` : ''}.`;
    }
    return null;
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
          const callOnce = (languageFix: boolean, retryNote?: string, promptOverride?: string) =>
            generateWithFallback({
              provider: activeProvider,
              apiKey,
              image,
              platform: args.platform,
              theme: args.theme,
              signal: args.signal,
              onWait: args.onWait,
              languageFix,
              retryNote,
              promptOverride
            }).then((out) => {
              usedVia = out.usedFallback ? PROVIDER_LABELS[out.provider] : '';
              return out.meta;
            });
          // Fase 3: hasil dicek bahasa Inggris; bila Indonesia → regenerasi TEPAT satu kali
          // dengan instruksi koreksi bahasa.
          const { meta: engMeta, calls: engCalls } = await generateWithEnglishRetry(
            (fix) => callOnce(fix),
            args.platform
          );
          let calls = engCalls;
          // M32: pasca-proses deterministik (src terverifikasi, satu kata, tanpa latar).
          let fin = finalizeModelOutput(engMeta, args.platform);
          // M33 Fase 5: di bawah target 30 → SATU putaran perluasan (+verifikasi
          // daftar lama) memakai anggaran retry yang sudah ada.
          if (needsExpansion(fin.meta) && calls < 3) {
            const note = expansionNote(
              fin.meta.keywords ?? [],
              fin.facetsMissing,
              KEYWORD_MIN_TARGET
            );
            const again = await callOnce(false, note);
            calls++;
            fin = finalizeModelOutput(again, args.platform);
          }
          // M33 Fase 2c: Tahap D verifikasi bergambar untuk keyword berisiko
          // (synonym/theme/usage) bila anggaran masih ada (total ≤ 3/frame).
          // Hasil perluasan di atas juga dilewatkan ke filter + Tahap D di sini.
          if (hasRiskyKeywords(fin.items) && calls < 3) {
            const obs = engMeta.observation;
            const dPrompt = buildVerifyPrompt({
              keywords: fin.meta.keywords ?? [],
              observation: observationGroundingText(obs),
              mediaType: obs?.media_type ?? obs?.medium ?? ''
            });
            const dRes = await callOnce(false, undefined, dPrompt);
            calls++;
            const applied = applyStageRemovals(fin.items, dRes.stageRemove ?? []);
            fin = {
              ...fin,
              items: applied.items,
              meta: { ...fin.meta, keywords: applied.items.map((x) => x.k) },
              removed: [...fin.removed, ...applied.removed]
            };
          }
          // Bila setelah itu tetap di bawah target / masih Indonesia, meta tetap
          // disimpan apa adanya — validasi menandainya (saran target-30,
          // pemblokir judul/deskripsi atau minimum platform).
          return fin.meta;
        },
        getImage: (id) => fileStore.get(id),
        getTheme: (id) => {
          const snap = session.snapshot();
          const f = snap.frames.find((x) => x.id === id);
          return effectiveTheme(snap.tema, f?.tema ?? '');
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
          session.setNote(id, usedVia ? `via ${usedVia}` : '');
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
    const themeMsg = checkThemes(ids);
    if (themeMsg) {
      setThemeError(themeMsg);
      setNotice(themeMsg);
      return;
    }
    setThemeError(null);
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
    const themeMsg = checkThemes([id]);
    if (themeMsg) {
      setThemeError(themeMsg);
      setNotice(themeMsg);
      return;
    }
    setThemeError(null);
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
    const themeMsg = checkThemes(ids);
    if (themeMsg) {
      setThemeError(themeMsg);
      setNotice(themeMsg);
      return;
    }
    setThemeError(null);
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

  function clearThemeError() {
    setThemeError(null);
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
    themeError,
    clearThemeError,
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
