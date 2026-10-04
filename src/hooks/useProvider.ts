'use client';
// State koneksi provider: pilih provider, input API key, tes koneksi.
// Kontrak legacy: key hanya disimpan SETELAH tes lulus. M19: key tersimpan yang terbaca
// saat boot / saat ganti provider LANGSUNG dites ulang (auto-test) — status "Aktif" selalu
// membuktikan koneksi hidup, bukan klaim basi dari sesi sebelumnya; jika key provider tujuan
// tersimpan, field ikut diisi key itu (yang tampil = yang dites), kalau tidak ada key tersimpan
// isi field dipertahankan seperti legacy.
// Provider 'custom' = adapter OpenAI-compatible generik (baseUrl + model + apiKey diisi
// pengguna, tanpa hardcode nama layanan).
import { useEffect, useRef, useState } from 'react';
import { getProvider } from '../lib/providers';
import {
  readCustomBaseUrl,
  readCustomModel,
  readKey,
  readProvider,
  writeCustomBaseUrl,
  writeCustomModel,
  writeKey,
  writeProvider
} from '../lib/storage';
import type { ConnectionStatus, ProviderId } from '../lib/types';

export const SOON_NOTE = 'Provider tambahan akan segera hadir';

// M11: Groq jadi provider utama — hanya dipakai saat belum ada pilihan tersimpan di localStorage
export const DEFAULT_PROVIDER: ProviderId = 'groq';

export const KEY_NOTES: Record<ProviderId, string> = {
  gemini: 'Gemini: key disimpan di browser setelah tes berhasil (stockmeta_gemini_key).',
  groq: 'Groq: key disimpan di browser setelah tes berhasil (stockmeta_groq_key).',
  custom: 'Custom OpenAI-compatible: base URL + model + key diisi sendiri, disimpan di browser setelah tes berhasil.',
  'coming-soon': SOON_NOTE
};

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  gemini: 'Gemini',
  groq: 'Groq',
  custom: 'Custom',
  'coming-soon': 'Coming Soon'
};

// Urutan dropdown (M11): Groq sebagai provider utama lebih dulu, lalu Gemini;
// Custom (OpenAI-compatible generik) sebagai opsi ketiga sebelum Coming Soon.
export const PROVIDER_ORDER: readonly ProviderId[] = ['groq', 'gemini', 'custom', 'coming-soon'];

export const STATUS_LABELS: Record<ConnectionStatus, string> = {
  idle: 'Belum dites',
  testing: 'Menguji…',
  ok: 'Aktif',
  fail: 'Gagal'
};

const TESTING_NOTES: Record<ProviderId, string> = {
  gemini: 'Memanggil endpoint Gemini…',
  groq: 'Memanggil endpoint Groq…',
  custom: 'Memanggil endpoint custom…',
  'coming-soon': SOON_NOTE
};

const OK_NOTE = 'Terhubung — API key disimpan di browser.';
const EMPTY_NOTE = 'Isi API key dulu.';
const EMPTY_CUSTOM_NOTE = 'Isi base URL, model, dan API key dulu.';

export interface ProviderState {
  provider: ProviderId;
  key: string;
  status: ConnectionStatus;
  note: string;          // pesan terakhir; fallback = catatan default provider
}

