'use client';
// State sesi kerja: frame, platform, frame terpilih, seq, tema batch — pulih dari localStorage
// saat mount, disimpan otomatis (debounce 500ms untuk edit teks, langsung untuk aksi struktural).
// Upload frame, edit metadata, dan batch generate dihook terpisah (M6–M8).
import { useCallback, useEffect, useRef, useState } from 'react';
import { fileStore } from '../lib/fileStore';
import { defaultMetadata, hasContent, mergeGenerated } from '../lib/metadata';
import type { AnalysisResult } from '../lib/types';
import type { ParsedMetadata } from '../lib/prompt';
import { loadSession, removeSession, saveSession } from '../lib/storage';
import type { Frame, FrameStatus, MetadataFor, MetadataSlots, Platform } from '../lib/types';

export interface SessionState {
  platform: Platform;
  frames: Frame[];
  sel: number | null;
  seq: number;
  tema: string;
}

const EMPTY: SessionState = { platform: 'adobe', frames: [], sel: null, seq: 0, tema: '' };
const SAVE_DELAY_MS = 500;

export function useSession() {
  const [state, setState] = useState<SessionState>(EMPTY);
  // Catatan sementara per frame (mis. "Menunggu limit reset (2/5, ~15 dtk)") — TIDAK dipersistenkan,
  // hanya untuk ditampilkan UI; setter dipakai M8 selama batch berjalan.
  const [notes, setNotes] = useState<Record<number, string>>({});
  // mirror sinkron supaya aksi beruntun tidak saling menimpa (seperti objek S global legacy)
  const mirror = useRef(state);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback((snap: SessionState, immediate: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const write = () => {
      saveSession({
        v: 1, ts: Date.now(), platform: snap.platform, sel: snap.sel,
        seq: snap.seq, tema: snap.tema, imgs: snap.frames
      });
    };
    if (immediate) write();
    else timer.current = setTimeout(write, SAVE_DELAY_MS);
  }, []);

  const commit = useCallback((next: SessionState, immediate: boolean) => {
    mirror.current = next;
    setState(next);
    persist(next, immediate);
  }, [persist]);

  // restore sesi tersimpan setelah mount (localStorage tidak ada di server → hindari mismatch).
  // Sinkronisasi satu kali, bukan cascading render.
  useEffect(() => {
    const s = loadSession();
    if (!s) return;
    const next: SessionState = { platform: s.platform, frames: s.imgs, sel: s.sel, seq: s.seq, tema: s.tema };
    mirror.current = next;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setState(next);
    persist(next, true);                      // legacy: tulis ulang setelah restore (normalisasi)
  }, [persist]);

  function setPlatform(p: Platform) {
    const cur = mirror.current;
    if (p === cur.platform) return;
    // [BARU] non-destruktif: hanya ganti platform aktif; slot metadata/status per platform tidak disentuh
    commit({ ...cur, platform: p }, true);             // aksi struktural → langsung
  }

  function select(id: number | null) {
    commit({ ...mirror.current, sel: id }, true);
  }

  // Aksi M6 — id diambil dari seq (0, 1, 2, …); frame pertama otomatis terpilih.
  function addFrame(f: Omit<Frame, 'id'>): number {
    const cur = mirror.current;
    const id = cur.seq;
    commit({ ...cur, frames: [...cur.frames, { ...f, id }], seq: cur.seq + 1, sel: cur.sel ?? id }, true);
    return id;
  }

  function removeFrame(id: number) {
    const cur = mirror.current;
    const idx = cur.frames.findIndex((f) => f.id === id);
    if (idx < 0) return;
    const frames = cur.frames.filter((f) => f.id !== id);
    // frame terpilih dihapus → pindah ke tetangga kanan, kalau tidak ada → kiri, kalau kosong → null
    const sel = cur.sel === id ? (frames[idx]?.id ?? frames[idx - 1]?.id ?? null) : cur.sel;
    fileStore.delete(id);                         // File asli ikut dilepas (B2 — jangan menumpuk di memori)
    commit({ ...cur, frames, sel }, true);
    setNotes((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function updateFrame(id: number, patch: Partial<Frame>) {
    const cur = mirror.current;
    commit({ ...cur, frames: cur.frames.map((f) => (f.id === id ? { ...f, ...patch } : f)) }, true);
  }

  function setNote(id: number, text: string) {
    setNotes((prev) => {
      if (!text) {                            // catatan kosong = hapus, jangan simpan kunci ''
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: text };
    });
  }

  function setTema(v: string) {
    commit({ ...mirror.current, tema: v }, false);   // edit teks → debounce 500ms
  }

  // Aksi M7 — edit metadata frame (slot per platform); slot dibuat saat pertama diisi.
  function updateMetadata<P extends Platform>(id: number, platform: P, patch: Partial<MetadataFor<P>>) {
    const cur = mirror.current;
    let hit = false;
    const frames = cur.frames.map((f) => {
      if (f.id !== id) return f;
      hit = true;
      const base = (f.metadata[platform] ?? defaultMetadata(platform)) as MetadataFor<P>;
      const next = { ...base, ...patch } as MetadataFor<P> & { categoryAuto?: boolean };
      // M11: user mengubah kategori sendiri → label "dipilih otomatis oleh sistem" tidak berlaku lagi
      if ('category' in patch || 'categories' in patch) delete next.categoryAuto;
      const content = hasContent(platform, next);
      // kontrak: ada isi → siap; slot dikosongkan → kembali menunggu (status 'gagal' &
      // 'memproses' dipertahankan — pesan error / proses batch tidak terganggu)
      const status: FrameStatus = content
        ? 'siap'
        : f.status[platform] === 'siap' ? 'menunggu' : f.status[platform];
      return {
        ...f,
        status: { ...f.status, [platform]: status },
        error: { ...f.error, [platform]: content ? '' : f.error[platform] },
        metadata: { ...f.metadata, [platform]: next } as MetadataSlots
      };
    });
    if (!hit) return;
    commit({ ...cur, frames }, false);                // edit teks → debounce 500ms
  }

  // Aksi M7 — tema khusus frame; '' / undefined = hapus override (ikuti tema batch).
  function setFrameTema(id: number, tema: string | undefined) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, tema: tema ?? '' } : f));
    commit({ ...cur, frames }, false);
  }

  // Aksi M8 — hasil generate masuk: merge field terisi saja (judul/deskripsi tidak pernah
  // ditimpa kosong); status mengikuti isi hasil merge — ada isi → 'siap', kosong → 'menunggu'
  // (kontrak: slot kosong tidak pernah 'siap'); error dibersihkan; persist langsung (bukan
  // debounce) supaya hasil model tidak hilang saat tab ditutup.
  function applyGenerated(id: number, platform: Platform, incoming: ParsedMetadata) {
    const cur = mirror.current;
    let hit = false;
    const frames = cur.frames.map((f) => {
      if (f.id !== id) return f;
      hit = true;
      const base = f.metadata[platform] ?? defaultMetadata(platform);
      const merged = mergeGenerated(platform, base, incoming);
      const status: FrameStatus = hasContent(platform, merged) ? 'siap' : 'menunggu';
      return {
        ...f,
        status: { ...f.status, [platform]: status },
        error: { ...f.error, [platform]: '' },
        metadata: { ...f.metadata, [platform]: merged } as MetadataSlots
      };
    });
    if (!hit) return;
    commit({ ...cur, frames }, true);
  }

  // Aksi M8 — frame gagal: pesan error asli untuk platform itu; slot metadata tidak diubah.
  function failFrame(id: number, platform: Platform, message: string) {    const cur = mirror.current;
    let hit = false;
    const frames = cur.frames.map((f) => {
      if (f.id !== id) return f;
      hit = true;
      const status: FrameStatus = 'gagal';
      return { ...f, status: { ...f.status, [platform]: status }, error: { ...f.error, [platform]: message } };
    });
    if (!hit) return;
    commit({ ...cur, frames }, true);
  }

  // Pipeline A-D: simpan observation vision ke cache sesi (platform-independen).
  function applyObservation(id: number, observation: Frame['observation']) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, observation } : f));
    commit({ ...cur, frames }, true);
  }

  // "Analisis ulang gambar": hapus cache observation (Tahap A dipanggil lagi).
  function clearObservation(id: number) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => {
      if (f.id !== id) return f;
      const next = { ...f };
      delete next.observation;
      return next;
    });
    commit({ ...cur, frames }, true);
  }

  // Nama file di portal (default = nama upload); toggle Shutterstock per frame.
  function setPortalName(id: number, portalName: string) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, portalName } : f));
    commit({ ...cur, frames }, false);
  }

  function setFrameFlags(id: number, patch: Pick<Frame, 'illustration' | 'editorial'>) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, ...patch } : f));
    commit({ ...cur, frames }, true);
  }

  // Cache juri kepatuhan per platform (hash metadata ikut tersimpan).
  function applyJudge(id: number, platform: Platform, entry: NonNullable<Frame['judge']>[Platform]) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (
      f.id === id ? { ...f, judge: { ...f.judge, [platform]: entry } } : f
    ));
    commit({ ...cur, frames }, true);
  }

  function clearJudge(id: number, platform: Platform) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => {
      if (f.id !== id || !f.judge?.[platform]) return f;
      const judge = { ...f.judge };
      delete judge[platform];
      return { ...f, judge };
    });
    commit({ ...cur, frames }, true);
  }

  // Aksi M29 — hasil analisis masuk: selalu ada verdict → analysisStatus 'siap';
  // error analisis dibersihkan; persist langsung (sama seperti applyGenerated).
  function applyAnalysis(id: number, platform: Platform, result: AnalysisResult) {
    const cur = mirror.current;
    let hit = false;
    const frames = cur.frames.map((f) => {
      if (f.id !== id) return f;
      hit = true;
      return {
        ...f,
        analysisStatus: { ...f.analysisStatus, [platform]: 'siap' as FrameStatus },
        analysisError: { ...f.analysisError, [platform]: '' },
        analysis: { ...f.analysis, [platform]: result }
      };
    });
    if (!hit) return;
    commit({ ...cur, frames }, true);
  }

  // Aksi M29 — analisis gagal: pesan error asli untuk platform itu; slot analisis tidak diubah.
  function failAnalysis(id: number, platform: Platform, message: string) {
    const cur = mirror.current;
    let hit = false;
    const frames = cur.frames.map((f) => {
      if (f.id !== id) return f;
      hit = true;
      return {
        ...f,
        analysisStatus: { ...f.analysisStatus, [platform]: 'gagal' as FrameStatus },
        analysisError: { ...f.analysisError, [platform]: message }
      };
    });
    if (!hit) return;
    commit({ ...cur, frames }, true);
  }

  // Risiko penolakan (ESTIMASI): metrik + outcome + similarity + crop + konsep.
  function applyRisk(id: number, patch: Partial<Frame>) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, ...patch } : f));
    commit({ ...cur, frames }, true);
  }

  function setActual(id: number, patch: Pick<Frame, 'actualAdobe' | 'actualShutterstock'>) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, ...patch } : f));
    commit({ ...cur, frames }, true);
  }

  function setHeld(id: number, held: boolean) {
    const cur = mirror.current;
    const frames = cur.frames.map((f) => (f.id === id ? { ...f, held } : f));
    commit({ ...cur, frames }, true);
  }

  // Baca state terbaru dari dalam callback async batch — `frames` yang lewat lewat closure render
  // bisa basi di tengah batch; mirror selalu sinkron dengan state terakhir.
  function snapshot(): SessionState {
    return mirror.current;
  }

  function newSession() {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    mirror.current = EMPTY;
    setState(EMPTY);
    setNotes({});
    removeSession();                          // API key tidak disentuh
  }

  return {
    ...state, notes, setPlatform, select, addFrame, removeFrame, updateFrame,
    updateMetadata, setFrameTema, applyGenerated, failFrame, applyAnalysis, failAnalysis,
    applyObservation, clearObservation, setPortalName, setFrameFlags,
    applyJudge, clearJudge, applyRisk, setActual, setHeld,
    snapshot, setNote, setTema, newSession
  };
}
