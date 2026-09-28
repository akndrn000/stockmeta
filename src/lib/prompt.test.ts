import { describe, expect, it } from 'vitest';
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from './categories';
import { MAX_TITLE_CSV } from './limits';
import { buildMetadataPrompt, parseMetadataResponse } from './prompt';

describe('buildMetadataPrompt', () => {
  it('adobe: platform target, aturan anti-generic, daftar kategori + format title', () => {
    const p = buildMetadataPrompt({ platform: 'adobe' });
    expect(p).toContain('Platform target: adobe');
    expect(p).toContain('ATURAN PENTING UNTUK TITLE/DESCRIPTION:');
    expect(p).toContain(ADOBE_CATEGORIES.join(', '));
    // M9a — spesifikasi resmi Adobe: judul maks 70 dan tanpa koma (penyimpangan dari legacy,
    // dicatat di docs/MIGRATION.md)
    expect(p).toContain(`"title": string maks ${MAX_TITLE_CSV} karakter dan TANPA koma`);
    expect(p).not.toContain('200 karakter');
    expect(p.endsWith('Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.')).toBe(true);
  });

  it('shutterstock: daftar kategori sendiri + format description', () => {
    const p = buildMetadataPrompt({ platform: 'shutterstock' });
    expect(p).toContain('Platform target: shutterstock');
    expect(p).toContain(SHUTTERSTOCK_CATEGORIES.join(', '));
    expect(p).not.toContain(ADOBE_CATEGORIES.join(', '));
    expect(p).toContain('kalimat deskriptif lengkap minimal 5 kata');
  });

  it('tema kosong: blok tema tidak dikirim sama sekali', () => {
    const p = buildMetadataPrompt({ platform: 'adobe', theme: '' });
    expect(p).not.toContain('Tema utama dari kontributor');
    expect(p).not.toContain('ABAIKAN tema ini');
  });

  it('tema terisi: tiga baris tema muncul', () => {
    const p = buildMetadataPrompt({ platform: 'adobe', theme: 'Halloween' });
    expect(p).toContain('Tema utama dari kontributor: "Halloween".');
    expect(p).toContain('KEMBANGKAN keyword dan title/description');
    expect(p).toContain('spooky, costume, pumpkin, trick-or-treat, bat, ghost');
    expect(p).toContain('ABAIKAN tema ini sepenuhnya');
  });
});

describe('parseMetadataResponse', () => {
  it('JSON ber-fence markdown: trim title, dedupe keyword, fuzz kategori', () => {
    const raw = '```json\n{"title":"  Kucing lucu  ","keywords":["kucing"," kucing ","meja","KUCING"],'
      + '"category":"buildings and architecture"}\n```';
    const p = parseMetadataResponse(raw, 'adobe');
    expect(p.title).toBe('Kucing lucu');
    expect(p.keywords).toEqual(['kucing', 'meja']);
    expect(p.category).toBe('Buildings and Architecture');
  });

  it('tanpa fence, teks di sekitar JSON, keyword string dipisah koma/titik koma', () => {
    const raw = 'Berikut hasilnya: {"keywords": "kucing; meja, kucing", "description": " Seekor kucing di meja "} — selesai';
    const p = parseMetadataResponse(raw, 'shutterstock');
    expect(p.keywords).toEqual(['kucing', 'meja']);
    expect(p.description).toBe('Seekor kucing di meja');
    expect(p.category).toBeUndefined();
  });

  it('JSON rusak / tanpa objek → Error "JSON tidak valid"', () => {
    expect(() => parseMetadataResponse('{"title": "x",}', 'adobe')).toThrow('JSON tidak valid');
    expect(() => parseMetadataResponse('bukan json sama sekali', 'adobe')).toThrow('JSON tidak valid');
  });

  it('keyword dibatasi 50 dan kategori array ambil yang pertama lolos', () => {
    const kw = Array.from({ length: 60 }, (_, i) => 'kata' + i);
    const p = parseMetadataResponse(JSON.stringify({ keywords: kw }), 'adobe');
    expect(p.keywords).toHaveLength(50);

    const s = parseMetadataResponse(JSON.stringify({ category: ['Food & Drink', 'zzz-none'] }), 'shutterstock');
    expect(s.category).toBe('Food and Drink');
  });

  it('kategori tanpa padanan tidak ditulis sama sekali', () => {
    const p = parseMetadataResponse(JSON.stringify({ category: 'zzzz qqqq' }), 'adobe');
    expect(p.category).toBeUndefined();
  });

  it('adobe: koma di judul diganti spasi', () => {
    const p = parseMetadataResponse(JSON.stringify({ title: 'Kopi, susu, dan roti' }), 'adobe');
    expect(p.title).toBe('Kopi susu dan roti');
  });

  it('adobe: judul dibatasi 70 karakter setelah koma dirapikan', () => {
    const p = parseMetadataResponse(JSON.stringify({ title: 'Kopi, '.repeat(20) }), 'adobe');
    expect(p.title).not.toContain(',');
    expect(p.title!.length).toBeLessThanOrEqual(MAX_TITLE_CSV);
  });
});