export function useProvider() {
  const [provider, setProviderState] = useState<ProviderId>(DEFAULT_PROVIDER);
  const [key, setKeyState] = useState('');
  const [customBaseUrl, setCustomBaseUrlState] = useState('');
  const [customModel, setCustomModelState] = useState('');
  const [status, setStatusState] = useState<ConnectionStatus>('idle');
  const [note, setNoteState] = useState<string | null>(null);
  const testingRef = useRef(false);

  // M19: satu jalur tes dipakai tombol manual, boot, dan ganti provider supaya status
  // 'Menguji…' → 'Aktif'/'Gagal' selalu berlaku sama. testingRef menolak tes beruntun.
  async function runTest(p: ProviderId, rawKey: string, custom?: { baseUrl: string; model: string }) {
    if (p === 'coming-soon' || testingRef.current) return;
    const k = rawKey.trim();
    testingRef.current = true;
    setStatusState('testing');
    setNoteState(TESTING_NOTES[p]);
    try {
      if (!k) { setStatusState('fail'); setNoteState(EMPTY_NOTE); return; }
      const adapter = getProvider(p);
      if (!adapter) { setStatusState('fail'); setNoteState(SOON_NOTE); return; }
      const baseUrl = custom?.baseUrl.trim() ?? '';
      const model = custom?.model.trim() ?? '';
      if (p === 'custom' && (!baseUrl || !model)) {
        setStatusState('fail');
        setNoteState(EMPTY_CUSTOM_NOTE);
        return;
      }
      const res = await adapter.testConnection(k, { baseUrl, model });
      if (res.ok) {
        writeKey(p, k);                      // hanya setelah tes lulus
        if (p === 'custom') {
          writeCustomBaseUrl(baseUrl);
          writeCustomModel(model);
        }
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

  // boot: pulihkan pilihan provider tersimpan (M11 — kalau belum pernah memilih → Groq),
  // isi field key dari storage (legacy loadStoredKey), lalu M19: key tersimpan langsung
  // dites ulang — status awal 'Menguji…' → 'Aktif'/'Gagal', bukan 'Belum dites' basi.
  // Sinkronisasi satu kali setelah mount supaya nilai awal = '' saat hydration (localStorage
  // tidak ada di server); efek ini tidak pernah berulang sehingga tidak ada cascading render.
  useEffect(() => {
    const saved = readProvider() ?? DEFAULT_PROVIDER;
    const baseUrl = readCustomBaseUrl();
    const model = readCustomModel();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sekali dari localStorage
    setProviderState(saved);
    setCustomBaseUrlState(baseUrl);
    setCustomModelState(model);
    const stored = readKey(saved).trim();
    setKeyState((prev) => (prev.trim() ? prev : stored));
    if (stored) void runTest(saved, stored, { baseUrl, model });
  }, []);

  function setProvider(p: ProviderId) {
    if (testingRef.current) return;           // legacy: abaikan saat sedang menguji
    writeProvider(p);                          // M11: pilihan dihormati di kunjungan berikutnya
    setProviderState(p);
    setStatusState('idle');
    setNoteState(null);
    const stored = readKey(p).trim();
    // field diisi key provider tujuan bila ada (yang tampil = yang akan dites),
    // kalau tidak ada key tersimpan isi lama dipertahankan (legacy)
    setKeyState((prev) => stored || prev.trim());
    if (stored) void runTest(p, stored, { baseUrl: readCustomBaseUrl(), model: readCustomModel() });       // M19: auto-test key tersimpan
  }

  function setKey(v: string) {
    setKeyState(v);                           // mengetik selama tes tetap diterima…
    if (testingRef.current) return;           // …tapi status tidak di-reset (legacy)
    setStatusState('idle');
    setNoteState(null);
  }

  function setCustomBaseUrl(v: string) {
    setCustomBaseUrlState(v);
    if (testingRef.current) return;
    setStatusState('idle');
    setNoteState(null);
  }

  function setCustomModel(v: string) {
    setCustomModelState(v);
    if (testingRef.current) return;
    setStatusState('idle');
    setNoteState(null);
  }

  function test() {
    return runTest(provider, key, { baseUrl: customBaseUrl, model: customModel });
  }

  /** konfigurasi custom aktif (untuk generate/juri/fallback provider custom) */
  function getCustomConfig(): { baseUrl: string; model: string } {
    return { baseUrl: customBaseUrl.trim(), model: customModel.trim() };
  }

  return {
    provider,
    key,
    customBaseUrl,
    customModel,
    status,
    note: note ?? KEY_NOTES[provider],
    isSoon: provider === 'coming-soon',
    setProvider,
    setKey,
    setCustomBaseUrl,
    setCustomModel,
    getCustomConfig,
    test
  };
}
