// @vitest-environment jsdom
// Tes useProvider lewat harness React kecil (react-dom/client + act) — fokus M19:
// API key tersimpan dites otomatis saat boot dan saat ganti provider (auto-test),
// tanpa jaringan, tanpa library tes UI. Plus pemisahan provider per mode
// (analisis vs metadata): default per mode untuk user baru, migrasi user lama.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '../lib/providers';
import { blankObservation } from '../lib/observation';
import { gemini } from '../lib/providers/gemini';
import { groq } from '../lib/providers/groq';
import { openrouter } from '../lib/providers/openrouter';
import type { ProviderAdapter, TestResult } from '../lib/providers/types';
import type { AppMode } from '../lib/types';
import { DEFAULT_ANALYSIS_PROVIDER, DEFAULT_PROVIDER, PROVIDER_LABELS, PROVIDER_ORDER, STATUS_LABELS, useProvider } from './useProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const testConnection = vi.fn(async (): Promise<TestResult> => ({ ok: true }));
const fakeAdapter: ProviderAdapter = {
  id: 'groq',
  label: 'Groq',
  supportsVision: true,
  testConnection,
  generateForImage: async () => ({}),
  observeImage: async () => blankObservation(),
  analyzeImage: async () => ({ verdict: 'layak', issues: [], summary: '' }),
  callText: async () => '{}',
  callJudge: async () => ({
    verdict: 'pass', score: 100, checks: [], unsupported_metadata: [], ip_risks: [],
    category_ok: true, suggested_category: null, needs_editorial_or_release: false, confidence: 1
  })
};

const holderRef: { current?: ReturnType<typeof useProvider> } = {};
function Harness({ mode }: { mode?: AppMode }) {
  const p = useProvider(mode);
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = p;
  return createElement('div');
}
const api = () => holderRef.current as NonNullable<typeof holderRef.current>;

let root: Root;
let host: HTMLElement;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount(mode?: AppMode) {
  await act(async () => { root.render(createElement(Harness, { mode })); });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  testConnection.mockReset();
  testConnection.mockResolvedValue({ ok: true });
  registry.gemini = fakeAdapter;
  registry.groq = fakeAdapter;                    // default provider (M11)
  registry.openrouter = fakeAdapter;
  holderRef.current = undefined;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  registry.gemini = gemini;
  registry.groq = groq;
  registry.openrouter = openrouter;
  await act(async () => root.unmount());
  host.remove();
});

describe('useProvider — auto-test key tersimpan (M19)', () => {
  it('key tersimpan dites saat boot: "Menguji…" → "Aktif"', async () => {
    localStorage.setItem('stockmeta_groq_key', 'kunci-tertaruh');
    let settle: ((r: TestResult) => void) | undefined;
    testConnection.mockImplementationOnce(() => new Promise<TestResult>((r) => { settle = r; }));

    await act(async () => { root.render(createElement(Harness, { mode: undefined })); });
    expect(api().provider).toBe('groq');
    expect(api().key).toBe('kunci-tertaruh');
    expect(api().status).toBe('testing');
    expect(api().note).toBe('Memanggil endpoint Groq…');
    expect(STATUS_LABELS[api().status]).toBe('Menguji…');

    await act(async () => { settle?.({ ok: true }); });
    expect(api().status).toBe('ok');
    expect(api().note).toBe('Terhubung — API key disimpan di browser.');
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(testConnection).toHaveBeenCalledWith('kunci-tertaruh');
  });

  it('key tersimpan sudah mati → auto-test berakhir "Gagal" dengan pesan provider', async () => {
    localStorage.setItem('stockmeta_groq_key', 'kunci-mati');
    testConnection.mockResolvedValue({ ok: false, message: 'Key salah — API key ditolak Groq.' });

    await mount();
    expect(api().status).toBe('fail');
    expect(api().note).toBe('Key salah — API key ditolak Groq.');
    expect(testConnection).toHaveBeenCalledTimes(1);
  });

  it('tanpa key tersimpan → status tetap "Belum dites", tanpa panggilan', async () => {
    await mount();
    expect(api().status).toBe('idle');
    expect(api().key).toBe('');
    expect(testConnection).not.toHaveBeenCalled();
  });

  it('ganti provider yang key-nya tersimpan → field ikut diisi + tes otomatis', async () => {
    localStorage.setItem('stockmeta_gemini_key', 'kunci-gemini');
    await mount();                                  // boot: Groq tanpa key → idle
    expect(api().status).toBe('idle');

    await act(async () => { api().setProvider('gemini'); });
    await flush();
    expect(api().provider).toBe('gemini');
    expect(api().key).toBe('kunci-gemini');         // yang tampil = yang dites
    expect(api().status).toBe('ok');
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(testConnection).toHaveBeenCalledWith('kunci-gemini');
  });

  it('ganti provider tanpa key tersimpan → isi field lama dipertahankan, tanpa auto-test', async () => {
    localStorage.setItem('stockmeta_groq_key', 'kunci-groq');
    await mount();                                  // auto-test Groq → ok
    expect(api().status).toBe('ok');
    expect(testConnection).toHaveBeenCalledTimes(1);

    await act(async () => { api().setProvider('openrouter'); });
    await flush();
    expect(api().provider).toBe('openrouter');
    expect(api().key).toBe('kunci-groq');           // legacy: isi lama dipertahankan
    expect(api().status).toBe('idle');              // reset, belum dites
    expect(testConnection).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('stockmeta_provider')).toBe('openrouter');
  });

  it('tes manual tetap bisa sesudahnya: key yang diketik yang diuji & disimpan', async () => {
    localStorage.setItem('stockmeta_gemini_key', 'kunci-lama');
    await mount();
    await act(async () => { api().setProvider('gemini'); });
    await flush();
    expect(testConnection).toHaveBeenCalledTimes(1);

    await act(async () => { api().setKey('baru-diketik'); });
    expect(api().status).toBe('idle');
    await act(async () => { await api().test(); });
    expect(testConnection).toHaveBeenCalledTimes(2);
    expect(testConnection).toHaveBeenLastCalledWith('baru-diketik');
    expect(api().status).toBe('ok');
    expect(localStorage.getItem('stockmeta_gemini_key')).toBe('baru-diketik');
  });
});

