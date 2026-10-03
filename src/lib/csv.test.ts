import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';
import type { Frame } from './types';

const frame = (metadata: Frame['metadata'], name = 'foto.jpg'): Frame => ({
  id: 1, name, thumb: '', tema: '',
  status: {
    adobe: metadata.adobe ? 'siap' : 'menunggu',
    shutterstock: metadata.shutterstock ? 'siap' : 'menunggu'
  },
  error: { adobe: '', shutterstock: '' },
  metadata
});

describe('buildCsv — spesifikasi resmi (M9a)', () => {
  it('adobe: header persis template, kategori jadi NOMOR, koma judul dipertahankan (M24), Releases kosong', () => {
    const csv = buildCsv([frame({
      adobe: {
        title: 'Kucing "merah", di meja',
        keywords: ['kucing', 'meja', 'lucu'],
        category: 'Animals'
      }
    }, 'kucing, "merah".jpg')], 'adobe');

    expect(csv).toBe(
      '"Filename","Title","Keywords","Category","Releases"\r\n'
      + '"kucing, ""merah"".jpg","Kucing ""merah"", di meja","kucing, meja, lucu","1",""'
    );
  });

  it('adobe: kategori belum dipilih → sel nomor kosong (bukan 0/undefined)', () => {
    const csv = buildCsv([frame({ adobe: { title: 'Judul', keywords: ['kata'], category: '' } })], 'adobe');
    expect(csv).toBe('"Filename","Title","Keywords","Category","Releases"\r\n"foto.jpg","Judul","kata","",""');
  });

  it('adobe: judul panjang TIDAK dipotong diam-diam (kelebihan 200 jadi saran validasi)', () => {
    const title = 'x'.repeat(250);
    const csv = buildCsv([frame({ adobe: { title, keywords: ['kata'], category: 'Food' } })], 'adobe');
    expect(csv).toContain(`"${title}"`);
  });

  it('shutterstock: header Filename,Description,Keywords,Categories; dua kategori satu sel', () => {
    const csv = buildCsv([frame({
      shutterstock: {
        description: 'Pemandangan "indah", berkabut',
        keywords: ['nature', 'forest'],
        categories: ['Nature', 'People']
      }
    })], 'shutterstock');

    expect(csv).toBe(
      '"Filename","Description","Keywords","Categories"\r\n'
      + '"foto.jpg","Pemandangan ""indah"", berkabut","nature, forest","Nature, People"'
    );
  });

  it('slot kosong / slot ada tapi tak berisi → baris dibuang, hanya header', () => {
    expect(buildCsv([frame({})], 'adobe')).toBe('"Filename","Title","Keywords","Category","Releases"');
    expect(buildCsv([frame({ adobe: { title: '', keywords: [], category: '' } })], 'adobe'))
      .toBe('"Filename","Title","Keywords","Category","Releases"');
  });

  it('dua slot terisi: hanya slot platform aktif yang terbawa', () => {
    const both = frame({
      adobe: { title: 'Judul A', keywords: ['a'], category: 'Animals' },
      shutterstock: { description: 'Deskripsi B', keywords: ['b'], categories: ['Nature'] }
    });
    const adobeCsv = buildCsv([both], 'adobe');
    expect(adobeCsv).toContain('"Judul A","a","1",""');
    expect(adobeCsv).not.toContain('Deskripsi B');
    const ssCsv = buildCsv([both], 'shutterstock');
    expect(ssCsv).toContain('"foto.jpg","Deskripsi B","b","Nature"');
    expect(ssCsv).not.toContain('Judul A');
  });

  it('frame kosong → hanya header (per platform)', () => {
    expect(buildCsv([], 'adobe')).toBe('"Filename","Title","Keywords","Category","Releases"');
    expect(buildCsv([], 'shutterstock')).toBe('"Filename","Description","Keywords","Categories"');
  });

  it('sel berawalan = + - @ dinetralkan apostrof (netralisasi CSV-injection)', () => {
    const csv = buildCsv([frame({
      adobe: { title: '=cmd|calc!A1', keywords: ['+sum(A1)'], category: 'Animals' }
    }, '=evil.jpg')], 'adobe');

    expect(csv).toContain('"\'=evil.jpg"');          // Filename
    expect(csv).toContain('"\'=cmd|calc!A1"');       // Title
    expect(csv).toContain('"\'+sum(A1)"');           // Keywords
    expect(csv).not.toContain(',"=');                // tak ada sel berbahaya tanpa guard
  });

  it('sel normal tanpa karakter berbahaya tidak kena guard', () => {
    const csv = buildCsv([frame({ adobe: { title: 'Kopi pagi di meja', keywords: ['kopi'], category: 'Animals' } })], 'adobe');
    expect(csv).toContain('"Kopi pagi di meja"');
    expect(csv).toContain('"foto.jpg"');
  });
});
