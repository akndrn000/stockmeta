'use client';
// Kata kunci sebagai chip (enter/koma/tempel pecah semua), dedupe + batas dari lib/keywords.
// Salin daftar (format dipisah koma) lewat satu tombol di samping label — M12: kotak
// "Kata kunci (siap tempel)" dihapus. M13: daftar chip dibatasi 200px + scroll, penghitung
// & badge menempel di pojok kanan bawah kotak input.
import { useState } from 'react';
import { addKeywords, keywordsToPlain, parseKeywordInput, removeKeyword } from '../lib/keywords';
import { MAX_KEYWORDS } from '../lib/limits';
import { CopyButton } from './CopyButton';

function skipMessage(dup: number, over: number): string {
  const parts: string[] = [];
  if (dup) parts.push(`${dup} duplikat`);
  if (over) parts.push(`${over} melebihi batas`);
  return parts.length ? `${parts.join(' dan ')} dilewati.` : '';
}

export function KeywordEditor({ keywords, min, onChange, disabled }: {
  keywords: string[];
  min: number;
  onChange: (list: string[]) => void;
  /** M14: nonaktifkan salin + input saat belum ada frame terpilih (CaptionSheet) */
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [skip, setSkip] = useState('');
  const plain = keywordsToPlain(keywords);
  const n = keywords.length;
  const full = n >= MAX_KEYWORDS;

  function commit(text: string) {
    const incoming = parseKeywordInput(text);
    const r = incoming.length ? addKeywords(keywords, incoming) : null;
    if (r && r.addedCount) onChange(r.list);
    setSkip(r ? skipMessage(r.skippedDuplicate, r.skippedOverLimit) : '');
    setDraft('');
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="kw-input" className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3">
          Kata kunci
        </label>
        <CopyButton text={plain} label="daftar kata kunci" disabled={disabled} />
      </div>

      {/* M13: SATU-satunya pengecualian "tanpa scroll internal" (M12) — daftar bisa 50 chip,
          jadi dibatasi 12.5rem (200px di root 16px, ikut membesar bila font root naik — M14);
          hanya daftar chip ini, input & panel lain tetap mengalir. */}
      {n > 0 && (
        <ul className="scroll-slim flex max-h-[12.5rem] flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
          {keywords.map((k, i) => (
            <li
              key={`${k.toLowerCase()}-${i}`}
              className="inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-well pl-2 pr-1 py-0.5 text-[12px] text-ink"
            >
              <span className="min-w-0 truncate" title={k}>{k}</span>
              <button
                type="button"
                onClick={() => onChange(removeKeyword(keywords, i))}
                aria-label={`Hapus kata kunci ${k}`}
                title={`Hapus kata kunci ${k}`}
                className="btn-compact relative grid h-5 w-5 place-items-center rounded text-ink-3 transition-colors hover:bg-wash hover:text-fail before:absolute before:-inset-2.5 before:content-['']"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* M13: penghitung & badge status menempel di pojok kanan bawah kotak input —
          pr-24 menyisakan ruang supaya teks yang diketik tidak lewat di bawahnya. */}
      <div className="relative">
        <input
          id="kw-input"
          type="text"
          value={draft}
          disabled={disabled || (full && draft === '')}
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
          className="w-full rounded-lg border border-line bg-well px-3 py-2 pr-24 text-[13.5px] text-ink placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="pointer-events-none absolute bottom-1 right-2.5 flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
            {n}/{MAX_KEYWORDS}
          </span>
          {n < min && (
            <span className="rounded border border-dashed border-line px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
              min {min}
            </span>
          )}
          {full && (
            <span className="rounded border border-accent-text bg-accent-wash px-1.5 py-px font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-accent-text">
              penuh
            </span>
          )}
        </span>
      </div>

      <p role="status" aria-live="polite" className="min-h-4 text-[12px] font-medium text-ink-2">
        {skip}
      </p>
    </div>
  );
}
