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
