// @vitest-environment jsdom
// Tes AnalysisPanel (M29, Mode Analisis): badge verdict per verdict, daftar issues,
// ringkasan, state kosong/gagal — tanpa testing-library (pola CaptionSheet.test.ts).
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../hooks/useSession';
import type { AnalysisResult } from '../lib/types';
import type { Frame } from '../lib/types';
import { AnalysisPanel } from './AnalysisPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const holderRef: {
  current?: {
    s: ReturnType<typeof useSession>;
  };
} = {};
function Harness() {
  const s = useSession();
  // eslint-disable-next-line react-hooks/immutability -- harness pengujian: simpan hasil hook terbaru
  holderRef.current = { s };
  return createElement(AnalysisPanel, { session: s });
}
const api = () => holderRef.current as NonNullable<typeof holderRef.current>;

let root: Root;
let host: HTMLElement;

const blank = (name: string): Omit<Frame, 'id'> => ({
  name,
  thumb: '',
  tema: '',
  status: { adobe: 'menunggu', shutterstock: 'menunggu' },
  error: { adobe: '', shutterstock: '' },
  metadata: {}
});

const text = () => host.textContent ?? '';

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(Harness)); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

function addFrames(n: number): number[] {
  const ids: number[] = [];
  act(() => {
    for (let i = 0; i < n; i++) ids.push(api().s.addFrame(blank(`f${i}.jpg`)));
  });
  return ids;
}

const LAYAK: AnalysisResult = { verdict: 'layak', issues: [], summary: 'Gambar tajam dan layak jual.' };

describe('AnalysisPanel — state kosong & gagal', () => {
  it('tanpa frame: kotak kosong + header Frame -- / --', () => {
    expect(text()).toContain('belum ada frame');
    expect(text()).toContain('Frame -- / --');
  });

  it('frame belum dianalisis → "Belum dianalisis" + cara jalan', () => {
    const [id] = addFrames(1);
    act(() => api().s.select(id));
    expect(text()).toContain('Frame 01 / 01');
    expect(text()).toContain('Belum dianalisis');
    expect(text()).toContain('Jalankan Analisis');
  });

  it('analisis gagal → kotak error berisi pesan asli', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.failAnalysis(id, 'adobe', 'HTTP 500 — server error');
    });
    expect(text()).toContain('HTTP 500 — server error');
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});

describe('AnalysisPanel — hasil', () => {
  it('layak tanpa issues → badge + ringkasan + kalimat layak', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyAnalysis(id, 'adobe', LAYAK);
    });
    expect(text()).toContain('Layak');
    expect(text()).toContain('Gambar tajam dan layak jual.');
    expect(text()).toContain('Tidak ada masalah yang terdeteksi');
  });

  it('berpotensi-ditolak → badge + kategori Indonesia + deskripsi issue', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyAnalysis(id, 'adobe', {
        verdict: 'berpotensi-ditolak',
        issues: [{ category: 'watermark-logo', description: 'Logo terlihat di pojok kanan.' }],
        summary: 'Ada logo, berisiko ditolak.'
      });
    });
    expect(text()).toContain('Berpotensi ditolak');
    expect(text()).toContain('Watermark / logo');
    expect(text()).toContain('Logo terlihat di pojok kanan.');
    expect(text()).toContain('Ada logo, berisiko ditolak.');
  });

  it('perlu-tinjau → badge sendiri (bukan klaim pasti)', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyAnalysis(id, 'adobe', {
        verdict: 'perlu-tinjau',
        issues: [{ category: 'konten-serupa', description: 'Subjek sangat generik.' }],
        summary: 'Perlu verifikasi manusia.'
      });
    });
    expect(text()).toContain('Perlu tinjau');
    expect(text()).toContain('Konten serupa');
  });

  it('hasil per platform tidak saling menimpa', () => {
    const [id] = addFrames(1);
    act(() => {
      api().s.select(id);
      api().s.applyAnalysis(id, 'adobe', LAYAK);
      api().s.setPlatform('shutterstock');
    });
    // slot shutterstock masih kosong → belum dianalisis (slot adobe tak terbaca)
    expect(text()).toContain('Belum dianalisis');
    act(() => api().s.setPlatform('adobe'));
    expect(text()).toContain('Layak');
  });
});
