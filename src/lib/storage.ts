// localStorage: API key provider, riwayat sesi (thumbnail saja), mode siang/malam.
// Port perilaku legacy/js/storage.js — semua operasi dibungkus try/catch (kuota penuh /
// mode privasi tidak boleh menjatuhkan aplikasi); tanpa DOM, tanpa React.
import type { AdobeMetadata, Frame, FrameStatus, MetadataSlots, Platform, ProviderId, ShutterstockMetadata } from './types';
import { BATCH_DELAY_DEFAULT_SEC, BATCH_DELAY_OPTIONS_SEC } from './limits';
import { hasContent } from './metadata';

const KEY_LS: Partial<Record<ProviderId, string>> = {
  gemini: 'stockmeta_gemini_key',
  groq: 'stockmeta_groq_key',
  openrouter: 'stockmeta_openrouter_key'
};

export const SESS_KEY = 'stockmeta_session';
export const THEME_KEY = 'stockmeta_theme';
export const BATCH_DELAY_KEY = 'stockmeta_batch_delay';
export const PROVIDER_KEY = 'stockmeta_provider';
export const FALLBACK_KEY = 'stockmeta_fallback';

function ls(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

/* ---------------- API key (hanya disimpan setelah tes lulus — keputusan pemanggil) ---------------- */

export function readKey(provider: ProviderId): string {
  const k = KEY_LS[provider];
  const s = ls();
  if (!k || !s) return '';
  try { return s.getItem(k) ?? ''; } catch { return ''; }
}

export function writeKey(provider: ProviderId, key: string): void {
  const k = KEY_LS[provider];
  const s = ls();
  if (!k || !s) return;
  try { s.setItem(k, key); } catch { /* diabaikan, sama seperti legacy */ }
}

/* ---------------- pilihan provider (M11: default Groq, pilihan user dihormati) ---------------- */

export function readProvider(): ProviderId | null {
  try {
    const v = ls()?.getItem(PROVIDER_KEY);
    // nilai warisan 'coming-soon' (pra-penghapusan placeholder) dianggap tak sah → default
    return v === 'gemini' || v === 'groq' || v === 'openrouter' ? v : null;
  } catch { return null; }
}

export function writeProvider(provider: ProviderId): void {
  try { ls()?.setItem(PROVIDER_KEY, provider); } catch { /* diabaikan */ }
}

/* ---------------- fallback antar provider (toggle panel, default: aktif) ---------------- */

export function readFallback(): boolean {
  try { return ls()?.getItem(FALLBACK_KEY) !== '0'; } catch { return true; }
}

export function writeFallback(enabled: boolean): void {
  try { ls()?.setItem(FALLBACK_KEY, enabled ? '1' : '0'); } catch { /* diabaikan */ }
}

/* ---------------- riwayat sesi ---------------- */

export interface StoredSession {
  v: 1;
  ts: number;
  platform: Platform;
  sel: number | null;
  seq: number;
  tema: string;
  imgs: Frame[];
}

const FRAME_STATUS: FrameStatus[] = ['menunggu', 'memproses', 'siap', 'gagal'];
const LEGACY_FLAT_KEYS = ['title', 'desc', 'description', 'keywords', 'category', 'cat', 'categories'] as const;

function coerceStatus(v: unknown): FrameStatus {
  return FRAME_STATUS.includes(v as FrameStatus) ? v as FrameStatus : 'menunggu';
}

function keywordsOf(o: Record<string, unknown>): string[] {
  return Array.isArray(o.keywords) ? o.keywords.map((k) => String(k)) : [];
}

function coerceAdobe(o: Record<string, unknown>): AdobeMetadata {
  return {
    title: typeof o.title === 'string' ? o.title : '',
    keywords: keywordsOf(o),
    category: typeof o.category === 'string' ? o.category : '',
    // M11: tanda "kategori dipilih otomatis" ikut tersimpan supaya sarannya tetap ada setelah reload
    ...(o.categoryAuto === true ? { categoryAuto: true } : {}),
    ...(o.themeMismatch === true ? { themeMismatch: true } : {})
  };
}

function coerceShutter(o: Record<string, unknown>): ShutterstockMetadata {
  const cats = Array.isArray(o.categories) ? o.categories.map(String)
    : typeof o.category === 'string' && o.category ? [o.category]
    : typeof o.cat === 'string' && o.cat ? [o.cat] : [];
  return {
    description: typeof o.description === 'string' ? o.description
      : typeof o.desc === 'string' ? o.desc : '',
    keywords: keywordsOf(o),
    categories: cats,
    ...(o.categoryAuto === true ? { categoryAuto: true } : {}),
    ...(o.themeMismatch === true ? { themeMismatch: true } : {})
  };
}

// data flat (M4 awal / legacy) dianggap "berisi" hanya kalau ada nilai bermakna
function flatHasData(o: Record<string, unknown>): boolean {
  if (keywordsOf(o).some((k) => k.trim())) return true;
  for (const k of LEGACY_FLAT_KEYS) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return true;
    if (Array.isArray(v) && v.some((x) => String(x).trim())) return true;
  }
  return false;
}

