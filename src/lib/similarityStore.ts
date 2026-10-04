// Riwayat lokal kemiripan — HANYA hash + metadata ringkas (judul/keyword,
// platform, tanggal). TIDAK PERNAH menyimpan gambar. Batas jumlah + toggle +
// hapus + impor/ekspor JSON.
import type { HashSet } from './similarity';

export interface HistoryEntry {
  hash: string;
  title: string;
  keywords: string[];
  platform: string;
  date: string;
  hashes: HashSet;
}

const LS_KEY = 'stockmeta_similarity_history';
const TOGGLE_KEY = 'stockmeta_similarity_history_on';
export const HISTORY_MAX = 300;

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readHistoryEnabled(): boolean {
  try {
    return ls()?.getItem(TOGGLE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeHistoryEnabled(on: boolean): void {
  try {
    ls()?.setItem(TOGGLE_KEY, on ? '1' : '0');
  } catch { /* diabaikan */ }
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = ls()?.getItem(LS_KEY);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e): e is HistoryEntry => {
      if (typeof e !== 'object' || e === null) return false;
      const o = e as Record<string, unknown>;
      // WAJIB hash + hashes; entri ber-gambar (thumb/base64/dataUrl) DITOLAK.
      if (typeof o.hash !== 'string' || typeof o.title !== 'string') return false;
      if (typeof o.hashes !== 'object' || o.hashes === null) return false;
      if ('thumb' in o || 'base64' in o || 'dataUrl' in o || 'image' in o) return false;
      return true;
    }).slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function persist(list: HistoryEntry[]): void {
  try {
    ls()?.setItem(LS_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch { /* diabaikan */ }
}

export function addHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = loadHistory().filter((e) => e.hash !== entry.hash);
  list.unshift(entry);
  persist(list);
  return list;
}

export function clearHistory(): void {
  try {
    ls()?.removeItem(LS_KEY);
  } catch { /* diabaikan */ }
}

export function exportHistory(): string {
  return JSON.stringify(loadHistory(), null, 2);
}

/** Impor JSON — hanya entri hash (tanpa gambar); entri ber-gambar dibuang. */
export function importHistory(json: string): { imported: number; skipped: number } {
  let arr: unknown = null;
  try {
    arr = JSON.parse(json);
  } catch {
    throw new Error('JSON riwayat tidak valid');
  }
  if (!Array.isArray(arr)) throw new Error('JSON riwayat harus array');
  const cur = loadHistory();
  let imported = 0;
  let skipped = 0;
  for (const e of arr) {
    if (typeof e !== 'object' || e === null) {
      skipped++;
      continue;
    }
    const o = e as Record<string, unknown>;
    if (typeof o.hash !== 'string' || typeof o.hashes !== 'object' || o.hashes === null) {
      skipped++;
      continue;
    }
    if ('thumb' in o || 'base64' in o || 'dataUrl' in o || 'image' in o) {
      skipped++;
      continue;
    }
    if (cur.some((x) => x.hash === o.hash)) {
      skipped++;
      continue;
    }
    cur.push({
      hash: o.hash as string,
      title: typeof o.title === 'string' ? o.title : '',
      keywords: Array.isArray(o.keywords) ? (o.keywords as unknown[]).map((k) => String(k)) : [],
      platform: typeof o.platform === 'string' ? o.platform : '',
      date: typeof o.date === 'string' ? o.date : '',
      hashes: o.hashes as HashSet
    });
    imported++;
  }
  persist(cur.slice(0, HISTORY_MAX));
  return { imported, skipped };
}
