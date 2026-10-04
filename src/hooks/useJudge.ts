'use client';
// Juri kepatuhan multi-provider: paralel antar provider, serial antar frame, bisa dibatalkan.
// Cache per (frame, platform, hash metadata) di sesi — invalid otomatis saat metadata berubah.
// Hasil selalu SARAN (lihat JUDGE_DISCLAIMER), bukan keputusan platform.
import { useEffect, useRef, useState } from 'react';
import { fileStore } from '../lib/fileStore';
import { prepareImage } from '../lib/image';
import { buildFixPrompt, consensusJudge, hashMetadata, JUDGE_DISCLAIMER } from '../lib/judge';
import { hasContent } from '../lib/metadata';
import { JUDGE_IDEAL_COUNT, renderRulesBlock } from '../lib/platform-rules';
import { parseMetadataResponse, type ParsedMetadata } from '../lib/prompt';
import { getProvider } from '../lib/providers';
import { readBatchDelay, readCustomBaseUrl, readCustomModel, readJudgeImage, readKey, writeJudgeImage } from '../lib/storage';
import { validateMetadata } from '../lib/validate';
import type { Frame, JudgeCacheEntry, Platform, ProviderId } from '../lib/types';
import type { JudgeEntry } from '../lib/types';
import { PROVIDER_LABELS, type useProvider } from './useProvider';
import type { useSession } from './useSession';

type Session = ReturnType<typeof useSession>;
type ProviderApi = ReturnType<typeof useProvider>;

export const NO_JUDGE_MSG = 'Pilih minimal 1 juri yang key-nya tersimpan.';
export const NO_METADATA_MSG = 'Belum ada metadata — buat metadata dulu sebelum periksa kepatuhan.';
export const PRIVACY_MSG =
  'Privasi: gambar dan metadata dikirim ke SEMUA juri aktif. Konfirmasi sekali untuk lanjut.';
export const PRIVACY_KEY = 'stockmeta_judge_privacy';
const JUDGES_KEY = 'stockmeta_judges';

const JUDGE_IDS: readonly ProviderId[] = ['groq', 'gemini', 'custom'];

/** entry cache yang hash-nya masih cocok dengan metadata kini (basi → null) */
export function judgeEntryOf(frame: Frame, platform: Platform): JudgeCacheEntry | null {
  const entry = frame.judge?.[platform];
  if (!entry) return null;
  return entry.hash === hashMetadata(frame.metadata[platform]) ? entry : null;
}

export function readSelectedJudges(): ProviderId[] {
  try {
    const raw = localStorage.getItem(JUDGES_KEY);
    if (!raw) return [...JUDGE_IDS];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [...JUDGE_IDS];
    const ids = arr.filter((x): x is ProviderId => x === 'groq' || x === 'gemini' || x === 'custom');
    return ids.length ? [...new Set(ids)] : [...JUDGE_IDS];
  } catch { return [...JUDGE_IDS]; }
}

function writeSelectedJudges(ids: ProviderId[]): void {
  try { localStorage.setItem(JUDGES_KEY, JSON.stringify(ids)); } catch { /* diabaikan */ }
}

export function readPrivacyAck(): boolean {
  try { return localStorage.getItem(PRIVACY_KEY) === '1'; } catch { return false; }
}

export interface FixProposal {
  candidate: ParsedMetadata;
  diff: string[];
  hardErrors: number;
  hardWarnings: number;
}

function diffMetadata(before: Frame['metadata'][keyof Frame['metadata']], after: ParsedMetadata): string[] {
  const lines: string[] = [];
  if (!before || !after) return lines;
  if ('title' in before && 'title' in after && after.title !== undefined && before.title !== after.title) {
    lines.push(`Judul: "${before.title}" → "${after.title}"`);
  }
  if ('description' in before && 'description' in after && after.description !== undefined && before.description !== after.description) {
    lines.push(`Deskripsi: "${before.description}" → "${after.description}"`);
  }
  const bkw = 'keywords' in before ? (before.keywords as string[]) : [];
  const akw = after.keywords ?? bkw;
  const removed = bkw.filter((k) => !akw.map((x) => x.toLowerCase()).includes(k.toLowerCase()));
  const added = akw.filter((k) => !bkw.map((x) => x.toLowerCase()).includes(k.toLowerCase()));
  if (removed.length) lines.push(`Keyword dihapus: ${removed.join(', ')}`);
  if (added.length) lines.push(`Keyword ditambah: ${added.join(', ')}`);
  const bcat = 'category' in before ? String(before.category) : (before as { categories?: string[] }).categories?.join(', ') ?? '';
  const acat = after.category ?? '';
  if (acat && acat !== bcat) lines.push(`Kategori: "${bcat || '—'}" → "${acat}"`);
  return lines.length ? lines : ['(tidak ada perubahan)'];
}

