'use client';
// State koneksi provider: pilih provider, input API key, tes koneksi.
// Kontrak legacy: key hanya disimpan SETELAH tes lulus. M19: key tersimpan yang terbaca
// saat boot / saat ganti provider LANGSUNG dites ulang (auto-test) — status "Aktif" selalu
// membuktikan koneksi hidup, bukan klaim basi dari sesi sebelumnya; jika key provider tujuan
// tersimpan, field ikut diisi key itu (yang tampil = yang dites), kalau tidak ada key tersimpan
// isi field dipertahankan seperti legacy.
// Pilihan provider dipisah per mode (analisis vs metadata): hook menerima activeMode opsional.
// Tanpa mode (pemanggil lama) perilaku identik seperti sebelumnya — satu kunci umum
// `stockmeta_provider`, default Groq. Dengan mode, pilihan dibaca/ditulis ke kunci khusus
// mode (`stockmeta_provider_analisis` / `stockmeta_provider_metadata`); kunci lama hanya
// dipakai sebagai migrasi untuk user lama. API key TETAP satu per provider.
import { useEffect, useRef, useState } from 'react';
import { getProvider } from '../lib/providers';
import {
  readKey,
  readProvider,
  readProviderForMode,
  writeKey,
  writeProvider,
  writeProviderForMode
} from '../lib/storage';
import type { AppMode, ConnectionStatus, ProviderId } from '../lib/types';

// M11: Groq jadi provider utama Mode Metadata — hanya dipakai saat belum ada pilihan
// tersimpan di localStorage. Mode Analisis default ke Gemini (model vision gratis paling
// kuat untuk penalaran saat ini). Berlaku hanya untuk user BARU (tanpa pilihan tersimpan);
// pilihan user lama (kunci umum) selalu dihormati di kedua mode.
export const DEFAULT_PROVIDER: ProviderId = 'groq';
export const DEFAULT_ANALYSIS_PROVIDER: ProviderId = 'gemini';

function defaultForMode(mode: AppMode | undefined): ProviderId {
  return mode === 'analisis' ? DEFAULT_ANALYSIS_PROVIDER : DEFAULT_PROVIDER;
}

export const KEY_NOTES: Record<ProviderId, string> = {
  gemini: 'Gemini: key disimpan di browser setelah tes berhasil (stockmeta_gemini_key).',
  groq: 'Groq: key disimpan di browser setelah tes berhasil (stockmeta_groq_key).',
  openrouter: 'OpenRouter: key disimpan di browser setelah tes berhasil (stockmeta_openrouter_key).'
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  openrouter: 'OpenRouter'
};

// Urutan dropdown: Groq → Gemini → OpenRouter — ketiganya live, tanpa placeholder.
export const PROVIDER_ORDER: readonly ProviderId[] = ['groq', 'gemini', 'openrouter'];

export const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: 'Belum dites',
  testing: 'Menguji…',
  ok: 'Aktif',
  fail: 'Gagal'
};

const TESTING_NOTES: Record<ProviderId, string> = {
  gemini: 'Memanggil endpoint Gemini…',
  groq: 'Memanggil endpoint Groq…',
  openrouter: 'Memanggil endpoint OpenRouter…'
};

const OK_NOTE = 'Terhubung — API key disimpan di browser.';
const EMPTY_NOTE = 'Isi API key dulu.';

export interface ProviderState {
  provider: ProviderId;
  key: string;
  status: ConnectionStatus;
  note: string;          // pesan terakhir; fallback = catatan default provider
}

/** Pilihan tersimpan untuk mode ini: kunci khusus mode dulu, lalu kunci umum (migrasi user lama). */
function storedForMode(mode: AppMode | undefined): ProviderId | null {
  if (!mode) return readProvider();
  return readProviderForMode(mode) ?? readProvider();
}

export function useProvider(activeMode?: AppMode) {
  const [provider, setProviderState] = useState<ProviderId>(() => defaultForMode(activeMode));
  const [key, setKeyState] = useState('');
  const [status, setStatusState] = useState<ConnectionStatus>('idle');
  const [note, setNoteState] = useState<string | null>(null);
  const testingRef = useRef(false);

  // M19: satu jalur tes dipakai tombol manual, boot, dan ganti provider supaya status
  // 'Menguji…' → 'Aktif'/'Gagal' selalu berlaku sama. testingRef menolak tes beruntun.
  async function runTest(p: ProviderId, rawKey: string) {
    if (testingRef.current) return;
    const k = rawKey.trim();
    testingRef.current = true;
    setStatusState('testing');
    setNoteState(TESTING_NOTES[p]);
    try {
      if (!k) { setStatusState('fail'); setNoteState(EMPTY_NOTE); return; }
      const adapter = getProvider(p);
      if (!adapter) { setStatusState('fail'); setNoteState('Provider tidak tersedia.'); return; }
      const res = await adapter.testConnection(k);
      if (res.ok) {
        writeKey(p, k);                      // hanya setelah tes lulus
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

  // boot + pindah mode: pulihkan pilihan tersimpan untuk mode aktif (migrasi: kunci umum
  // user lama), isi field key dari storage, lalu M19: key tersimpan langsung dites ulang —
  // status awal 'Menguji…' → 'Aktif'/'Gagal', bukan 'Belum dites' basi.
  // Sinkronisasi setelah mount / setiap ganti mode supaya nilai awal = default saat
  // hydration (localStorage tidak ada di server).
  useEffect(() => {
    const saved = storedForMode(activeMode) ?? defaultForMode(activeMode);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore dari localStorage / ganti mode
    setProviderState(saved);
    setStatusState('idle');
    setNoteState(null);
    const stored = readKey(saved).trim();
    setKeyState(stored);
    if (stored) void runTest(saved, stored);
  }, [activeMode]);

  function setProvider(p: ProviderId) {
    if (testingRef.current) return;           // legacy: abaikan saat sedang menguji
    if (activeMode) writeProviderForMode(activeMode, p);  // pilihan khusus mode ini
    else writeProvider(p);                    // legacy: kunci umum
    setProviderState(p);
    setStatusState('idle');
    setNoteState(null);
    const stored = readKey(p).trim();
    // field diisi key provider tujuan bila ada (yang tampil = yang akan dites),
    // kalau tidak ada key tersimpan isi lama dipertahankan (legacy)
    setKeyState((prev) => stored || prev.trim());
    if (stored) void runTest(p, stored);       // M19: auto-test key tersimpan
  }

  function setKey(v: string) {
    setKeyState(v);                           // mengetik selama tes tetap diterima…
    if (testingRef.current) return;           // …tapi status tidak di-reset (legacy)
    setStatusState('idle');
    setNoteState(null);
  }

  function test() {
    return runTest(provider, key);
  }

  return {
    provider,
    key,
    status,
    note: note ?? KEY_NOTES[provider],
    activeMode,
    setProvider,
    setKey,
    test
  };
}
