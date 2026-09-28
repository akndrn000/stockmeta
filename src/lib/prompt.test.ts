import { describe, expect, it } from 'vitest';
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from './categories';
import { MAX_DESCRIPTION, MAX_TITLE_CSV } from './limits';
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
    // M11 (temuan layar): dorong deskripsi tetap dekat batas 200 karakter — instruksi saja,
    // tanpa memotong paksa di kode
    expect(p).toContain(`maksimal sekitar ${MAX_DESCRIPTION} karakter`);
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
    // M11: kategori kosong dari model tidak dibiarkan kosong — fallback + tanda periksa ulang
    expect(p.category).toBe(SHUTTERSTOCK_CATEGORIES[0]);
    expect(p.categoryAuto).toBe(true);
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

  it('kategori dari model tidak mirip → fallback kategori resmi pertama + tanda categoryAuto', () => {
    const p = parseMetadataResponse(JSON.stringify({ category: 'zzzz qqqq' }), 'adobe');
    expect(p.category).toBe(ADOBE_CATEGORIES[0]);
    expect(p.categoryAuto).toBe(true);
  });

  it('kategori cocok → tanpa tanda categoryAuto', () => {
    const p = parseMetadataResponse(JSON.stringify({ category: 'Animals' }), 'adobe');
    expect(p.category).toBe('Animals');
    expect(p.categoryAuto).toBeUndefined();
  });

  it('M11: key `categories` (Shutterstock) diterima sebagai alias `category`', () => {
    const p = parseMetadataResponse(JSON.stringify({ categories: ['Nature', 'Objects'] }), 'shutterstock');
    expect(p.category).toBe('Nature');
    expect(p.categoryAuto).toBeUndefined();
  });

  it('M11: kategori kosong/null dari model → fallback bertanda', () => {
    const empty = parseMetadataResponse(JSON.stringify({ category: '' }), 'adobe');
    expect(empty.category).toBe(ADOBE_CATEGORIES[0]);
    expect(empty.categoryAuto).toBe(true);

    const nulled = parseMetadataResponse(JSON.stringify({ category: null }), 'shutterstock');
    expect(nulled.category).toBe(SHUTTERSTOCK_CATEGORIES[0]);
    expect(nulled.categoryAuto).toBe(true);
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
