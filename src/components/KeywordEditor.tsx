'use client';
// Kata kunci sebagai chip (enter/koma/tempel pecah semua), dedupe + batas dari lib/keywords.
// Salin daftar (format dipisah koma) lewat satu tombol di samping label — M12: kotak
// "Kata kunci (siap tempel)" dihapus. M13: daftar chip dibatasi 200px + scroll.
// M18: penghitung `n/50` + badge `min N`/`penuh` keluar dari dalam kotak input (posisi M13,
// ruang cadangan `pr-24`) → sebaris dengan label, di kiri tombol salin. Input kembali px-3.
import { useState } from 'react';
import { addKeywords, keywordsToPlain, parseKeywordInput, removeKeyword } from '../lib/keywords';
import { MAX_KEYWORDS } from '../lib/limits';
import { CopyButton } from './CopyButton';
import { LabelRow } from './LabelRow';

function skipMessage(dup: number, over: number): string {
  const parts: string[] = [];
  if (dup) parts.push(`${dup} duplikat`);
  if (over) parts.push(`${over} melebihi batas`);
  return parts.length ? `${parts.join(' dan ')} dilewati.` : '';
}

export function KeywordEditor({ keywords, min, max = MAX_KEYWORDS, onChange, disabled }: {
  keywords: string[];
  min: number;
  /** M24: batas atas per platform — Adobe 49 (contoh resmi), Shutterstock 50 */
  max?: number;
  onChange: (list: string[]) => void;
  /** M14: nonaktifkan salin + input saat belum ada frame terpilih (CaptionSheet) */
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [skip, setSkip] = useState('');
  const plain = keywordsToPlain(keywords);
  const n = keywords.length;
  const full = n >= max;

  function commit(text: string) {
    const incoming = parseKeywordInput(text);
    const r = incoming.length ? addKeywords(keywords, incoming, max) : null;
    if (r && r.addedCount) onChange(r.list);
    setSkip(r ? skipMessage(r.skippedDuplicate, r.skippedOverLimit) : '');
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Fase 2: pola baris label sama dengan Field — satu baris nowrap, tinggi tetap. */}
      <LabelRow
        id="kw-input"
        label="Kata kunci"
        right={
          <>
            <span id="kw-count" className="flex shrink-0 items-center gap-1.5">
              {/* M16: badge meta kecil (penghitung, min, penuh) = teks polos tanpa kotak —
                  hanya badge STATUS (berwarna aktif) yang memakai garis 2px. */}
              <span className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-text-muted tabular-nums">
                {n}/{max}
              </span>
              {n < min && (
                <span className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-warning tabular-nums">
                  min {min}
                </span>
              )}
              {full && (
                <span className="font-mono text-meta font-bold uppercase tracking-[0.08em] text-accent-text">
                  penuh
                </span>
              )}
            </span>
            <CopyButton text={plain} label="daftar kata kunci" disabled={disabled} />
          </>
        }
      />

      {/* M13: SATU-satunya pengecualian "tanpa scroll internal" (M12) — daftar bisa 50 chip,
          jadi dibatasi 12.5rem (200px di root 16px, ikut membesar bila font root naik — M14);
          hanya daftar chip ini, input & panel lain tetap mengalir.
          M15: chip MEMBUNGKUS ke baris baru (flex-wrap) dan scroll hanya VERTIKAL —
          overflow-x dinyatakan hidden: mengisi overflow-y:auto saja membuat overflow-x
          terhitung "auto" oleh CSS (pelebaran klik pseudo-element tombol hapus), sehingga
          muncul scrollbar horizontal di daftar chip. */}
      {n > 0 && (
        <ul className="scroll-slim flex max-h-[12.5rem] flex-wrap gap-1.5 overflow-y-auto overflow-x-hidden overscroll-contain">
          {keywords.map((k, i) => (
            <li
              key={`${k.toLowerCase()}-${i}`}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface-elevated py-1 pl-3 pr-1.5 text-small text-text transition-colors duration-150 hover:border-border-strong"
            >
              <span className="min-w-0 truncate" title={k}>{k}</span>
              <button
                type="button"
                onClick={() => onChange(removeKeyword(keywords, i))}
                aria-label={`Hapus kata kunci ${k}`}
                title={`Hapus kata kunci ${k}`}
                className="btn-compact relative grid h-5 w-5 place-items-center rounded-full text-text-muted transition-colors duration-150 hover:bg-error-tint hover:text-error before:absolute before:-inset-3 before:content-['']"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* M18: tidak ada lagi penghitung di dalam kotak → wrapper `relative` dan `pr-24`
          (ruang cadangan) dihapus; input kembali px-3 seperti kotak isian lain. */}
      <input
        id="kw-input"
        type="text"
        value={draft}
        disabled={disabled || (full && draft === '')}
        aria-describedby="kw-count"
        onChange={(e) => {
          const v = e.target.value;
          if (/[,;\n]/.test(v)) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && draft === '' && keywords.length) {
            onChange(removeKeyword(keywords, keywords.length - 1));
            setSkip('');
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          commit(e.clipboardData.getData('text'));
        }}
        placeholder={full ? 'Penuh — hapus salah satu dulu' : 'Ketik kata kunci, pisahkan koma atau Enter'}
        spellCheck={false}
        autoCapitalize="none"
        className="h-10 w-full rounded-md border border-border-control bg-surface-elevated px-3 py-2 text-body text-text transition-colors duration-150 placeholder:text-text-muted hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {/* M19 (E.3): saat kosong baris ini jadi sr-only — ruang kosong 16px di bawah input
          hilang, tapi elemen aria-live tetap ada di DOM supaya pesan dilewati tetap diumumkan. */}
      <p
        role="status"
        aria-live="polite"
        className={`text-small font-medium text-text-secondary ${skip ? 'min-h-4' : 'sr-only'}`}
      >
        {skip}
      </p>
    </div>
  );
}
