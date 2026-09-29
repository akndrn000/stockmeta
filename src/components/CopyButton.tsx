'use client';
// Tombol salin per field: clipboard modern → fallback execCommand, feedback "Disalin" 1,4 detik.
import { useEffect, useRef, useState } from 'react';

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function CopyButton({ text, label, disabled = false }: {
  text: string;
  label: string;
  disabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const off = disabled || !text;

  async function copy() {
    if (off) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => void copy()}
        disabled={off}
        aria-label={`Salin ${label}`}
        title={copied ? 'Disalin' : `Salin ${label}`}
        className={`inline-flex h-7 items-center gap-1 rounded-md border border-transparent px-1.5 text-text-secondary transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
          copied
            ? 'border-success/40 bg-success-tint text-success'
            : 'hover:border-border-control hover:bg-accent-tint hover:text-text active:bg-accent-tint'
        }`}
      >
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 7.5l3 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9.5 4.5v-1A1.5 1.5 0 0 0 8 2H3A1.5 1.5 0 0 0 1.5 3.5V8A1.5 1.5 0 0 0 3 9.5h1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
        <span className="text-body font-semibold">{copied ? 'Disalin' : 'Salin'}</span>
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? 'Disalin' : ''}</span>
    </span>
  );
}
