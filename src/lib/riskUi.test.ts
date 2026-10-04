// Pengaman UI/ekspor: label data licensing, frame ditahan, provider tanpa vision.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { planCsv } from './csv';
import { hasContent } from './metadata';
import type { Frame } from './types';

const SRC = fileURLToPath(new URL('./', import.meta.url));

function sources(): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?)$/.test(e.name) && !/\.test\.(tsx?)$/.test(e.name)) out.push(p);
    }
  };
  walk(SRC);
  return out;
}

describe('label data licensing', () => {
  it('UI tidak pernah memakai kata approved/disetujui untuk status data licensing', () => {
    const bad: string[] = [];
    for (const f of sources()) {
      const code = readFileSync(f, 'utf8');
      const lines = code.split('\n');
      lines.forEach((line, i) => {
        if (!/data licensing/i.test(line) || !/approv|disetujui/i.test(line)) return;
        // Baris larangan/komentar/test (JANGAN/PERNAH/tidak pernah/matcher) bukan label UI.
        if (/JANGAN|PERNAH|tidak pernah|toMatch|not\.|LABEL|label persis/i.test(line)) return;
        bad.push(f.split(/[\\/]/).pop() + ':' + (i + 1));
      });
    }
    expect(bad).toEqual([]);
  });
  it('label persis dipakai di outcome + panel', () => {
    const LABEL = 'Data licensing saja (tidak masuk marketplace)';
    const hits: string[] = [];
    for (const f of sources()) {
      if (readFileSync(f, 'utf8').includes(LABEL)) hits.push(f);
    }
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

describe('ekspor menghormati frame ditahan', () => {
  it('frame held=true disembunyikan dari CSV, bukan dihapus', () => {
    const base: Frame = {
      id: 1,
      name: 'a.jpg',
      thumb: '',
      tema: '',
      status: { adobe: 'siap', shutterstock: 'menunggu' },
      error: { adobe: '', shutterstock: '' },
      metadata: {
        adobe: { title: 'Red mountain lake at dawn', keywords: ['mountain', 'lake', 'dawn', 'red sky', 'nature'], category: 'Landscapes' }
      }
    };
    expect(hasContent('adobe', base.metadata.adobe as Parameters<typeof hasContent>[1])).toBe(true);
    const held: Frame = { ...base, id: 2, held: true };
    const plan = planCsv([base, held], 'adobe');
    expect(plan.exportable.map((f) => f.id)).toEqual([1]);
    expect(plan.heldBack.map((f) => f.id)).toEqual([2]);
  });
});

describe('provider tanpa vision melewati inspeksi crop', () => {
  it('tanpa inspectCrop → "inspeksi detail tidak tersedia"', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined
    });
    const { cropCostEstimate, CROP_INSPECTION_UNAVAILABLE } = await import('./quality/cropInspect');
    expect(cropCostEstimate(4, false)).toBe(CROP_INSPECTION_UNAVAILABLE);
    vi.unstubAllGlobals();
  });
});
