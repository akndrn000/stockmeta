import { describe, expect, it } from 'vitest';
import { ADOBE_CATEGORIES, SHUTTERSTOCK_CATEGORIES } from './categories';
import { MAX_DESCRIPTION, MAX_KEYWORDS_ADOBE, MAX_TITLE_CSV } from './limits';
import type { Observation } from './observation';
import {
  buildGroundingPrompt,
  buildMetadataPrompt,
  buildStageBPrompt,
  parseGroundingResponse,
  parseMetadataResponse
} from './prompt';

describe('buildMetadataPrompt', () => {
  it('adobe: platform target, aturan anti-generic, daftar kategori + format title', () => {
    const p = buildMetadataPrompt({ platform: 'adobe' });
    expect(p).toContain('Platform target: adobe');
    expect(p).toContain('ATURAN PENTING UNTUK TITLE/DESCRIPTION:');
    expect(p).toContain(ADOBE_CATEGORIES.join(', '));
    // M24 (koreksi M9a — contoh CSV resmi Adobe): judul maks 200 karakter, koma
    // dibiarkan, keywords maks 49 yang paling penting dulu
    expect(p).toContain(`"title": string maks ${MAX_TITLE_CSV} karakter`);
    expect(p).toContain(`maksimal ${MAX_KEYWORDS_ADOBE} kata`);
    expect(p).not.toContain('TANPA koma');
    expect(p).not.toContain('tanpa koma');
    expect(p.endsWith('Keluarkan HANYA JSON valid, tanpa teks tambahan, tanpa markdown code block.')).toBe(true);
  });

  it('shutterstock: daftar kategori sendiri + format description', () => {
    const p = buildMetadataPrompt({ platform: 'shutterstock' });
    expect(p).toContain('Platform target: shutterstock');
    expect(p).toContain(SHUTTERSTOCK_CATEGORIES.join(', '));
    expect(p).not.toContain(ADOBE_CATEGORIES.join(', '));
    // M28 (koreksi final — screenshot form asli): deskripsi minimal 5 kata,
    // maksimal 2048 karakter; rentang longgar tapi tetap satu-dua kalimat alami,
    // bukan daftar kata / teks bertele-tele
    expect(p).toContain('minimal 5 kata');
    expect(p).toContain(`maksimal ${MAX_DESCRIPTION} karakter`);
    expect(p).toContain('satu-dua kalimat');
    expect(p).toContain('BUKAN daftar kata');
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

  it('keyword dibatasi per platform (adobe 49, shutterstock 50) dan kategori array ambil yang pertama lolos', () => {
    const kw = Array.from({ length: 60 }, (_, i) => 'kata' + i);
    const p = parseMetadataResponse(JSON.stringify({ keywords: kw }), 'adobe');
    expect(p.keywords).toHaveLength(MAX_KEYWORDS_ADOBE);

    const s = parseMetadataResponse(JSON.stringify({ keywords: kw }), 'shutterstock');
    expect(s.keywords).toHaveLength(50);

    const c = parseMetadataResponse(JSON.stringify({ category: ['Food & Drink', 'zzz-none'] }), 'shutterstock');
    expect(c.category).toBe('Food and Drink');
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

  it('adobe: koma di judul dipertahankan (M24 — CSV di-quote, tak perlu dibersihkan)', () => {
    const p = parseMetadataResponse(JSON.stringify({ title: 'Kopi, susu, dan roti' }), 'adobe');
    expect(p.title).toBe('Kopi, susu, dan roti');
  });

  it('adobe: judul dibatasi 200 karakter', () => {
    const p = parseMetadataResponse(JSON.stringify({ title: 'Kopi, '.repeat(50) }), 'adobe');
    expect(p.title).toContain(',');
    expect(p.title!.length).toBeLessThanOrEqual(MAX_TITLE_CSV);
  });

  it('adobe: kategori ANGKA 1-21 dipetakan ke label resmi', () => {
    expect(parseMetadataResponse(JSON.stringify({ category: 13 }), 'adobe').category).toBe('People');
    expect(parseMetadataResponse(JSON.stringify({ category: 8 }), 'adobe').category).toBe('Graphic Resources');
    const bad = parseMetadataResponse(JSON.stringify({ category: 99 }), 'adobe');
    expect(bad.categoryAuto).toBe(true);
  });
});

describe('Tahap B — prompt dari observation (tanpa gambar)', () => {
  const obs: Observation = {
    media_type: 'photo',
    main_subject: 'red panda',
    secondary_subjects: ['bamboo'],
    people: { count: 0, recognizable_face: false, visible_actions: [] },
    setting: 'mountain forest',
    time_or_lighting: 'daylight',
    viewpoint_composition: [] as string[],
    colors: ['green'],
    mood_concepts: [] as string[],
    copy_space: false,
    isolated_background: false,
    visible_text: [] as string[],
    visible_brands_logos: [] as string[],
    landmarks_or_private_property: [] as string[],
    possible_ai_look: false,
    quality_issues: [] as string[],
    confidence: 0.9,
    theme_mismatch: false
  };

  it('adobe: aturan title/keyword/kategori + isi observasi, tanpa nama file', () => {
    const p = buildStageBPrompt('adobe', obs, null);
    expect(p).toContain('red panda');
    expect(p).toContain('TANPA koma');
    expect(p).toContain('TANPA awalan "photo of"');
    expect(p).toContain('ANGKA 1-21');
    expect(p).not.toContain('foto123.jpg');
  });

  it('shutterstock: satu kalimat + 1-2 nama persis + tanpa nama file', () => {
    const p = buildStageBPrompt('shutterstock', obs, 'Nature');
    expect(p).toContain('SATU kalimat natural');
    expect(p).toContain('1-2 nama PERSIS');
    expect(p).toContain('"Nature"');
    expect(p).not.toContain('foto123.jpg');
  });

  it('grounding: prompt + parser unsupported', () => {
    const g = buildGroundingPrompt(obs, ['red panda', 'bamboo']);
    expect(g).toContain('red panda');
    expect(parseGroundingResponse('```json\n{"unsupported": ["bamboo"]}\n```')).toEqual(['bamboo']);
    expect(() => parseGroundingResponse('{"unsupported": "bukan-array"}')).toThrow();
  });
});
