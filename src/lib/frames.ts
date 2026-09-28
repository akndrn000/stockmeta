// Filter file masuk — murni, tanpa DOM. Urutan pertama dipertahankan.
// Teks pesan memakai konstanta dari limits.ts (jangan menulis batas literal).
import { ACCEPTED_TYPES, MAX_FRAMES } from './limits';

export interface FilterResult {
  accepted: File[];
  rejectedType: File[];
  skippedOverLimit: File[];
}

export function filterIncomingFiles(files: File[], existingCount: number): FilterResult {
  const accepted: File[] = [];
  const rejectedType: File[] = [];
  const skippedOverLimit: File[] = [];
  const slots = Math.max(0, MAX_FRAMES - existingCount);
  for (const f of files) {
    // tipe salah TIDAK menghabiskan slot — ditolak dulu, baru dihitung batas
    if (!ACCEPTED_TYPES.includes(f.type)) rejectedType.push(f);
    else if (accepted.length < slots) accepted.push(f);
    else skippedOverLimit.push(f);
  }
  return { accepted, rejectedType, skippedOverLimit };
}

/** Pesan Indonesia untuk catatan batas; '' kalau tidak ada yang ditolak/dilewati. */
export function buildLimitMessage(result: FilterResult): string {
  const parts: string[] = [];
  if (result.skippedOverLimit.length > 0) {
    parts.push(
      `Dipertahankan ${result.accepted.length}, dilewati ${result.skippedOverLimit.length} — satu batch maksimal ${MAX_FRAMES} frame.`
    );
  }
  if (result.rejectedType.length > 0) {
    parts.push(`${result.rejectedType.length} file dilewati: hanya JPG, PNG, dan WEBP.`);
  }
  return parts.join(' ');
}