// Migrasi format lama → slot per platform. Format lama:
//  (a) legacy: title/desc/keywords/cat + done/failed/err menempel di frame (tanpa metadata);
//  (b) M4 awal: metadata flat + status/error string.
// Format baru: metadata {adobe?, shutterstock?} + status/error per platform.
function coerceFrame(raw: unknown, platform: Platform): Frame | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const mdRaw = (typeof o.metadata === 'object' && o.metadata !== null ? o.metadata : {}) as Record<string, unknown>;
  const hasSlots = 'adobe' in mdRaw || 'shutterstock' in mdRaw;

  const metadata: MetadataSlots = {};
  const status: Record<Platform, FrameStatus> = { adobe: 'menunggu', shutterstock: 'menunggu' };
  const error: Record<Platform, string> = { adobe: '', shutterstock: '' };

  if (hasSlots) {
    const a = mdRaw.adobe;
    if (typeof a === 'object' && a !== null) metadata.adobe = coerceAdobe(a as Record<string, unknown>);
    const s = mdRaw.shutterstock;
    if (typeof s === 'object' && s !== null) metadata.shutterstock = coerceShutter(s as Record<string, unknown>);
    if (typeof o.status === 'object' && o.status !== null) {
      const st = o.status as Record<string, unknown>;
      status.adobe = coerceStatus(st.adobe);
      status.shutterstock = coerceStatus(st.shutterstock);
    }
    if (typeof o.error === 'object' && o.error !== null) {
      const er = o.error as Record<string, unknown>;
      error.adobe = typeof er.adobe === 'string' ? er.adobe : '';
      error.shutterstock = typeof er.shutterstock === 'string' ? er.shutterstock : '';
    }
  } else {
    const flat: Record<string, unknown> = { ...mdRaw };
    for (const k of LEGACY_FLAT_KEYS) if (!(k in flat) && k in o) flat[k] = o[k];
    if (flatHasData(flat)) {
      if (platform === 'adobe') metadata.adobe = coerceAdobe(flat);
      else metadata.shutterstock = coerceShutter(flat);
    }
    if (typeof o.done === 'boolean' || typeof o.failed === 'boolean') {
      status[platform] = o.failed ? 'gagal' : o.done ? 'siap' : 'menunggu';
    } else if (typeof o.status === 'string') {
      status[platform] = coerceStatus(o.status);
    }
    error[platform] = typeof o.error === 'string' ? o.error : typeof o.err === 'string' ? o.err : '';
  }

  // selaraskan status dengan isi slot platform aktif: 'memproses' → 'menunggu' (batch tak
  // pernah jalan setelah reload), ada isi → 'siap', slot kosong (atau kosong isinya) →
  // 'menunggu'; 'gagal' dipertahankan (pesan error tetap tampil meski slot kosong)
  const filled = metadata[platform] !== undefined && hasContent(platform, metadata[platform]);
  if (status[platform] === 'memproses') status[platform] = 'menunggu';
  if (filled && status[platform] === 'menunggu') status[platform] = 'siap';
  if (!filled && status[platform] === 'siap') status[platform] = 'menunggu';

  return {
    id: Number(o.id) || 0,                       // id kosong → 0; diperbaiki pemanggil (nambah seq)
    name: typeof o.name === 'string' && o.name ? o.name : 'frame',
    thumb: typeof o.thumb === 'string' ? o.thumb : '',
    tema: typeof o.tema === 'string' ? o.tema : '',
    status, error, metadata
  };
}

