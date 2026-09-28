'use client';
// State koneksi provider: pilih provider, input API key, tes koneksi.
// Kontrak legacy: key hanya disimpan SETEHAH tes lulus; pindah provider → key di-restore
// dari localStorage (kalau field kosong) dan status selalu reset ke 'Belum dites'.
import { useEffect, useRef, useState } from 'react';
import { getProvider } from '../lib/providers';
import { readKey, writeKey } from '../lib/storage';
import type { ConnectionStatus, ProviderId } from '../lib/types';

export const SOON_NOTE = 'Provider tambahan akan segera hadir';

export const KEY_NOTES: Record<ProviderId, string> = {
  gemini: 'Gemini: key disimpan di browser setelah tes berhasil (stockmeta_gemini_key).',
  groq: 'Groq: key disimpan di browser setelah tes berhasil (stockmeta_groq_key).',
  'coming-soon': SOON_NOTE
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  'coming-soon': 'Coming Soon'
};

export const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: 'Belum dites',
  testing: 'Menguji…',
  ok: 'Aktif',
  fail: 'Gagal'
};

const TESTING_NOTES: Record<'gemini' | 'groq', string> = {
  gemini: 'Memanggil endpoint Gemini…',
  groq: 'Memanggil endpoint Groq…'
};

const OK_NOTE = 'Terhubung — API key disimpan di browser.';
const EMPTY_NOTE = 'Isi API key dulu.';

export interface ProviderState {
  provider: ProviderId;
  key: string;
  status: ConnectionStatus;
  note: string;          // pesan terakhir; fallback = catatan default provider
  model?: string;        // hasil auto-detect Gemini (untuk M8)
}

export function useProvider() {
  const [provider, setProviderState] = useState<ProviderId>('gemini');
  const [key, setKeyState] = useState('');
  const [status, setStatusState] = useState<ConnectionStatus>('idle');
  const [note, setNoteState] = useState<string | null>(null);
  const [model, setModel] = useState<string | undefined>(undefined);
  const testingRef = useRef(false);

  // boot: isi field key dari storage (legacy loadStoredKey) — status tetap 'Belum dites'.
  // Sinkronisasi satu kali setelah mount supaya nilai awal = '' saat hydration (localStorage
  // tidak ada di server); efek ini tidak pernah berulang sehingga tidak ada cascading render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setKeyState((prev) => (prev.trim() ? prev : readKey('gemini')));
  }, []);

  function setProvider(p: ProviderId) {
    if (testingRef.current) return;           // legacy: abaikan saat sedang menguji
    setProviderState(p);
    setStatusState('idle');
    setNoteState(null);
    setModel(undefined);
    setKeyState((prev) => (prev.trim() ? prev : readKey(p)));
  }

  function setKey(v: string) {
    setKeyState(v);                           // mengetik selama tes tetap diterima…
    if (testingRef.current) return;           // …tapi status tidak di-reset (legacy)
    setStatusState('idle');
    setNoteState(null);
  }

  async function test() {
    if (provider === 'coming-soon' || testingRef.current) return;
    const k = key.trim();
    testingRef.current = true;
    setStatusState('testing');
    setNoteState(TESTING_NOTES[provider === 'groq' ? 'groq' : 'gemini']);
    try {
      if (!k) { setStatusState('fail'); setNoteState(EMPTY_NOTE); return; }
      const adapter = getProvider(provider);
      if (!adapter) { setStatusState('fail'); setNoteState(SOON_NOTE); return; }
      const res = await adapter.testConnection(k);
      if (res.ok) {
        writeKey(provider, k);                // hanya setelah tes lulus
        setModel(res.model);
        setStatusState('ok');
        setNoteState(OK_NOTE);
      } else {
        setStatusState('fail');
        setNoteState(res.message);
      }
    } catch (err) {
      setStatusState('fail');
      setNoteState(err instanceof Error && err.message ? err.message : 'Koneksi gagal.');
    } finally {
      testingRef.current = false;
    }
  }

  return {
    provider,
    key,
    status,
    note: note ?? KEY_NOTES[provider],
    model,
    isSoon: provider === 'coming-soon',
    setProvider,
    setKey,
    test
  };
}
