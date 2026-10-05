// @vitest-environment jsdom
// Tes kontrol provider: SATU segmented radiogroup untuk semua lebar layar —
// tanpa <select>, tanpa opsi Coming Soon. Stub api langsung (tanpa hook).
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { useProvider } from '../hooks/useProvider';
import { ProviderPanel } from './ProviderPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ProviderApi = ReturnType<typeof useProvider>;

function stubApi(over: Partial<ProviderApi> = {}): ProviderApi {
  return {
    provider: 'groq',
    key: '',
    status: 'idle',
    note: '',
    setProvider: vi.fn(),
    setKey: vi.fn(),
    test: vi.fn(),
    ...over
  };
}

let root: Root;
let host: HTMLElement;

function render(api: ProviderApi, busy?: boolean) {
  act(() => {
    root.render(createElement(ProviderPanel, { api, busy }));
  });
}

const radios = () =>
  Array.from(host.querySelectorAll('[role="radio"]')) as HTMLElement[];
const group = () => host.querySelector('[role="radiogroup"]') as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('ProviderPanel — satu kontrol segmented untuk semua lebar', () => {
  it('tepat tiga radio Groq/Gemini/OpenRouter; tanpa <select>; tanpa Coming Soon/SEGERA', () => {
    render(stubApi());
    expect(host.querySelector('select')).toBeNull();
    expect(host.querySelector('option')).toBeNull();
    const rs = radios();
    expect(rs).toHaveLength(3);
    expect(rs.map((r) => r.textContent?.trim())).toEqual(['Groq', 'Gemini', 'OpenRouter']);
    expect(host.textContent).not.toContain('Coming Soon');
    expect(host.textContent).not.toContain('SEGERA');
    expect(host.textContent).not.toContain('segera');
  });

  it('kontainer radiogroup grid tiga kolom tanpa kelas sembunyi per breakpoint', () => {
    render(stubApi());
    const g = group();
    expect(g.getAttribute('aria-label')).toBe('Provider');
    expect(g.className).toContain('grid-cols-3');
    for (const cls of ['lg:hidden', 'max-lg:hidden', 'sm:hidden', 'md:hidden', 'hidden']) {
      expect(g.className.split(/\s+/)).not.toContain(cls);
    }
    for (const r of radios()) {
      expect(r.className.split(/\s+/)).not.toContain('hidden');
    }
    // segmen setinggi input/tombol (h-10, bukan min-h-11) agar kolom sejajar
    for (const r of radios()) {
      expect(r.className.split(/\s+/)).toContain('h-10');
      expect(r.className.split(/\s+/)).not.toContain('min-h-11');
    }
  });

  it('M28: kesejajaran 0px — kontainer segmen tanpa chrome layout', () => {
    render(stubApi());
    const g = group();
    const cls = g.className.split(/\s+/);
    // padding/border kontainer menambah tinggi total (dulu 50px vs input 40px) —
    // garis visual 1px wajib via ring inset (0px biaya layout), bukan border/padding
    for (const banned of ['p-1', 'p-0.5', 'border', 'border-border']) {
      expect(cls).not.toContain(banned);
    }
    expect(cls).toContain('ring-1');
    // spacer tak terlihat pengimbang baris label di ≥1120px (top sejajar input)
    const spacer = host.querySelector('span[aria-hidden="true"].hidden') as HTMLElement | null;
    expect(spacer).not.toBeNull();
  });

  it('badge status sebaris label API key — kompak seukuran label', () => {
    render(stubApi());
    const badge = host.querySelector('span[role="status"]') as HTMLElement;
    expect(badge.className.split(/\s+/)).toContain('provider-status');
    const label = host.querySelector('label[for="apikey"]') as HTMLElement;
    // satu wadah flex: label + badge, gap-2 (8px), wrap bila sempit (turun rapi)
    expect(badge.parentElement).toBe(label.parentElement);
    expect(label.parentElement!.className).toContain('flex');
    expect(label.parentElement!.className).toContain('items-center');
    expect(label.parentElement!.className).toContain('gap-2');
    expect(label.parentElement!.className).toContain('flex-wrap');
    // kompak: tanpa h-10, px-2 + py-0.5, dot 6px, tipografi sama dengan label
    const bc = badge.className.split(/\s+/);
    expect(bc).not.toContain('h-10');
    expect(bc).toContain('h-auto!');
    expect(bc).toContain('px-2');
    expect(bc).toContain('py-0.5');
    expect(bc).toContain('text-meta');
    expect(bc).toContain('uppercase');
    expect(bc).toContain('leading-none');
    const dot = badge.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(dot.className.split(/\s+/)).toContain('h-1.5');
    expect(dot.className.split(/\s+/)).toContain('w-1.5');
    // badge TIDAK lagi di kolom tombol — kolom tombol hanya berisi tombol
    const btn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tes koneksi'),
    )!;
    expect(btn.parentElement!.querySelector('span[role="status"]')).toBeNull();
  });

  it('keempat state badge tampil dengan warna + teks tak berubah', () => {
    const cases = [
      { status: 'idle', text: 'Belum dites', color: 'text-accent-text' },
      { status: 'testing', text: 'Menguji…', color: 'text-accent-text' },
      { status: 'ok', text: 'Aktif', color: 'text-success' },
      { status: 'fail', text: 'Gagal', color: 'text-error' },
    ] as const;
    for (const c of cases) {
      render(stubApi({ status: c.status }));
      const badge = host.querySelector('span[role="status"]') as HTMLElement;
      expect(badge.textContent).toContain(c.text);
      expect(badge.className).toContain(c.color);
    }
  });

  it('aria-checked mengikuti provider aktif', () => {
    render(stubApi({ provider: 'gemini' }));
    const byLabel = (t: string) => radios().find((r) => r.textContent?.trim() === t)!;
    expect(byLabel('Gemini').getAttribute('aria-checked')).toBe('true');
    expect(byLabel('Groq').getAttribute('aria-checked')).toBe('false');
    expect(byLabel('OpenRouter').getAttribute('aria-checked')).toBe('false');
  });

  it('klik segmen mengganti provider', () => {
    const setProvider = vi.fn();
    render(stubApi({ provider: 'groq', setProvider }));
    const openrouter = radios().find((r) => r.textContent?.trim() === 'OpenRouter')!;
    act(() => {
      openrouter.click();
    });
    expect(setProvider).toHaveBeenCalledWith('openrouter');
  });

  it('panah kanan/kiri memindahkan pilihan (wrap di ujung)', () => {
    const setProvider = vi.fn();
    render(stubApi({ provider: 'gemini', setProvider }));
    const g = group();
    act(() => {
      g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(setProvider).toHaveBeenCalledWith('openrouter');
    act(() => {
      g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(setProvider).toHaveBeenCalledWith('groq');
  });

  it('nonaktif saat batch berjalan atau status testing', () => {
    render(stubApi(), true);
    for (const r of radios()) {
      expect((r as HTMLButtonElement).disabled).toBe(true);
    }
    render(stubApi({ status: 'testing' }));
    for (const r of radios()) {
      expect((r as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('checkbox fallback di sebelah label Provider tetap ada', () => {
    render(stubApi());
    expect(host.querySelector('[aria-label="Fallback antar provider saat kuota habis"]')).not.toBeNull();
    expect(host.textContent).toContain('Provider');
  });
});
