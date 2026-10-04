'use client';
// Orkestrasi risiko penolakan: metrik piksel asli (worker) → similarity batch +
// riwayat → outcome deterministik → inspeksi crop vision (opsional) → konsep.
// Semua keluaran ESTIMASI (tingkat risiko, bukan persen peluang lolos).
import { useEffect, useRef, useState } from 'react';
import { saveSample } from '../lib/calibration';
import { buildRiskContext } from '../lib/judge';
import { assessAdobe, assessShutterstock, type CropSignal } from '../lib/outcome';
import { getProvider } from '../lib/providers';
import { cropSeedFor, getCropCache, setCropCache } from '../lib/quality/cropInspect';
import { CROP_INSPECTION_UNAVAILABLE } from '../lib/quality/cropInspect';
import { extractCropImages, runQualityFromFile } from '../lib/quality/runner';
import { QUALITY_THRESHOLDS } from '../lib/quality/thresholds';
import { clusterSimilar, titleOverlap, tokenizeKeywords, tokenizeTitle, jaccard, type SimilarInput } from '../lib/similarity';
import { addHistory, loadHistory, readHistoryEnabled, writeHistoryEnabled } from '../lib/similarityStore';
import { readBatchDelay, readCustomBaseUrl, readCustomModel, readKey } from '../lib/storage';
import { validateMetadata } from '../lib/validate';
import type { Frame, Platform } from '../lib/types';
import type { useProvider } from './useProvider';
import type { useSession } from './useSession';

type Session = ReturnType<typeof useSession>;
type ProviderApi = ReturnType<typeof useProvider>;

const DETAIL_KEY = 'stockmeta_detail_inspect';
const CONCEPT_KEY = 'stockmeta_concept_cache';

export function readDetailInspect(): boolean {
  try {
    return localStorage.getItem(DETAIL_KEY) !== '0';
  } catch {
    return true;
  }
}

function conceptCacheGet(k: string): string | null {
  try {
    return sessionStorage.getItem(CONCEPT_KEY + k);
  } catch {
    return null;
  }
}

function conceptCacheSet(k: string, v: string): void {
  try {
    sessionStorage.setItem(CONCEPT_KEY + k, v);
  } catch { /* diabaikan */ }
}