describe('useProvider — daftar provider', () => {
  it('urutan: Groq, Gemini, OpenRouter — ketiganya live tanpa placeholder', () => {
    expect(PROVIDER_ORDER).toEqual(['groq', 'gemini', 'openrouter']);
  });

  it('label OpenRouter ikut terdaftar', () => {
    expect(PROVIDER_LABELS.openrouter).toBe('OpenRouter');
    expect(PROVIDER_LABELS.gemini).toBe('Gemini');
    expect(PROVIDER_LABELS.groq).toBe('Groq');
  });

  it('default: analisis → Gemini, metadata/legacy → Groq', () => {
    expect(DEFAULT_PROVIDER).toBe('groq');
    expect(DEFAULT_ANALYSIS_PROVIDER).toBe('gemini');
  });
});

describe('useProvider — provider per mode (analisis vs metadata)', () => {
  it('user baru tanpa simpanan: analisis default Gemini, metadata default Groq', async () => {
    await mount('analisis');
    expect(api().provider).toBe('gemini');
    expect(api().activeMode).toBe('analisis');

    await act(async () => { root.render(createElement(Harness, { mode: 'metadata' })); });
    await flush();
    expect(api().provider).toBe('groq');
    expect(api().activeMode).toBe('metadata');
  });

  it('pilihan per mode tersimpan terpisah; kunci umum user lama tidak ditulis ulang', async () => {
    localStorage.setItem('stockmeta_provider_analisis', 'openrouter');
    localStorage.setItem('stockmeta_provider_metadata', 'groq');
    localStorage.setItem('stockmeta_openrouter_key', 'k-or');
    localStorage.setItem('stockmeta_groq_key', 'k-groq');

    await mount('analisis');
    expect(api().provider).toBe('openrouter');
    expect(api().key).toBe('k-or');
    expect(api().status).toBe('ok');

    await act(async () => { root.render(createElement(Harness, { mode: 'metadata' })); });
    await flush();
    expect(api().provider).toBe('groq');
    expect(api().key).toBe('k-groq');               // key mengikuti provider mode aktif
    expect(api().status).toBe('ok');
  });

  it('user lama (hanya kunci umum) → pilihannya dihormati di kedua mode', async () => {
    localStorage.setItem('stockmeta_provider', 'gemini');
    localStorage.setItem('stockmeta_gemini_key', 'k-lama');

    await mount('analisis');
    expect(api().provider).toBe('gemini');          // bukan default Gemini-kebetulan: dari kunci umum
    expect(api().key).toBe('k-lama');

    await act(async () => { root.render(createElement(Harness, { mode: 'metadata' })); });
    await flush();
    expect(api().provider).toBe('gemini');
  });

  it('setProvider dalam mode menulis kunci khusus mode, bukan kunci umum', async () => {
    await mount('analisis');
    await act(async () => { api().setProvider('openrouter'); });
    await flush();
    expect(localStorage.getItem('stockmeta_provider_analisis')).toBe('openrouter');
    expect(localStorage.getItem('stockmeta_provider')).toBeNull();
    expect(localStorage.getItem('stockmeta_provider_metadata')).toBeNull();
  });

  it('API key tetap satu per provider lintas mode', async () => {
    localStorage.setItem('stockmeta_provider_analisis', 'gemini');
    localStorage.setItem('stockmeta_provider_metadata', 'gemini');
    localStorage.setItem('stockmeta_gemini_key', 'k-sama');

    await mount('analisis');
    expect(api().key).toBe('k-sama');
    await act(async () => { root.render(createElement(Harness, { mode: 'metadata' })); });
    await flush();
    expect(api().key).toBe('k-sama');               // key yang sama, tidak disimpan dua kali
  });
});
