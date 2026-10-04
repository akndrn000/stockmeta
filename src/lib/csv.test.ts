// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildCsv, downloadCsv, planCsv, portalFileName } from './csv';
import type { Frame } from './types';

const frame = (metadata: Frame['metadata'], name = 'foto.jpg', extra?: Partial<Frame>): Frame => ({
  id: 1, name, thumb: '', tema: '',
  status: {
    adobe: metadata.adobe ? 'siap' : 'menunggu',
    shutterstock: metadata.shutterstock ? 'siap' : 'menunggu'
  },
  error: { adobe: '', shutterstock: '' },
  metadata,
  ...extra
});

// 25 keyword valid + judul ≤70 + overlap → lolos cek keras Adobe
const goodKws = ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature', 'green',
  'mountain', 'daylight', 'animal', 'cute', 'fur', 'tree', 'leaves',
  'outdoor', 'park', 'resting', 'sitting', 'branch', 'tall', 'brown', 'black', 'white', 'grey'];
const goodAdobe = {
  title: 'Red panda eating bamboo in forest',
  keywords: goodKws,
  category: 'Animals'
};

describe('buildCsv — spesifikasi resmi', () => {
  it('adobe: header persis template, kategori jadi NOMOR, Releases kosong', () => {
    const csv = buildCsv([frame({ adobe: goodAdobe })], 'adobe');
    const [head, line] = csv.split('\r\n');
    expect(head).toBe('"Filename","Title","Keywords","Category","Releases"');
    expect(line).toContain('"1",""');
    expect(line).toContain('"Red panda eating bamboo in forest"');
  });

  it('adobe: judul disanitasi saat ekspor (koma/kutip/emoji hilang, terlihat di UI)', () => {
    const csv = buildCsv([frame({ adobe: { ...goodAdobe, title: 'Panda, "merah" di hutan' } })], 'adobe');
    expect(csv).toContain('"Panda merah di hutan"');
    expect(csv).not.toContain('Panda,');
  });

  it('adobe: judul >200 = error → frame dilewati, bukan dipotong diam-diam', () => {
    const plan = planCsv([frame({ adobe: { ...goodAdobe, title: 'x'.repeat(201) } })], 'adobe');
    expect(plan.exportable).toHaveLength(0);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0].errors[0].rule).toBe('ADOBE_TITLE_LEN');
    expect(plan.csv).toBe('"Filename","Title","Keywords","Category","Releases"');
  });

  it('portalName dipakai apa adanya (huruf + ekstensi .jpeg/.eps dijaga)', () => {
    const f = frame({ adobe: goodAdobe }, 'upload.PNG', { portalName: 'Aset_Vektor.EPS' });
    expect(portalFileName(f)).toBe('Aset_Vektor.EPS');
    expect(buildCsv([f], 'adobe')).toContain('"Aset_Vektor.EPS"');
  });

  it('shutterstock: header 4 kolom tanpa toggle; 7 kolom bila ada yang aktif', () => {
    const base = buildCsv([frame({
      shutterstock: {
        description: 'A red panda eats bamboo shoots in a green mountain forest during daylight.',
        keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature'],
        categories: ['Animals/Wildlife']
      }
    })], 'shutterstock');
    expect(base.split('\r\n')[0]).toBe('"Filename","Description","Keywords","Categories"');

    const opt = buildCsv([frame({
      shutterstock: {
        description: 'A red panda eats bamboo shoots in a green mountain forest during daylight.',
        keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature'],
        categories: ['Animals/Wildlife']
      }
    }, 'vektor.eps', { illustration: true })], 'shutterstock');
    const [head, line] = opt.split('\r\n');
    expect(head).toBe('"Filename","Description","Keywords","Categories","Illustration","Mature content","Editorial"');
    expect(line.endsWith('"Yes","No","No"')).toBe(true);
  });

  it('editorial aktif → kolom Editorial Yes; frame lain No', () => {
    const mk = (ed: boolean, name: string) => frame({
      shutterstock: {
        description: 'A red panda eats bamboo shoots in a green mountain forest during daylight.',
        keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature'],
        categories: ['Animals/Wildlife']
      }
    }, name, { editorial: ed });
    const csv = buildCsv([mk(true, 'a.jpg'), mk(false, 'b.jpg')], 'shutterstock');
    const rows = csv.split('\r\n');
    expect(rows[1].endsWith('"No","No","Yes"')).toBe(true);
    expect(rows[2].endsWith('"No","No","No"')).toBe(true);
  });

  it('RFC 4180: kutip di-escape ganda; sel berkoma di-quote', () => {
    const csv = buildCsv([frame({
      shutterstock: {
        description: 'Kabut "lembut" menyelimuti lembah, menenangkan setiap pengunjung pagi ini',
        keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature'],
        categories: ['Nature', 'People']
      }
    })], 'shutterstock');
    expect(csv).toContain('"Kabut ""lembut"" menyelimuti lembah, menenangkan setiap pengunjung pagi ini"');
    expect(csv).toContain('"Nature, People"');
  });

  it('sel berawalan = + - @ dinetralkan apostrof (netralisasi CSV-injection)', () => {
    const csv = buildCsv([frame({
      adobe: { ...goodAdobe, keywords: ['+sum(A1)', ...goodKws.slice(0, 24)] }
    }, '=evil.jpg')], 'adobe');
    expect(csv).toContain('"\'=evil.jpg"');
    expect(csv).toContain('"\'+sum(A1), red panda');
    expect(csv).not.toContain(',"=');
  });

  it('slot kosong → hanya header; dua slot terisi → hanya slot aktif', () => {
    expect(buildCsv([frame({})], 'adobe')).toBe('"Filename","Title","Keywords","Category","Releases"');
    const both = frame({
      adobe: goodAdobe,
      shutterstock: {
        description: 'A red panda eats bamboo shoots in a green mountain forest during daylight.',
        keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature'],
        categories: ['Nature']
      }
    });
    expect(buildCsv([both], 'adobe')).toContain('"Red panda eating bamboo in forest"');
    expect(buildCsv([both], 'adobe')).not.toContain('A red panda eats');
  });

  it('planCsv: nama file tanpa spasi + format tanggal; batas byte/baris dilaporkan', () => {
    const plan = planCsv([frame({ adobe: goodAdobe })], 'adobe');
    expect(plan.filename).toMatch(/^StockMeta_Adobe_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(plan.filename).not.toContain(' ');
    expect(plan.overBytes).toBe(false);
    expect(plan.overRows).toBe(false);
    expect(plan.bytes).toBeGreaterThan(0);
  });

  it('snapshot CSV kedua platform', () => {
    const adobeCsv = buildCsv([frame({ adobe: goodAdobe }, 'panda.jpeg')], 'adobe');
    expect(adobeCsv).toMatchSnapshot();
    const ssCsv = buildCsv([frame({
      shutterstock: {
        description: 'A red panda eats bamboo shoots in a green mountain forest during daylight.',
        keywords: ['red panda', 'bamboo', 'forest', 'eating', 'wildlife', 'mammal', 'nature'],
        categories: ['Animals/Wildlife']
      }
    }, 'panda.jpeg')], 'shutterstock');
    expect(ssCsv).toMatchSnapshot();
  });

  it('downloadCsv memakai BOM default + nama tanggal (di-mock)', () => {
    const urls: string[] = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((() => { urls.push('blob:x'); return 'blob:x'; }) as typeof URL.createObjectURL);
    URL.revokeObjectURL = (() => {}) as typeof URL.revokeObjectURL;
    let clicked = '';
    const origCreateEl = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      const el = origCreateEl(tag) as HTMLAnchorElement;
      if (tag === 'a') {
        el.click = () => { clicked = el.download; };
      }
      return el;
    }) as typeof document.createElement;
    try {
      downloadCsv([frame({ adobe: goodAdobe })], 'adobe');
      expect(clicked).toMatch(/^StockMeta_Adobe_/);
      expect(urls).toHaveLength(1);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      document.createElement = origCreateEl;
    }
  });
});
