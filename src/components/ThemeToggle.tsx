'use client';
import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';

// Tombol tema: kedua ikon selalu dirender, CSS memilih yang tampil dari data-theme
// (lihat globals.css) sehingga markup identik saat hydration. aria-label/title bergantung
// pada state → suppressHydrationWarning di elemen tombol (state klien bisa beda dari server).
// Motion C: saat klik, bungkus ikon berputar 180deg (≤300ms) sambil tema berganti instan.
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const [spin, setSpin] = useState(false);
  const label = theme === 'dark' ? 'Aktifkan mode siang' : 'Aktifkan mode malam';

  function handleClick() {
    toggle();
    setSpin(true);
    setTimeout(() => setSpin(false), 300);
  }

  return (
    // M27: 40px di <640px (sm: kembali 36px desktop); tinggi ≥44px di layar
    // kecil sudah dijamin blok min-height CSS di globals.
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      suppressHydrationWarning
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface text-text-secondary transition-colors duration-150 hover:border-accent/70 hover:bg-accent-tint hover:text-text active:bg-accent-tint sm:h-9 sm:w-9"
    >
      <span className={spin ? 'theme-spin inline-flex' : 'inline-flex'} aria-hidden="true">
      <span className="theme-icon-moon inline-flex" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
      <span className="theme-icon-sun" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      </span>
      </span>
    </button>
  );
}
