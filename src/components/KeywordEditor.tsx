'use client';
// Kata kunci sebagai chip (enter/koma/tempel pecah semua), dedupe + batas dari lib/keywords.
// Salin daftar (format dipisah koma) lewat satu tombol di samping label — M12: kotak
// "Kata kunci (siap tempel)" dihapus, tidak ada textarea mirror lagi.
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

export function KeywordEditor({ keywords, min, onChange }: {
  keywords: string[];
  min: number;
  onChange: (list: string[]) => void;
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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="kw-input" className="text-[11px] font-semibold leading-none tracking-[0.01em] text-ink-3">
          Kata kunci
        </label>
        <CopyButton text={plain} label="daftar kata kunci" />
      </div>

      {n > 0 && (
        <ul className="flex flex-wrap gap-1.5">
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

      <input
        id="kw-input"
        type="text"
        value={draft}
        disabled={full && draft === ''}
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
        className="w-full rounded-lg border border-line bg-well px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
      />

      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
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
      </div>

      <p role="status" aria-live="polite" className="min-h-4 text-[12px] font-medium text-ink-2">
        {skip}
      </p>
    </div>
  );
}