export function useRisk(session: Session, provider: ProviderApi) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [notice, setNotice] = useState('');
  const [detailInspect, setDetailInspectState] = useState(true);
  const [compareHistory, setCompareHistory] = useState(true);
  const [filter, setFilter] = useState<'semua' | 'tinggi' | 'data-licensing' | 'ditahan'>('semua');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
      setDetailInspectState(readDetailInspect());
      setCompareHistory(readHistoryEnabled());
    } catch { /* diabaikan */ }
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function setDetailInspect(on: boolean): void {
    setDetailInspectState(on);
    try {
      localStorage.setItem(DETAIL_KEY, on ? '1' : '0');
    } catch { /* diabaikan */ }
  }

  function setCompareHistoryState(on: boolean): void {
    setCompareHistory(on);
    writeHistoryEnabled(on);
  }

  function riskOf(frame: Frame, platform: Platform): 'rendah' | 'sedang' | 'tinggi' | 'tidak diketahui' | null {
    if (platform === 'adobe') return frame.riskAdobe?.overall ?? null;
    const e = frame.riskShutterstock?.estimate;
    if (!e) return null;
    if (e === 'Kemungkinan ditolak') return 'tinggi';
    if (e === 'Data licensing saja (tidak masuk marketplace)') return 'sedang';
    return 'rendah';
  }

  async function runAll(platform: Platform): Promise<void> {
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setNotice('');
    const frames = session.snapshot().frames;
    setProgress({ done: 0, total: frames.length });
    const { fileStore } = await import('../lib/fileStore');
    const delayMs = readBatchDelay() * 1000;
    let done = 0;

    // Tahap 1 (serial): metrik piksel asli per frame.
    const inputs: SimilarInput[] = [];
    const packs = new Map<number, Awaited<ReturnType<typeof runQualityFromFile>>>();
    for (const f of frames) {
      if (ac.signal.aborted) break;
      const file = fileStore.get(f.id);
      if (!file) {
        session.setNote(f.id, 'File asli tidak tersedia — upload ulang untuk ukur kualitas');
        continue;
      }
      try {
        const pack = await runQualityFromFile(file, f.observation?.media_type ?? 'photo');
        packs.set(f.id, pack);
        const meta = f.metadata[platform];
        const title = platform === 'adobe'
          ? (meta && 'title' in meta ? String(meta.title) : '')
          : (meta && 'description' in meta ? String(meta.description) : '');
        const kw = meta && 'keywords' in meta ? (meta.keywords as string[]) : [];
        inputs.push({
          id: String(f.id),
          hashes: pack.hashes,
          titleTokens: tokenizeTitle(title),
          keywordTokens: tokenizeKeywords(kw)
        });
        session.applyRisk(f.id, { quality: pack.metrics });
      } catch (err) {
        session.setNote(f.id, err instanceof Error ? err.message : 'Ukur kualitas gagal');
      }
      done++;
      setProgress({ done, total: frames.length });
      if (delayMs > 0 && done < frames.length) {
        await new Promise((r) => setTimeout(r, Math.min(delayMs, 1000)));
      }
    }

    // Tahap 2: klaster batch + riwayat (hash saja).
    const { clusters } = clusterSimilar(inputs, (id) => {
      const f = session.snapshot().frames.find((x) => String(x.id) === id);
      return f?.quality ? 99 - f.quality.noiseEstimate : 48;
    });
    const byMember = new Map<string, { members: string[]; bestId: string }>();
    for (const c of clusters) {
      for (const m of c.members) byMember.set(m, c);
    }
    const history = compareHistory ? loadHistory() : [];
    const historyHits = new Map<string, number>();
    if (compareHistory) {
      for (const inp of inputs) {
        let hits = 0;
        for (const h of history.slice(0, 100)) {
          const kj = jaccard(inp.keywordTokens, (h.keywords ?? []).flatMap((k) => tokenizeKeywords([k])));
          const to = titleOverlap(inp.titleTokens, tokenizeTitle(h.title));
          if (kj >= 0.8 || to >= 0.8) hits++;
        }
        if (hits > 0) historyHits.set(inp.id, hits);
      }
    }

    // Tahap 3: outcome deterministik per frame.
    for (const f of frames) {
      if (ac.signal.aborted) break;
      const snap = session.snapshot().frames.find((x) => x.id === f.id);
      if (!snap?.quality) continue;
      const m = snap.quality;
      const obs = snap.observation;
      const meta = snap.metadata[platform];
      const validation = validateMetadata(platform, meta, snap.portalName || snap.name);
      const cl = byMember.get(String(f.id));
      const ipVisible =
        (obs?.visible_brands_logos.length ?? 0) > 0 ||
        (obs?.visible_text.length ?? 0) > 0 ||
        (obs?.landmarks_or_private_property.length ?? 0) > 0;
      const releaseNeeded = Boolean(obs?.people.recognizable_face) || (obs?.landmarks_or_private_property.length ?? 0) > 0;
      const mpMin = platform === 'adobe' ? QUALITY_THRESHOLDS.adobePhotoMinMp.value : QUALITY_THRESHOLDS.shutterPhotoMinMp.value;
      const isVectorPreview = obs?.media_type === 'vector_like' || obs?.media_type === 'icon';
      const minMp = isVectorPreview ? QUALITY_THRESHOLDS.vectorMinMp.value : mpMin;
      const belowMin =
        platform === 'adobe'
          ? { adobe: m.megapixels < minMp, shutterstock: false }
          : { adobe: false, shutterstock: m.megapixels < minMp };
      const baseCtx = {
        hardErrors: validation.errors.length,
        hardErrorSummary: validation.errors.map((e) => e.rule),
        ipVisible,
        releaseNeeded,
        releaseMarked: false,
        editorial: Boolean(snap.editorial),
        commercial: !snap.editorial,
        inSimilarCluster: Boolean(cl) || (historyHits.get(String(f.id)) ?? 0) > 0,
        similarIsBest: cl ? cl.bestId === String(f.id) : true,
        conceptSaturated: Boolean(snap.conceptSaturated),
        cropFindings: [] as CropSignal[],
        belowMinResolution: belowMin
      };
      const adobe = assessAdobe(m, obs ?? { media_type: 'photo', main_subject: '', secondary_subjects: [], people: { count: 0, recognizable_face: false, visible_actions: [] }, setting: '', time_or_lighting: '', viewpoint_composition: [], colors: [], mood_concepts: [], copy_space: false, isolated_background: false, visible_text: [], visible_brands_logos: [], landmarks_or_private_property: [], possible_ai_look: false, quality_issues: [], confidence: 0, theme_mismatch: false }, baseCtx);
      const shut = assessShutterstock(m, obs ?? { media_type: 'photo', main_subject: '', secondary_subjects: [], people: { count: 0, recognizable_face: false, visible_actions: [] }, setting: '', time_or_lighting: '', viewpoint_composition: [], colors: [], mood_concepts: [], copy_space: false, isolated_background: false, visible_text: [], visible_brands_logos: [], landmarks_or_private_property: [], possible_ai_look: false, quality_issues: [], confidence: 0, theme_mismatch: false }, baseCtx, validation);
      session.applyRisk(f.id, {
        riskAdobe: platform === 'adobe' ? adobe : snap.riskAdobe,
        riskShutterstock: platform === 'shutterstock' ? shut : snap.riskShutterstock,
        similarGroup: cl ? cl.members : [],
        similarBest: cl ? cl.bestId === String(f.id) : undefined
      });
      // Simpan hash ke riwayat lokal (hash + metadata ringkas saja).
      if (compareHistory) {
        const pack = packs.get(f.id);
        if (pack) {
          const metaNow = session.snapshot().frames.find((x) => x.id === f.id)?.metadata[platform];
          const title = platform === 'adobe'
            ? (metaNow && 'title' in metaNow ? String(metaNow.title) : f.name)
            : (metaNow && 'description' in metaNow ? String(metaNow.description) : f.name);
          const kw = metaNow && 'keywords' in metaNow ? (metaNow.keywords as string[]) : [];
          addHistory({ hash: m.pixelHash, title, keywords: kw, platform, date: new Date().toISOString().slice(0, 10), hashes: pack.hashes });
        }
      }
      // Snapshot kalibrasi (prediksi saat itu; hasil nyata diisi manual di panel).
      saveSample({
        // eslint-disable-next-line react-hooks/purity -- id unik per pengukuran (bukan render)
        id: 'risk-' + String(f.id) + '-' + platform + '-' + Date.now(),
        date: new Date().toISOString().slice(0, 10),
        platform,
        predictedAdobe: platform === 'adobe' ? adobe.overall : null,
        predictedShutterstock: platform === 'shutterstock' ? shut.estimate : null,
        actualAdobe: null,
        actualShutterstock: null,
        metrics: {
          sharpnessGlobal: m.sharpnessGlobal,
          noiseEstimate: m.noiseEstimate,
          highlightClipPct: m.highlightClipPct,
          shadowClipPct: m.shadowClipPct,
          meanSaturation: m.meanSaturation,
          jpegBlockiness: m.jpegBlockiness,
          megapixels: m.megapixels
        }
      });
    }

    // Tahap 4: inspeksi crop vision (toggle default aktif; hormati limit; cache per hash).
    if (detailInspect && !ac.signal.aborted) {
      const adapter = getProvider(provider.provider);
      const apiKey = provider.key.trim() || readKey(provider.provider);
      const canVision = Boolean(adapter?.supportsVision && adapter.inspectCrop && apiKey);
      for (const f of frames) {
        if (ac.signal.aborted) break;
        const snap = session.snapshot().frames.find((x) => x.id === f.id);
        const pack = packs.get(f.id);
        if (!snap?.quality || !pack) continue;
        if (!canVision) {
          session.applyRisk(f.id, { cropNote: CROP_INSPECTION_UNAVAILABLE });
          continue;
        }
        const cached = getCropCache(snap.quality.pixelHash);
        if (cached) {
          await applyCropFindings(f.id, platform, cached.crops.map((c) => ({
            region: c.region,
            visible_noise: c.visible_noise,
            blur_or_soft: c.blur_or_soft,
            artifacts_or_halos: c.artifacts_or_halos,
            dust_or_sensor_spots: c.dust_or_sensor_spots,
            ai_glitches: c.ai_glitches
          })));
          continue;
        }
        try {
          const file = fileStore.get(f.id);
          if (!file) continue;
          const crops = await extractCropImages(file, pack.rects);
          const findings: CropSignal[] = [];
          for (const c of crops) {
            const out = await adapter?.inspectCrop?.({
              apiKey,
              image: c.image,
              region: c.region,
              seed: cropSeedFor(snap.quality.pixelHash, c.region),
              signal: ac.signal,
              ...(provider.provider === 'custom'
                ? { baseUrl: readCustomBaseUrl(), model: readCustomModel() }
                : {})
            });
            if (out) {
              findings.push({
                region: c.region,
                visible_noise: out.visible_noise,
                blur_or_soft: out.blur_or_soft,
                artifacts_or_halos: out.artifacts_or_halos,
                dust_or_sensor_spots: out.dust_or_sensor_spots,
                ai_glitches: out.ai_glitches
              });
            }
          }
          setCropCache(snap.quality.pixelHash, {
            crops: findings.map((x) => ({ ...x, notes: '' })),
            confidence: 0.7
          });
          await applyCropFindings(f.id, platform, findings);
          setNotice('Inspeksi crop: ' + (provider.provider) + ' (' + crops.length + ' crop/frame) — ' + 'mengikuti tarif model Anda.');
        } catch (err) {
          session.setNote(f.id, err instanceof Error ? err.message : 'Inspeksi crop gagal');
        }
      }
    }

    // Tahap 5: kejenuhan konsep AI (subjektif; tidak pernah satu-satunya alasan tinggi).
    if (!ac.signal.aborted) {
      const adapter = getProvider(provider.provider);
      const apiKey = provider.key.trim();
      if (adapter && apiKey) {
        for (const f of frames) {
          if (ac.signal.aborted) break;
          const snap = session.snapshot().frames.find((x) => x.id === f.id);
          if (!snap?.observation || snap.conceptSaturated !== undefined) continue;
          const key = snap.quality?.pixelHash ?? String(f.id);
          const hit = conceptCacheGet(key);
          if (hit) {
            session.applyRisk(f.id, { conceptSaturated: hit.startsWith('YA'), conceptNote: 'perkiraan subjektif, bukan data koleksi platform' });
            continue;
          }
          try {
            const text = await adapter.callText({
              apiKey,
              prompt: 'Konsep foto "' + snap.observation.main_subject + '" generik/terlalu umum (contoh: bunga/matahari terbenam/ikon sederhana)? Jawab YA/TIDAK + satu kalimat. Ini perkiraan subjektif, bukan data koleksi platform.',
              signal: ac.signal
            });
            const saturated = /^\s*YA\b/i.test(text);
            conceptCacheSet(key, (saturated ? 'YA' : 'TIDAK') + ' ' + text.slice(0, 120));
            session.applyRisk(f.id, { conceptSaturated: saturated, conceptNote: 'perkiraan subjektif, bukan data koleksi platform' });
          } catch { /* konsep gagal → biarkan tidak diketahui */ }
        }
      }
    }

    setBusy(false);
    abortRef.current = null;
    setProgress({ done: frames.length, total: frames.length });
  }

  /** Terapkan temuan crop lalu hitung ulang outcome (crop hanya menaikkan). */
  async function applyCropFindings(frameId: number, platform: Platform, findings: CropSignal[]): Promise<void> {
    const snap = session.snapshot().frames.find((x) => x.id === frameId);
    if (!snap?.quality) return;
    const m = snap.quality;
    const obs = snap.observation;
    const meta = snap.metadata[platform];
    const validation = validateMetadata(platform, meta, snap.portalName || snap.name);
    const blank = {
      hardErrors: validation.errors.length,
      hardErrorSummary: [],
      ipVisible: (obs?.visible_brands_logos.length ?? 0) > 0,
      releaseNeeded: Boolean(obs?.people.recognizable_face),
      releaseMarked: false,
      editorial: Boolean(snap.editorial),
      commercial: !snap.editorial,
      inSimilarCluster: (snap.similarGroup?.length ?? 0) > 1,
      similarIsBest: snap.similarBest ?? true,
      conceptSaturated: Boolean(snap.conceptSaturated),
      cropFindings: findings,
      belowMinResolution: { adobe: false, shutterstock: false }
    };
    const fallbackObs = { media_type: 'photo' as const, main_subject: '', secondary_subjects: [], people: { count: 0, recognizable_face: false, visible_actions: [] }, setting: '', time_or_lighting: '', viewpoint_composition: [], colors: [], mood_concepts: [], copy_space: false, isolated_background: false, visible_text: [], visible_brands_logos: [], landmarks_or_private_property: [], possible_ai_look: false, quality_issues: [], confidence: 0, theme_mismatch: false };
    // Risiko tidak boleh TURUN akibat crop: gabungkan dengan max().
    const prevAdobe = snap.riskAdobe?.overall;
    const prevShut = snap.riskShutterstock?.estimate;
    const adobe = assessAdobe(m, obs ?? fallbackObs, blank);
    const shut = assessShutterstock(m, obs ?? fallbackObs, blank, validation);
    const order = { rendah: 1, sedang: 2, tinggi: 3 } as const;
    let keepAdobe = adobe;
    if (prevAdobe && platform === 'adobe' && (order[prevAdobe as keyof typeof order] ?? 0) > (order[adobe.overall as keyof typeof order] ?? 0)) {
      keepAdobe = snap.riskAdobe as typeof adobe;
    }
    let keepShut = shut;
    if (prevShut && platform === 'shutterstock') {
      const rank = (e: string): number => (e === 'Kemungkinan ditolak' ? 3 : e.startsWith('Data licensing') ? 2 : 1);
      if (rank(prevShut) > rank(shut.estimate)) keepShut = snap.riskShutterstock as typeof shut;
    }
    session.applyRisk(frameId, {
      cropFindings: findings.map((x) => ({
        region: x.region,
        visible_noise: x.visible_noise,
        blur_or_soft: x.blur_or_soft,
        artifacts_or_halos: x.artifacts_or_halos,
        dust_or_sensor_spots: x.dust_or_sensor_spots,
        ai_glitches: x.ai_glitches,
        notes: ''
      })),
      cropNote: findings.some((x) => x.visible_noise === 'clear' || x.blur_or_soft === 'clear' || x.artifacts_or_halos === 'clear')
        ? 'inspeksi detail: temuan jelas terlihat'
        : 'inspeksi detail: tidak ada temuan jelas',
      riskAdobe: platform === 'adobe' ? keepAdobe : snap.riskAdobe,
      riskShutterstock: platform === 'shutterstock' ? keepShut : snap.riskShutterstock
    });
  }

  /** Konteks fakta risiko untuk juri (angka, bukan tafsir). */
  function riskContextFor(frame: Frame): string {
    return buildRiskContext({
      megapixels: frame.quality ? Math.round(frame.quality.megapixels * 100) / 100 : undefined,
      sharpnessGlobal: frame.quality?.sharpnessGlobal,
      highlightClipPct: frame.quality ? Math.round(frame.quality.highlightClipPct * 10) / 10 : undefined,
      shadowClipPct: frame.quality ? Math.round(frame.quality.shadowClipPct * 10) / 10 : undefined,
      noiseEstimate: frame.quality ? Math.round(frame.quality.noiseEstimate * 100) / 100 : undefined,
      adobeOverall: frame.riskAdobe?.overall,
      shutterEstimate: frame.riskShutterstock?.estimate,
      similarGroupSize: frame.similarGroup?.length,
      cropNote: frame.cropNote
    });
  }

  function cancel(): void {
    abortRef.current?.abort();
  }

  return {
    busy,
    progress,
    notice,
    detailInspect,
    setDetailInspect,
    compareHistory,
    setCompareHistory: setCompareHistoryState,
    filter,
    setFilter,
    riskOf,
    runAll,
    cancel,
    riskContextFor
  };
}
