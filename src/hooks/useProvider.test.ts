// @vitest-environment jsdom
// Tes useProvider lewat harness React kecil (react-dom/client + act) — fokus M19:
// API key tersimpan dites otomatis saat boot dan saat ganti provider (auto-test),
// tanpa jaringan, tanpa library tes UI.
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registry } from '../lib/providers';
import { gemini } from '../lib/providers/gemini';
import { groq } from '../lib/providers/groq';
import { openrouter } from '../lib/providers/openrouter';
import type { ProviderAdapter, TestResult } from '../lib/providers/types';
import { PROVIDER_LABELS, PROVIDER_ORDER, STATUS_LABELS, useProvider } from './useProvider';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const testConnection = vi.fn(async (): Promise<TestResult> => ({ ok: true }));
const fakeAdapter: ProviderAdapter = {
  id: 'groq',
  testConnection,
  generateForImage: async () => ({})
};

const holderRef: { current?: ReturnType<typeof useProvider> } = {};
function Harness() {
  const p = useProvider();
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = p;
  return createElement('div');
}
const api = () => holderRef.current as NonNullable<typeof holderRef.current>;

let root: Root;
let host: HTMLElement;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount() {
  await act(async () => { root.render(createElement(Harness)); });
  await flush();
}

beforeEach(() => {
  localStorage.clear();
  testConnection.mockReset();
  testConnection.mockResolvedValue({ ok: true });
  registry.gemini = fakeAdapter;
  registry.groq = fakeAdapter;                    // default provider (M11)
  registry.openrouter = fakeAdapter;              // M19
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

    await act(async () => { root.render(createElement(Harness)); });
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

  it('semua provider nyata bisa dites (tak ada placeholder yang dilewati)', async () => {
    localStorage.setItem('stockmeta_groq_key', 'k-groq');
    localStorage.setItem('stockmeta_gemini_key', 'k-gemini');
    localStorage.setItem('stockmeta_openrouter_key', 'k-openrouter');
    await mount();
    for (const p of ['groq', 'gemini', 'openrouter'] as const) {
      await act(async () => { api().setProvider(p); });
      await flush();
      expect(api().provider).toBe(p);
      expect(api().status).toBe('ok');
    }
    expect(testConnection).toHaveBeenCalledTimes(4);   // 1 boot + 3 ganti provider
    expect(testConnection).toHaveBeenLastCalledWith('k-openrouter');
  });
});

describe('useProvider — daftar provider (M19)', () => {
  it('urutan: Groq, Gemini, OpenRouter', () => {
    expect(PROVIDER_ORDER).toEqual(['groq', 'gemini', 'openrouter']);
  });

  it('label OpenRouter ikut terdaftar', () => {
    expect(PROVIDER_LABELS.openrouter).toBe('OpenRouter');
    expect(Object.keys(PROVIDER_LABELS).sort()).toEqual(['gemini', 'groq', 'openrouter']);
  });
});