export function useJudge(session: Session, provider: ProviderApi, opts?: { delayMs?: number }) {
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [progress, setProgress] = useState({ done: 0, failed: 0, total: 0 });
  const [summary, setSummary] = useState<{ done: number; failed: number; total: number; cancelled: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const [judges, setJudgesState] = useState<ProviderId[]>([...JUDGE_IDS]);
  const [sendImage, setSendImageState] = useState(true);
  const [privacyAcked, setPrivacyAcked] = useState(false);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setJudgesState(readSelectedJudges());
    setSendImageState(readJudgeImage());
    setPrivacyAcked(readPrivacyAck());
  }, []);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  function setJudges(ids: ProviderId[]) {
    const next = ids.filter((x): x is ProviderId => (JUDGE_IDS as readonly string[]).includes(x));
    if (!next.length) {
      setNotice(NO_JUDGE_MSG);
      return;
    }
    setJudgesState([...new Set(next)]);
    writeSelectedJudges([...new Set(next)]);
    setNotice('');
  }

  function setSendImage(on: boolean) {
    setSendImageState(on);
    writeJudgeImage(on);
  }

  function ackPrivacy() {
    try { localStorage.setItem(PRIVACY_KEY, '1'); } catch { /* diabaikan */ }
    setPrivacyAcked(true);
    setNotice('');
  }

  /** juri yang benar-benar bisa dipakai (terpilih + key tersimpan + custom terkonfigurasi) */
  function activeJudges(): ProviderId[] {
    return judges.filter((id) => {
      if (!readKey(id).trim()) return false;
      if (id === 'custom' && (!readCustomBaseUrl().trim() || !readCustomModel().trim())) return false;
      return true;
    });
  }

  function keyFor(id: ProviderId, activeKey: string): string {
    return id === provider.provider ? activeKey : readKey(id);
  }

  function customFor(id: ProviderId): { baseUrl?: string; model?: string } | undefined {
    if (id !== 'custom') return undefined;
    const cfg = id === provider.provider
      ? provider.getCustomConfig()
      : { baseUrl: readCustomBaseUrl(), model: readCustomModel() };
    return { baseUrl: cfg.baseUrl, model: cfg.model };
  }

  async function judgeOne(
    id: number,
    platform: Platform,
    activeKey: string,
    judgeIds: ProviderId[],
    signal?: AbortSignal
  ): Promise<JudgeCacheEntry> {
    const snap = session.snapshot();
    const frame = snap.frames.find((f) => f.id === id);
    if (!frame) throw new Error('Frame tidak ditemukan');
    const metadata = frame.metadata[platform];
    if (!metadata || !hasContent(platform, metadata)) throw new Error(NO_METADATA_MSG);

    // observation wajib — observasi dulu bila belum ada (di-cache di sesi)
    let observation = frame.observation;
    if (!observation) {
      const active = getProvider(provider.provider);
      if (!active || !active.supportsVision) {
        throw new Error('Tidak ada observation tersimpan dan provider aktif tidak mendukung gambar.');
      }
      const file = fileStore.get(id);
      if (!file) throw new Error('File asli tidak tersedia — upload ulang frame ini');
      observation = await active.observeImage({
        apiKey: activeKey,
        image: await prepareImage(file),
        theme: (frame.tema || snap.tema || '').trim() || undefined,
        signal,
        ...customFor(provider.provider)
      });
      session.applyObservation(id, observation);
    }

    // gambar diperkecil seperti Tahap A; hanya ke juri supportsVision
    const file = fileStore.get(id);
    const image = file ? await prepareImage(file) : undefined;

    const hard = validateMetadata(platform, metadata, frame.portalName || frame.name);
    const hardContext = hard.errors.length + hard.warnings.length
      ? [...hard.errors, ...hard.warnings].slice(0, 6).map((i) => `${i.rule} [${i.field}]: ${i.message}`).join('\n')
      : '';
    const metadataText = JSON.stringify(metadata);
    const rulesBlock = renderRulesBlock(platform);

    const settled = await Promise.allSettled(judgeIds.map(async (jid): Promise<JudgeEntry> => {
      const adapter = getProvider(jid);
      if (!adapter) throw new Error(`Provider ${jid} tidak tersedia`);
      const useImage = sendImage && adapter.supportsVision && image !== undefined;
      const output = await adapter.callJudge({
        apiKey: keyFor(jid, activeKey),
        image,
        sendImage: useImage,
        observation,
        metadataText,
        rulesBlock,
        hardContext,
        signal,
        ...customFor(jid)
      });
      return { provider: jid, output, withoutImage: !useImage };
    }));

    const entries: JudgeEntry[] = [];
    const failures: string[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') entries.push(r.value);
      else failures.push(`${PROVIDER_LABELS[judgeIds[i]]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    });
    // timeout/satu provider gagal → juri lain tetap dinilai (cache invalid hanya bila SEMUA gagal)
    if (!entries.length) throw new Error(failures.join(' · ') || 'Semua juri gagal');
    if (failures.length) session.setNote(id, failures.join(' · '));
    else session.setNote(id, '');

    const consensus = consensusJudge(hard.errors.length, entries.map((e) => e.output));
    const entry: JudgeCacheEntry = {
      hash: hashMetadata(metadata),
      badge: consensus.badge,
      consensus,
      judges: entries,
      at: Date.now()
    };
    session.applyJudge(id, platform, entry);
    return entry;
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

    const apiKey = provider.key.trim();
    const judgeIds = activeJudges();
    const delayMs = opts?.delayMs ?? readBatchDelay() * 1000;
    let done = 0;
    let failed = 0;
    let cancelled = false;

    for (let i = 0; i < ids.length; i++) {
      if (ac.signal.aborted) { cancelled = true; break; }
      if (i > 0 && delayMs > 0) {
        await new Promise<void>((res) => {
          const t = setTimeout(res, delayMs);
          ac.signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true });
        });
        if (ac.signal.aborted) { cancelled = true; break; }
      }
      const id = ids[i];
      setCurrentId(id);
      try {
        await judgeOne(id, platform, apiKey, judgeIds, ac.signal);
        done++;
      } catch (err) {
        failed++;
        session.setNote(id, err instanceof Error ? err.message : 'Juri gagal');
      }
      setProgress({ done, failed, total: ids.length });
    }
    setSummary({ done, failed, total: ids.length, cancelled });
    busyRef.current = false;
    abortRef.current = null;
    setCurrentId(null);
    setBusy(false);
  }

  function guard(): { platform: Platform; ids: number[] } | null {
    if (busyRef.current) return null;
    setNotice('');
    if (!privacyAcked) {
      setNotice(PRIVACY_MSG);
      return null;
    }
    const judgeIds = activeJudges();
    if (!judgeIds.length) {
      setNotice(NO_JUDGE_MSG);
      return null;
    }
    return { platform: session.platform, ids: [] };
  }

  function judgeAll() {
    const g = guard();
    if (!g) return;
    const ids = session.snapshot().frames
      .filter((f) => {
        const m = f.metadata[g.platform];
        return m !== undefined && hasContent(g.platform, m);
      })
      .map((f) => f.id);
    if (!ids.length) {
      setNotice(NO_METADATA_MSG);
      return;
    }
    void run(ids, g.platform);
  }

  function judgeFrame(id: number) {
    const g = guard();
    if (!g) return;
    void run([id], g.platform);
  }

  function cancel() {
    abortRef.current?.abort();
  }

  /**
   * "Perbaiki sesuai saran juri": metadata + fix gabungan → provider aktif,
   * hasil WAJIB lewat cek keras ulang; kembalikan kandidat + diff (tidak langsung menimpa).
   */
  async function requestFix(id: number, platform: Platform): Promise<FixProposal> {
    const frame = session.snapshot().frames.find((f) => f.id === id);
    if (!frame) throw new Error('Frame tidak ditemukan');
    const entry = judgeEntryOf(frame, platform);
    if (!entry) throw new Error('Periksa kepatuhan dulu sebelum meminta perbaikan.');
    const adapter = getProvider(provider.provider);
    if (!adapter) throw new Error('Provider tidak tersedia');
    const fixes = entry.consensus.checks.filter((c) => c.fix).map((c) => `${c.rule_id}: ${c.fix}`);
    const metadataText = JSON.stringify(frame.metadata[platform]);
    const text = await adapter.callText({
      apiKey: provider.key.trim(),
      prompt: buildFixPrompt(metadataText, fixes),
      ...customFor(provider.provider)
    });
    const candidate = parseMetadataResponse(text, platform);
    const hard = validateMetadata(platform, { ...frame.metadata[platform], ...candidate } as never, frame.portalName || frame.name);
    return {
      candidate,
      diff: diffMetadata(frame.metadata[platform], candidate),
      hardErrors: hard.errors.length,
      hardWarnings: hard.warnings.length
    };
  }

  function applyFix(id: number, platform: Platform, candidate: ParsedMetadata) {
    session.applyGenerated(id, platform, candidate);
    session.clearJudge(id, platform); // hash berubah → cache lama invalid
  }

  return {
    busy,
    currentId,
    progress,
    summary,
    notice,
    judges,
    setJudges,
    sendImage,
    setSendImage,
    privacyAcked,
    ackPrivacy,
    judgeNote: `juri: ${activeJudges().length} dari ${JUDGE_IDEAL_COUNT}`,
    disclaimer: JUDGE_DISCLAIMER,
    judgeFrame,
    judgeAll,
    cancel,
    entryOf: judgeEntryOf,
    requestFix,
    applyFix
  };
}
