'use client';
// Mode siang/malam: ikuti preferensi sistem selama user belum memilih sendiri,
// override manual disimpan di localStorage ('stockmeta_theme'), diterapkan ke data-theme.
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { readTheme, writeTheme } from '../lib/storage';
import type { Theme } from '../lib/storage';

const MQ = '(prefers-color-scheme: light)';

// Panduan Next 16 (Preventing Flash): di dev, StrictMode me-remount <html> dan menghapus
// atribut yang diset inline script; owner tema harus menerapkannya lagi sebelum paint.
// useLayoutEffect aman di sini karena file ini hanya dirender klien ('use client');
// guard tetap dipakai supaya tidak ada warning saat SSR komponen klien.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function systemTheme(): Theme {
  try {
    return window.matchMedia && window.matchMedia(MQ).matches ? 'light' : 'dark';
  } catch { return 'dark'; }
}

export function useTheme() {
  // baca storage saat inisialisasi (server → 'dark'); markup tidak pernah bergantung pada
  // theme (hanya atribut data-theme di effect) sehingga aman terhadap hydration mismatch
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return readTheme() ?? systemTheme();
  });

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia ? window.matchMedia(MQ) : null; } catch { mq = null; }
    if (!mq?.addEventListener) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (!readTheme()) setTheme(e.matches ? 'light' : 'dark');   // ikut sistem hanya saat belum override
    };
    mq.addEventListener('change', onChange);
    return () => mq?.removeEventListener('change', onChange);
  }, []);

  useIsoLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    // Motion C: transisi warna 250ms HANYA saat klik manual — class dilepas lagi,
    // tidak saat load awal / pergantian sistem, dan dilewati bila reduced motion.
    try {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (!reduce) {
        document.documentElement.classList.add('theme-fade');
        setTimeout(() => document.documentElement.classList.remove('theme-fade'), 300);
      }
    } catch { /* abaikan — tema tetap berganti */ }
    setTheme(next);
    writeTheme(next);
  }, [theme]);

  return { theme, toggle };
}