export function saveSession(sess: StoredSession): void {
  const s = ls();
  if (!s) return;
  if (!sess.imgs.length) {
    try { s.removeItem(SESS_KEY); } catch { /* abaikan */ }
    return;
  }
  try { s.setItem(SESS_KEY, JSON.stringify(sess)); return; } catch { /* kuota penuh → lanjut */ }
  // kuota penuh — ulangi tanpa thumbnail supaya metadata tetap tersimpan
  try {
    s.setItem(SESS_KEY, JSON.stringify({ ...sess, imgs: sess.imgs.map((f) => ({ ...f, thumb: '' })) }));
  } catch { /* tetap gagal → abaikan, sama seperti legacy */ }
}

// null + kunci dihapus = sesi tidak ada/rusak (legacy membuang kunci yang tak terbaca)
export function loadSession(): StoredSession | null {
  const s = ls();
  if (!s) return null;
  let raw = '';
  try { raw = s.getItem(SESS_KEY) ?? ''; } catch { return null; }
  if (!raw) return null;

  let d: unknown = null;
  try { d = JSON.parse(raw); } catch { d = null; }
  const o = (typeof d === 'object' && d !== null ? d : null) as Record<string, unknown> | null;
  if (!o || !Array.isArray(o.imgs) || !o.imgs.length) { removeSession(); return null; }

  let seq = Number(o.seq) || 0;
  const platform: Platform = o.platform === 'shutterstock' ? 'shutterstock' : 'adobe';
  const imgs: Frame[] = [];
  for (const it of o.imgs) {
    const f = coerceFrame(it, platform);
    if (!f) continue;
    if (!f.id) f.id = ++seq;
    imgs.push(f);
  }
  if (!imgs.length) { removeSession(); return null; }
  seq = Math.max(seq, ...imgs.map((f) => f.id));
  const sel = Number(o.sel);
  return {
    v: 1,
    ts: Number(o.ts) || Date.now(),
    platform,
    sel: imgs.some((f) => f.id === sel) ? sel : null,
    seq,
    tema: typeof o.tema === 'string' ? o.tema : '',
    imgs
  };
}

export function removeSession(): void {
  try { ls()?.removeItem(SESS_KEY); } catch { /* abaikan */ }
}

/* ---------------- mode siang/malam ---------------- */

export type Theme = 'light' | 'dark';

export function readTheme(): Theme | null {
  try {
    const t = ls()?.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch { return null; }
}

export function writeTheme(t: Theme): void {
  try { ls()?.setItem(THEME_KEY, t); } catch { /* abaikan */ }
}

/* ---------------- jeda antar foto (detik) ---------------- */

const delayOptions: readonly number[] = BATCH_DELAY_OPTIONS_SEC;

export function readBatchDelay(): number {
  try {
    const n = Number(ls()?.getItem(BATCH_DELAY_KEY));
    return delayOptions.includes(n) ? n : BATCH_DELAY_DEFAULT_SEC;
  } catch { return BATCH_DELAY_DEFAULT_SEC; }
}

export function writeBatchDelay(sec: number): void {
  try { ls()?.setItem(BATCH_DELAY_KEY, String(delayOptions.includes(sec) ? sec : BATCH_DELAY_DEFAULT_SEC)); }
  catch { /* abaikan */ }
}
